import { describe, expect, it } from "vitest";
import { agentBuildRoleOrchestrationContract } from "./agent";

describe("sdk/agent role contracts", () => {
  it("builds a default role orchestration contract from a prepared task contract", () => {
    const output = agentBuildRoleOrchestrationContract({
      taskContract: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-230100",
        taskId: "001",
        status: "authorized",
        title: "Define orchestration role contracts",
        objective: "Model role handoffs without adding a second lifecycle.",
        lane: "planned",
        trustLevel: "t1-scoped-edit",
        scope: {
          allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
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
        preparedAt: "2026-04-01T23:01:00.000Z",
      },
      createdAt: "2026-04-01T23:01:10.000Z",
    });

    expect(output.authorityModel).toBe("single-agent-lifecycle");
    expect(output.lifecycleModel).toBe("prepare-run-validate-reconcile");
    expect(output.roleContracts).toHaveLength(4);
    expect(output.handoffs).toHaveLength(3);
  });
});
