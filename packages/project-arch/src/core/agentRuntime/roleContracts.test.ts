import { describe, expect, it } from "vitest";
import { buildAgentRoleOrchestrationContract } from "./roleContracts";

describe("core/agentRuntime/roleContracts", () => {
  it("builds planner, implementer, reviewer, and reconciler contracts from one task contract", () => {
    const orchestration = buildAgentRoleOrchestrationContract({
      taskContract: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-230001",
        taskId: "001",
        status: "authorized",
        title: "Define orchestration role contracts",
        objective: "Model role handoffs without adding a second lifecycle.",
        lane: "planned",
        trustLevel: "t1-scoped-edit",
        scope: {
          allowedPaths: [
            "packages/project-arch/src/core/agentRuntime/",
            "packages/project-arch/src/schemas/",
          ],
          blockedPaths: [".github/**"],
          allowedOperations: ["read", "write", "run-tests", "run-typecheck"],
          blockedOperations: ["install-dependency"],
        },
        architectureContext: {
          projectId: "shared",
          phaseId: "phase-agent-control-plane",
          milestoneId: "milestone-4-multi-agent-orchestration-and-role-contracts",
          taskPath:
            "feedback/phases/phase-agent-control-plane/milestones/milestone-4-multi-agent-orchestration-and-role-contracts/tasks/planned/001-define-multi-agent-role-contracts-and-handoff-model.md",
          relatedDecisions: [],
          relevantDocs: ["feedback/3-agent-control-plane-rfc.md"],
          relevantSkills: [],
        },
        successCriteria: ["Explicit role contracts exist."],
        verification: {
          commands: ["pnpm --filter project-arch test"],
          requiredEvidence: ["role-contract-tests"],
        },
        escalationRules: ["public-contract-change"],
        preparedAt: "2026-04-01T23:00:00.000Z",
      },
      createdAt: "2026-04-01T23:00:10.000Z",
    });

    expect(orchestration.roleContracts.map((entry) => entry.role)).toEqual([
      "planner",
      "implementer",
      "reviewer",
      "reconciler",
    ]);
    expect(orchestration.handoffs.map((entry) => `${entry.fromRole}->${entry.toRole}`)).toEqual([
      "planner->implementer",
      "implementer->reviewer",
      "reviewer->reconciler",
    ]);
    expect(orchestration.authorityModel).toBe("single-agent-lifecycle");
    expect(orchestration.lifecycleModel).toBe("prepare-run-validate-reconcile");
  });
});
