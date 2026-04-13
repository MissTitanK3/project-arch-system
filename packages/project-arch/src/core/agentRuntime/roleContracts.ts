import {
  agentRoleOrchestrationContractSchema,
  type AgentRoleOrchestrationContract,
  type AgentRoleContract,
  type AgentRoleHandoff,
} from "../../schemas/agentRoleOrchestration";
import type { AgentTaskContract } from "../../schemas/agentTaskContract";

export interface BuildAgentRoleOrchestrationContractInput {
  taskContract: AgentTaskContract;
  createdAt?: string;
  scopePaths?: string[];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildDefaultRoleContracts(
  scopePaths: string[],
  trustLevel: AgentTaskContract["trustLevel"],
): AgentRoleContract[] {
  return [
    {
      role: "planner",
      trustLevel: "t0-readonly",
      operationProfile: "read-context",
      outputBoundary: "prepare",
      consumesArtifacts: ["task-contract"],
      producesArtifacts: ["prompt"],
      scopePaths,
    },
    {
      role: "implementer",
      trustLevel,
      operationProfile: "implement-within-scope",
      outputBoundary: "validate",
      consumesArtifacts: ["task-contract", "prompt"],
      producesArtifacts: ["result-bundle"],
      scopePaths,
    },
    {
      role: "reviewer",
      trustLevel: "t0-readonly",
      operationProfile: "validate-and-review",
      outputBoundary: "reconcile",
      consumesArtifacts: ["result-bundle", "task-contract"],
      producesArtifacts: ["run-record", "review-surface"],
      scopePaths,
    },
    {
      role: "reconciler",
      trustLevel: "t1-scoped-edit",
      operationProfile: "reconcile-reporting",
      outputBoundary: "reconcile",
      consumesArtifacts: ["run-record", "result-bundle", "review-surface"],
      producesArtifacts: ["reconciliation-report", "escalation-draft"],
      scopePaths,
    },
  ];
}

function buildDefaultRoleHandoffs(): AgentRoleHandoff[] {
  return [
    {
      fromRole: "planner",
      toRole: "implementer",
      lifecycleBoundary: "prepare",
      requiredArtifacts: ["task-contract", "prompt"],
      authorityModel: "single-agent-lifecycle",
      trustBoundary: "inherit-authorized-task-scope",
    },
    {
      fromRole: "implementer",
      toRole: "reviewer",
      lifecycleBoundary: "validate",
      requiredArtifacts: ["result-bundle", "task-contract"],
      authorityModel: "single-agent-lifecycle",
      trustBoundary: "inherit-authorized-task-scope",
    },
    {
      fromRole: "reviewer",
      toRole: "reconciler",
      lifecycleBoundary: "reconcile",
      requiredArtifacts: ["run-record", "review-surface", "result-bundle"],
      authorityModel: "single-agent-lifecycle",
      trustBoundary: "inherit-authorized-task-scope",
    },
  ];
}

export function buildAgentRoleOrchestrationContract(
  input: BuildAgentRoleOrchestrationContractInput,
): AgentRoleOrchestrationContract {
  const scopePaths = uniqueSorted(input.scopePaths ?? input.taskContract.scope.allowedPaths);

  return agentRoleOrchestrationContractSchema.parse({
    schemaVersion: input.taskContract.schemaVersion,
    runId: input.taskContract.runId,
    taskId: input.taskContract.taskId,
    authorityModel: "single-agent-lifecycle",
    lifecycleModel: "prepare-run-validate-reconcile",
    roleContracts: buildDefaultRoleContracts(scopePaths, input.taskContract.trustLevel),
    handoffs: buildDefaultRoleHandoffs(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function asAgentRoleOrchestrationContract(
  input: AgentRoleOrchestrationContract,
): AgentRoleOrchestrationContract {
  return agentRoleOrchestrationContractSchema.parse(input);
}
