import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { orchestrateAgentRun, readOrchestrationRecord } from "./orchestration";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.remove(root)));
  tempRoots.length = 0;
});

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-agent-orchestrate-"));
  tempRoots.push(root);
  return root;
}

function makeTaskContract(runId: string, taskId = "002") {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId,
    status: "authorized" as const,
    title: "Implement orchestration runtime flow",
    objective: "Coordinate role handoffs through lifecycle boundaries.",
    lane: "planned" as const,
    trustLevel: "t1-scoped-edit" as const,
    scope: {
      allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      blockedPaths: [".github/**"],
      allowedOperations: ["read", "write", "create", "run-tests", "run-typecheck"],
      blockedOperations: ["install-dependency", "modify-ci", "change-public-api-without-decision"],
    },
    architectureContext: {
      projectId: "shared",
      phaseId: "phase-agent-control-plane",
      milestoneId: "milestone-4-multi-agent-orchestration-and-role-contracts",
      taskPath:
        "feedback/phases/phase-agent-control-plane/milestones/milestone-4-multi-agent-orchestration-and-role-contracts/tasks/planned/002-implement-multi-agent-orchestration-runtime-flow.md",
      relatedDecisions: [],
      relevantDocs: ["feedback/3-agent-control-plane-rfc.md"],
      relevantSkills: [],
    },
    successCriteria: ["Orchestration remains lifecycle-bounded."],
    verification: {
      commands: ["pnpm --filter project-arch test"],
      requiredEvidence: ["role-handoff-state"],
    },
    escalationRules: ["public-contract-change"],
    preparedAt: "2026-04-01T23:30:00.000Z",
  };
}

describe("core/agentRuntime/orchestration", () => {
  it("persists explicit role handoffs and waits when result bundle is not imported yet", async () => {
    const cwd = await makeTempRoot();
    const runId = "run-2026-04-01-233000";

    await fs.ensureDir(path.join(cwd, ".project-arch/agent-runtime/contracts"));
    await fs.writeJson(
      path.join(cwd, ".project-arch/agent-runtime/contracts", `${runId}.json`),
      makeTaskContract(runId),
      { spaces: 2 },
    );

    const output = await orchestrateAgentRun({
      taskId: "002",
      runtime: "codex-cli",
      cwd,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "prepared",
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
      launch: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "launch-dispatched",
        runtime: "codex-cli",
        runHandle: `codex-cli:${runId}`,
        launchedAt: "2026-04-01T23:30:05.000Z",
        lifecycleBoundary: "prepare-first",
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
      }),
      resultExists: async () => false,
    });

    expect(output.orchestrationStatus).toBe("waiting-for-result-import");
    expect(output.nextAction).toBe("import-result-and-retry");
    expect(output.completedRoles).toEqual(["planner", "implementer"]);

    const persisted = await readOrchestrationRecord(runId, cwd);
    expect(persisted.status).toBe("waiting-for-result-import");
    expect(persisted.roles.find((role) => role.role === "reviewer")?.status).toBe("waiting-input");
    expect(persisted.auditTrail.length).toBeGreaterThan(0);
    expect(persisted.auditTrail.map((event) => event.sequence)).toEqual(
      persisted.auditTrail.map((_, index) => index + 1),
    );
    expect(persisted.auditTrail.some((event) => event.kind === "role-transition")).toBe(true);
    expect(persisted.auditTrail.some((event) => event.kind === "handoff-outcome")).toBe(true);
    expect(
      persisted.auditTrail.some(
        (event) =>
          event.kind === "orchestration-status" && event.toStatus === "waiting-for-result-import",
      ),
    ).toBe(true);
  });

  it("completes planner->implementer->reviewer->reconciler with lifecycle reuse", async () => {
    const cwd = await makeTempRoot();
    const runId = "run-2026-04-01-233100";

    await fs.ensureDir(path.join(cwd, ".project-arch/agent-runtime/contracts"));
    await fs.writeJson(
      path.join(cwd, ".project-arch/agent-runtime/contracts", `${runId}.json`),
      makeTaskContract(runId),
      { spaces: 2 },
    );

    const output = await orchestrateAgentRun({
      taskId: "002",
      runtime: "codex-cli",
      cwd,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "prepared",
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
      launch: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "launch-dispatched",
        runtime: "codex-cli",
        runHandle: `codex-cli:${runId}`,
        launchedAt: "2026-04-01T23:31:05.000Z",
        lifecycleBoundary: "prepare-first",
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
      }),
      resultExists: async () => true,
      validate: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "validation-passed",
        ok: true,
        validatedAt: "2026-04-01T23:31:10.000Z",
        violations: [],
        warnings: [],
        checksRun: ["scope"],
        runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
      }),
      reconcile: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "reconciled",
        reconciliationStatus: "completed",
        reportPath: ".project-arch/reconcile/002-2026-04-01.json",
        reportMarkdownPath: ".project-arch/reconcile/002-2026-04-01.md",
        runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
        apply: false,
        createDiscovered: false,
        escalationDraftPaths: [],
      }),
    });

    expect(output.orchestrationStatus).toBe("completed");
    expect(output.completedRoles).toEqual(["planner", "implementer", "reviewer", "reconciler"]);
    expect(output.reconciliationReportPath).toBe(".project-arch/reconcile/002-2026-04-01.json");
  });

  it("records reviewer failure when validation fails and blocks reconcile handoff", async () => {
    const cwd = await makeTempRoot();
    const runId = "run-2026-04-01-233200";

    await fs.ensureDir(path.join(cwd, ".project-arch/agent-runtime/contracts"));
    await fs.writeJson(
      path.join(cwd, ".project-arch/agent-runtime/contracts", `${runId}.json`),
      makeTaskContract(runId),
      { spaces: 2 },
    );

    const output = await orchestrateAgentRun({
      taskId: "002",
      runtime: "codex-cli",
      cwd,
      prepare: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "prepared",
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
      launch: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "launch-dispatched",
        runtime: "codex-cli",
        runHandle: `codex-cli:${runId}`,
        launchedAt: "2026-04-01T23:32:05.000Z",
        lifecycleBoundary: "prepare-first",
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
      }),
      resultExists: async () => true,
      validate: async () => ({
        schemaVersion: "2.0",
        runId,
        taskId: "002",
        status: "validation-failed",
        ok: false,
        validatedAt: "2026-04-01T23:32:10.000Z",
        violations: [
          {
            code: "PAA003",
            severity: "error",
            message: "Changed file is outside allowed paths.",
          },
        ],
        warnings: [],
        checksRun: ["scope"],
        runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
      }),
    });

    expect(output.orchestrationStatus).toBe("failed");
    expect(output.failedRole).toBe("reviewer");

    const persisted = await readOrchestrationRecord(runId, cwd);
    const reviewToReconcile = persisted.handoffs.find(
      (handoff) => handoff.fromRole === "reviewer" && handoff.toRole === "reconciler",
    );
    expect(reviewToReconcile?.status).toBe("failed");
    expect(
      persisted.auditTrail.some(
        (event) => event.kind === "orchestration-status" && event.toStatus === "failed",
      ),
    ).toBe(true);
  });
});
