import { describe, expect, it } from "vitest";
import { agentRoleOrchestrationContractSchema } from "./agentRoleOrchestration";

describe("schemas/agentRoleOrchestration", () => {
  const baseContract = {
    schemaVersion: "2.0" as const,
    runId: "run-2026-04-01-220001",
    taskId: "001",
    authorityModel: "single-agent-lifecycle" as const,
    lifecycleModel: "prepare-run-validate-reconcile" as const,
    roleContracts: [
      {
        role: "planner" as const,
        trustLevel: "t0-readonly" as const,
        operationProfile: "read-context" as const,
        outputBoundary: "prepare" as const,
        consumesArtifacts: ["task-contract" as const],
        producesArtifacts: ["prompt" as const],
        scopePaths: ["packages/project-arch/src/core/agentRuntime/"],
      },
      {
        role: "implementer" as const,
        trustLevel: "t1-scoped-edit" as const,
        operationProfile: "implement-within-scope" as const,
        outputBoundary: "validate" as const,
        consumesArtifacts: ["task-contract" as const, "prompt" as const],
        producesArtifacts: ["result-bundle" as const],
        scopePaths: ["packages/project-arch/src/core/agentRuntime/"],
      },
      {
        role: "reviewer" as const,
        trustLevel: "t0-readonly" as const,
        operationProfile: "validate-and-review" as const,
        outputBoundary: "reconcile" as const,
        consumesArtifacts: ["result-bundle" as const, "task-contract" as const],
        producesArtifacts: ["run-record" as const, "review-surface" as const],
        scopePaths: ["packages/project-arch/src/core/agentRuntime/"],
      },
      {
        role: "reconciler" as const,
        trustLevel: "t1-scoped-edit" as const,
        operationProfile: "reconcile-reporting" as const,
        outputBoundary: "reconcile" as const,
        consumesArtifacts: ["run-record" as const, "result-bundle" as const],
        producesArtifacts: ["reconciliation-report" as const],
        scopePaths: ["packages/project-arch/src/core/agentRuntime/"],
      },
    ],
    handoffs: [
      {
        fromRole: "planner" as const,
        toRole: "implementer" as const,
        lifecycleBoundary: "prepare" as const,
        requiredArtifacts: ["task-contract" as const, "prompt" as const],
        authorityModel: "single-agent-lifecycle" as const,
        trustBoundary: "inherit-authorized-task-scope" as const,
      },
      {
        fromRole: "implementer" as const,
        toRole: "reviewer" as const,
        lifecycleBoundary: "validate" as const,
        requiredArtifacts: ["result-bundle" as const, "task-contract" as const],
        authorityModel: "single-agent-lifecycle" as const,
        trustBoundary: "inherit-authorized-task-scope" as const,
      },
      {
        fromRole: "reviewer" as const,
        toRole: "reconciler" as const,
        lifecycleBoundary: "reconcile" as const,
        requiredArtifacts: ["run-record" as const, "review-surface" as const],
        authorityModel: "single-agent-lifecycle" as const,
        trustBoundary: "inherit-authorized-task-scope" as const,
      },
    ],
    createdAt: "2026-04-01T22:00:00.000Z",
  };

  it("accepts explicit planner, implementer, reviewer, and reconciler contracts", () => {
    const parsed = agentRoleOrchestrationContractSchema.parse(baseContract);
    expect(parsed.roleContracts).toHaveLength(4);
    expect(parsed.handoffs).toHaveLength(3);
  });

  it("rejects missing required lifecycle handoffs", () => {
    expect(() =>
      agentRoleOrchestrationContractSchema.parse({
        ...baseContract,
        handoffs: baseContract.handoffs.slice(1),
      }),
    ).toThrow(/planner->implementer/);
  });

  it("rejects role boundary drift that introduces a second lifecycle shape", () => {
    expect(() =>
      agentRoleOrchestrationContractSchema.parse({
        ...baseContract,
        roleContracts: baseContract.roleContracts.map((contract) =>
          contract.role === "implementer"
            ? { ...contract, outputBoundary: "prepare" as const }
            : contract,
        ),
      }),
    ).toThrow(/implementer must emit outputs at lifecycle boundary 'validate'/);
  });
});
