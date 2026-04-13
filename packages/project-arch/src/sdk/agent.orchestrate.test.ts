import { describe, expect, it } from "vitest";
import { agentOrchestrate, classifyAgentOrchestrateOutcome } from "./agent";

describe("sdk/agent orchestrate", () => {
  it("returns orchestration output with explicit role completion state", async () => {
    const result = await agentOrchestrate({
      taskId: "002",
      runtime: "codex-cli",
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-234000",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-234000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-234000.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
      launch: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-234000",
        taskId: "002",
        status: "launch-dispatched",
        runtime: "codex-cli",
        runHandle: "codex-cli:run-2026-04-01-234000",
        launchedAt: "2026-04-01T23:40:05.000Z",
        lifecycleBoundary: "prepare-first",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-234000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-234000.md",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-01-234000.json",
      }),
      loadTaskContract: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-234000",
        taskId: "002",
        status: "authorized",
        title: "Implement orchestration runtime flow",
        objective: "Coordinate role handoffs through lifecycle boundaries.",
        lane: "planned",
        trustLevel: "t1-scoped-edit",
        scope: {
          allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
          blockedPaths: [".github/**"],
          allowedOperations: ["read", "write", "create", "run-tests", "run-typecheck"],
          blockedOperations: [
            "install-dependency",
            "modify-ci",
            "change-public-api-without-decision",
          ],
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
        preparedAt: "2026-04-01T23:40:00.000Z",
      }),
      resultExists: async () => false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeDefined();
      if (!result.data) {
        throw new Error("Expected orchestration data for successful result.");
      }
      expect(result.data.status).toBe("orchestrated");
      expect(result.data.orchestrationStatus).toBe("waiting-for-result-import");
      expect(result.data.completedRoles).toEqual(["planner", "implementer"]);
      expect(result.data.nextAction).toBe("import-result-and-retry");
      expect(classifyAgentOrchestrateOutcome(result.data)).toBe("follow-up-review");
    }
  });

  it("classifies failed orchestration as role-failure", () => {
    const state = classifyAgentOrchestrateOutcome({
      schemaVersion: "2.0",
      runId: "run-2026-04-02-120000",
      taskId: "004",
      status: "orchestrated",
      orchestrationStatus: "failed",
      runtime: "codex-cli",
      orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-02-120000.json",
      completedRoles: ["planner"],
      failedRole: "implementer",
    });

    expect(state).toBe("role-failure");
  });
});
