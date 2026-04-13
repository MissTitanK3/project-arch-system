import { describe, expect, it } from "vitest";
import {
  agentRun,
  createAgentRuntimeAdapterRegistry,
  registerAgentRuntimeAdapter,
  type AgentRuntimeRegistry,
} from "./agent";
import { createTempDir, resultAssertions } from "../test/helpers";

describe("sdk/agent run", () => {
  it("returns launch-dispatched run results through the SDK", async () => {
    const context = await createTempDir();
    const registry: AgentRuntimeRegistry = createAgentRuntimeAdapterRegistry();

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
        launchedAt: "2026-04-01T23:15:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    const result = await agentRun({
      taskId: "002",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-231500",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-231500.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-231500.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    resultAssertions.assertSuccess(result);
    expect(result.data.status).toBe("launch-dispatched");
    expect(result.data.runtime).toBe("codex-cli");
    expect(result.data.runHandle).toBe("codex-cli:run-2026-04-01-231500");

    await context.cleanup();
  });

  it("returns operation errors when launch fails", async () => {
    const context = await createTempDir();
    const registry = createAgentRuntimeAdapterRegistry();

    const result = await agentRun({
      taskId: "002",
      runtime: "missing-runtime",
      cwd: context.tempDir,
      adapterRegistry: registry,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-231501",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-231501.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-231501.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    resultAssertions.assertErrorContains(result, "PAA015");

    await context.cleanup();
  });
});
