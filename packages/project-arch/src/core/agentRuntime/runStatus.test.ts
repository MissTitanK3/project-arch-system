import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "path";
import {
  createAgentRuntimeAdapterRegistry,
  registerAgentRuntimeAdapter,
  type AgentRuntimeAdapterRegistry,
} from "./adapters";
import { writeAgentRunRecord } from "./runRecord";
import { runAgentTask, launchRecordAbsPath, agentRunLaunchRecordSchema } from "./run";
import { getAgentRunLaunchStatus } from "./runStatus";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { writeJsonDeterministic } from "../../utils/fs";
import { orchestrationRecordPath } from "./orchestration";

const BASE_RUN_RECORD = {
  schemaVersion: "2.0" as const,
  ok: true,
  status: "validation-passed" as const,
  validatedAt: "2026-04-02T10:00:00.000Z",
  violations: [],
  warnings: [],
  checksRun: ["CHK001: Scope check"],
  resultPath: ".project-arch/agent-runtime/runs/run-2026-04-02-100000.json",
  reconciliationStatus: "not-run" as const,
};

describe("core/agentRuntime/runStatus – getAgentRunLaunchStatus", () => {
  let context: TestProjectContext;
  let registry: AgentRuntimeAdapterRegistry;

  beforeEach(async () => {
    context = await createTempDir();
    registry = createAgentRuntimeAdapterRegistry();

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
        launchedAt: "2026-04-02T10:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns pre-launch phase when no launch record exists", async () => {
    const result = await getAgentRunLaunchStatus({
      runId: "run-2026-04-02-100000",
      cwd: context.tempDir,
    });

    expect(result.phase).toBe("pre-launch");
    expect(result.runId).toBe("run-2026-04-02-100000");
    expect(result.runRecordExists).toBe(false);
    expect(result.launchRecord).toBeUndefined();
    expect(result.runHandle).toBeUndefined();
    expect(result.runReviewStatus).toBeUndefined();
    expect(result.status).toBe("launch-status");
    expect(result.lifecycleBoundary).toBe("prepare-first");
  });

  it("returns launch-dispatched phase when launch record exists but no run record", async () => {
    await runAgentTask({
      taskId: "002",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-02-100001",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-100001.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-100001.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    const result = await getAgentRunLaunchStatus({
      runId: "run-2026-04-02-100001",
      cwd: context.tempDir,
    });

    expect(result.phase).toBe("launch-dispatched");
    expect(result.runRecordExists).toBe(false);
    expect(result.runHandle).toBe("codex-cli:run-2026-04-02-100001");
    expect(result.runtime).toBe("codex-cli");
    expect(result.launchRecord).toBeDefined();
    expect(result.launchRecordPath).toMatch(/launches\/run-2026-04-02-100001\.json$/);
    expect(result.runReviewStatus).toBeUndefined();
  });

  it("returns post-launch phase when both launch record and run record exist", async () => {
    await runAgentTask({
      taskId: "002",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-02-100002",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-100002.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-100002.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    await writeAgentRunRecord(
      {
        ...BASE_RUN_RECORD,
        runId: "run-2026-04-02-100002",
        taskId: "002",
        resultPath: ".project-arch/agent-runtime/runs/run-2026-04-02-100002.json",
      },
      context.tempDir,
    );

    const result = await getAgentRunLaunchStatus({
      runId: "run-2026-04-02-100002",
      cwd: context.tempDir,
    });

    expect(result.phase).toBe("post-launch");
    expect(result.runRecordExists).toBe(true);
    expect(result.runHandle).toBe("codex-cli:run-2026-04-02-100002");
    expect(result.runReviewStatus).toBe("validation-passed-awaiting-reconcile");
    expect(result.runRecordPath).toMatch(/runs\/run-2026-04-02-100002\.json$/);
    expect(result.orchestrationRecordExists).toBe(false);
  });

  it("exposes optional orchestration persistence state when present", async () => {
    const runId = "run-2026-04-02-100004";

    await runAgentTask({
      taskId: "002",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-100004.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-100004.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    await writeJsonDeterministic(orchestrationRecordPath(runId, context.tempDir), {
      schemaVersion: "2.0",
      runId,
      taskId: "002",
      runtime: "codex-cli",
      lifecycleModel: "prepare-run-validate-reconcile",
      status: "waiting-for-result-import",
      roles: [
        {
          role: "planner",
          status: "completed",
          startedAt: "2026-04-02T10:10:00.000Z",
          completedAt: "2026-04-02T10:10:01.000Z",
        },
        {
          role: "implementer",
          status: "completed",
          startedAt: "2026-04-02T10:10:02.000Z",
          completedAt: "2026-04-02T10:10:03.000Z",
        },
        {
          role: "reviewer",
          status: "waiting-input",
          startedAt: "2026-04-02T10:10:04.000Z",
          completedAt: "2026-04-02T10:10:04.000Z",
        },
        { role: "reconciler", status: "pending" },
      ],
      handoffs: [
        {
          fromRole: "planner",
          toRole: "implementer",
          lifecycleBoundary: "prepare",
          requiredArtifacts: ["task-contract", "prompt"],
          authorityModel: "single-agent-lifecycle",
          trustBoundary: "inherit-authorized-task-scope",
          status: "completed",
          checkedAt: "2026-04-02T10:10:01.000Z",
        },
        {
          fromRole: "implementer",
          toRole: "reviewer",
          lifecycleBoundary: "validate",
          requiredArtifacts: ["result-bundle", "task-contract"],
          authorityModel: "single-agent-lifecycle",
          trustBoundary: "inherit-authorized-task-scope",
          status: "waiting-input",
          checkedAt: "2026-04-02T10:10:04.000Z",
          missingArtifacts: ["result-bundle"],
        },
        {
          fromRole: "reviewer",
          toRole: "reconciler",
          lifecycleBoundary: "reconcile",
          requiredArtifacts: ["run-record", "review-surface", "result-bundle"],
          authorityModel: "single-agent-lifecycle",
          trustBoundary: "inherit-authorized-task-scope",
          status: "pending",
        },
      ],
      artifacts: {
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-100004.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-100004.md",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-02-100004.json",
      },
      auditTrail: [
        {
          sequence: 1,
          occurredAt: "2026-04-02T10:10:01.000Z",
          kind: "role-transition",
          role: "planner",
          fromStatus: "pending",
          toStatus: "completed",
        },
      ],
      createdAt: "2026-04-02T10:10:00.000Z",
      updatedAt: "2026-04-02T10:10:04.000Z",
    });

    const result = await getAgentRunLaunchStatus({ runId, cwd: context.tempDir });

    expect(result.orchestrationRecordExists).toBe(true);
    expect(result.orchestrationStatus).toBe("waiting-for-result-import");
    expect(result.orchestrationCompletedRoles).toEqual(["planner", "implementer"]);
    expect(result.orchestrationPath).toMatch(/orchestration\/run-2026-04-02-100004\.json$/);
  });

  it("returns launch-failed phase when launch record has failed status", async () => {
    const launchRecord = agentRunLaunchRecordSchema.parse({
      schemaVersion: "2.0",
      runId: "run-2026-04-02-100003",
      taskId: "002",
      runtime: "codex-cli",
      status: "launch-failed",
      contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-100003.json",
      promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-100003.md",
      allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      requestedAt: "2026-04-02T10:00:03.000Z",
      lifecycleBoundary: "prepare-first",
      failedAt: "2026-04-02T10:00:04.000Z",
      error: "Adapter timeout after 5000ms",
    });

    const recordPath = launchRecordAbsPath("run-2026-04-02-100003", context.tempDir);
    await fs.ensureDir(path.dirname(recordPath));
    await fs.writeJson(recordPath, launchRecord, { spaces: 2 });

    const result = await getAgentRunLaunchStatus({
      runId: "run-2026-04-02-100003",
      cwd: context.tempDir,
    });

    expect(result.phase).toBe("launch-failed");
    expect(result.runRecordExists).toBe(false);
    expect(result.launchRecord?.status).toBe("launch-failed");
    expect(result.launchRecord?.error).toBe("Adapter timeout after 5000ms");
    expect(result.runHandle).toBeUndefined();
  });

  it("exposes launchedAt and taskId from the launch record", async () => {
    await runAgentTask({
      taskId: "003",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      requestedAt: "2026-04-02T10:05:00.000Z",
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-02-100500",
        taskId: "003",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-100500.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-100500.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    const result = await getAgentRunLaunchStatus({
      runId: "run-2026-04-02-100500",
      cwd: context.tempDir,
    });

    expect(result.taskId).toBe("003");
    expect(result.launchedAt).toBe("2026-04-02T10:00:00.000Z");
    expect(result.phase).toBe("launch-dispatched");
  });
});
