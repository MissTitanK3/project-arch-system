import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgentRuntimeAdapterRegistry,
  registerAgentRuntimeAdapter,
  type AgentRuntimeAdapterRegistry,
} from "./adapters";
import { readAgentAuditHistory } from "./audit";
import { runAgentTask } from "./run";
import { createTempDir, type TestProjectContext } from "../../test/helpers";

describe("core/agentRuntime/run", () => {
  let context: TestProjectContext;
  let registry: AgentRuntimeAdapterRegistry;

  beforeEach(async () => {
    context = await createTempDir();
    registry = createAgentRuntimeAdapterRegistry();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("launches prepared runs through the selected adapter and writes durable launch state", async () => {
    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        runId: input.runId,
        taskId: input.taskId,
        status: "launch-dispatched",
        runHandle: `codex-cli:${input.runId}`,
        launchedAt: "2026-04-01T23:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    const result = await runAgentTask({
      taskId: "002",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      requestedAt: "2026-04-01T23:00:01.000Z",
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-230000",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-230000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-230000.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    expect(result.status).toBe("launch-dispatched");
    expect(result.runtime).toBe("codex-cli");
    expect(result.runHandle).toBe("codex-cli:run-2026-04-01-230000");
    expect(result.launchRecordPath).toBe(
      ".project-arch/agent-runtime/launches/run-2026-04-01-230000.json",
    );

    const launchRecord = await fs.readJson(path.join(context.tempDir, result.launchRecordPath));
    expect(launchRecord.status).toBe("launch-dispatched");
    expect(launchRecord.runtime).toBe("codex-cli");
    expect(launchRecord.requestedAt).toBe("2026-04-01T23:00:01.000Z");

    const audit = await readAgentAuditHistory({
      cwd: context.tempDir,
      runId: "run-2026-04-01-230000",
    });
    expect(audit.total).toBe(1);
    expect(audit.events[0]?.command).toBe("run");
    expect(audit.events[0]?.status).toBe("success");
  });

  it("writes failed launch records and audit events when runtime adapter is missing", async () => {
    await expect(
      runAgentTask({
        taskId: "002",
        runtime: "missing-runtime",
        cwd: context.tempDir,
        adapterRegistry: registry,
        prepare: async () => ({
          schemaVersion: "2.0",
          runId: "run-2026-04-01-230100",
          taskId: "002",
          status: "prepared",
          contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-230100.json",
          promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-230100.md",
          allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
        }),
      }),
    ).rejects.toThrow("PAA015");

    const launchRecordPath = path.join(
      context.tempDir,
      ".project-arch/agent-runtime/launches/run-2026-04-01-230100.json",
    );
    const launchRecord = await fs.readJson(launchRecordPath);
    expect(launchRecord.status).toBe("launch-failed");
    expect(String(launchRecord.error)).toContain("PAA015");

    const audit = await readAgentAuditHistory({
      cwd: context.tempDir,
      runId: "run-2026-04-01-230100",
    });
    expect(audit.total).toBe(1);
    expect(audit.events[0]?.command).toBe("run");
    expect(audit.events[0]?.status).toBe("error");
  });

  it("writes failed launch records when adapter launch throws", async () => {
    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => {
        throw new Error("adapter launch crashed");
      },
    });

    await expect(
      runAgentTask({
        taskId: "002",
        runtime: "codex-cli",
        cwd: context.tempDir,
        adapterRegistry: registry,
        prepare: async () => ({
          schemaVersion: "2.0",
          runId: "run-2026-04-01-230200",
          taskId: "002",
          status: "prepared",
          contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-230200.json",
          promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-230200.md",
          allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
        }),
      }),
    ).rejects.toThrow("PAA016");

    const launchRecordPath = path.join(
      context.tempDir,
      ".project-arch/agent-runtime/launches/run-2026-04-01-230200.json",
    );
    const launchRecord = await fs.readJson(launchRecordPath);
    expect(launchRecord.status).toBe("launch-failed");
    expect(String(launchRecord.error)).toContain("adapter launch crashed");
  });
});
