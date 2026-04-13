import {
  PrepareError,
  buildPromptContent,
  buildTaskContract,
  findTaskById,
  generateRunId,
  prepareAgentRunFromRecord,
  resolvePrepareContextEnrichment,
  type PrepareAgentRunResult,
} from "../core/agentRuntime/prepare";
import { pathExists } from "../utils/fs";
import {
  validateAgentRun,
  type ValidateAgentRunResult,
  type ValidateAgentRunOptions,
} from "../core/agentRuntime/validate";
import {
  reconcileAgentRun,
  type ReconcileAgentRunResult,
  type ReconcileAgentRunOptions,
} from "../core/agentRuntime/reconcile";
import {
  getAgentRunReview,
  type GetAgentRunReviewOptions,
  type GetAgentRunReviewResult,
} from "../core/agentRuntime/review";
import {
  appendAgentAuditEvent,
  readAgentAuditHistory,
  type AgentAuditEvent,
  type AgentAuditHistoryOptions,
  type AgentAuditHistoryResult,
} from "../core/agentRuntime/audit";
import {
  buildAgentRuntimeLaunchInput,
  createBootstrappedAgentRuntimeAdapterRegistry,
  createAgentRuntimeAdapterRegistry,
  listAgentRuntimeAdapters,
  registerAgentRuntimeAdapter,
  resolveAgentRuntimeAdapter,
  type AgentRuntimeAdapter,
  type AgentRuntimeAdapterRegistry,
} from "../core/agentRuntime/adapters";
import {
  runAgentTask,
  type AgentRunLaunchResult,
  type RunAgentTaskOptions,
} from "../core/agentRuntime/run";
import {
  buildAgentRoleOrchestrationContract,
  type BuildAgentRoleOrchestrationContractInput,
} from "../core/agentRuntime/roleContracts";
import {
  orchestrateAgentRun,
  type OrchestrateAgentRunOptions,
  type OrchestrateAgentRunResult,
} from "../core/agentRuntime/orchestration";
import {
  getAgentRunLaunchStatus,
  type AgentRunLaunchStatusResult,
  type GetAgentRunLaunchStatusOptions,
} from "../core/agentRuntime/runStatus";
import type { AgentRuntimeLaunchInput } from "../schemas/agentRuntimeAdapter";
import type { AgentRoleOrchestrationContract } from "../schemas/agentRoleOrchestration";
import type { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export interface AgentPrepareOptions {
  taskId: string;
  cwd?: string;
  check?: boolean;
  promptOnly?: boolean;
}

export interface AgentPrepareResult extends PrepareAgentRunResult {
  prompt?: string;
}

export type AgentPrepareFailureKind = "approval-required" | "ineligible" | "error";

export function classifyAgentPrepareFailure(message: string): AgentPrepareFailureKind {
  const normalized = message.toLowerCase();

  if (normalized.includes("paa013")) {
    return "approval-required";
  }

  if (
    normalized.includes("approval required") ||
    normalized.includes("requires explicit promotion")
  ) {
    return "approval-required";
  }

  if (normalized.includes("not authorized") || normalized.includes("not agent-executable")) {
    return "ineligible";
  }

  return "error";
}

export function getAgentPrepareExitCode(message: string): 1 | 2 {
  return classifyAgentPrepareFailure(message) === "approval-required" ? 2 : 1;
}

export type AgentValidateOptions = ValidateAgentRunOptions;
export type AgentValidateResult = ValidateAgentRunResult;
export type AgentValidateConsumerState =
  | "validation-failed"
  | "escalation-ready"
  | "validation-passed";
export type AgentReconcileOptions = ReconcileAgentRunOptions;
export type AgentReconcileResult = ReconcileAgentRunResult;
export type AgentReviewRunOptions = GetAgentRunReviewOptions;
export type AgentReviewRunResult = GetAgentRunReviewResult;
export type AgentAuditOptions = AgentAuditHistoryOptions;
export type AgentAuditResult = AgentAuditHistoryResult;
export type AgentAuditEntry = AgentAuditEvent;
export type AgentRuntimeRegistry = AgentRuntimeAdapterRegistry;
export type AgentRuntimeRegistryAdapter = AgentRuntimeAdapter;
export type AgentRuntimeLaunchContract = AgentRuntimeLaunchInput;
export type AgentRunOptions = RunAgentTaskOptions;
export type AgentRunResult = AgentRunLaunchResult;
export type AgentRunStatusOptions = GetAgentRunLaunchStatusOptions;
export type AgentRunStatusResult = AgentRunLaunchStatusResult;
export type AgentRoleOrchestrationOptions = BuildAgentRoleOrchestrationContractInput;
export type AgentRoleOrchestrationResult = AgentRoleOrchestrationContract;
export type AgentOrchestrateOptions = OrchestrateAgentRunOptions;
export type AgentOrchestrateResult = OrchestrateAgentRunResult;
export type AgentOrchestrateConsumerState =
  | "orchestration-in-progress"
  | "role-failure"
  | "follow-up-review"
  | "orchestration-completed";

export function classifyAgentValidateOutcome(
  result: AgentValidateResult,
): AgentValidateConsumerState {
  if (!result.ok) {
    return "validation-failed";
  }

  const escalationWarning = result.warnings.some((warning) => warning.code === "PAA007");
  if (escalationWarning) {
    return "escalation-ready";
  }

  return "validation-passed";
}

export function classifyAgentOrchestrateOutcome(
  result: AgentOrchestrateResult,
): AgentOrchestrateConsumerState {
  if (result.orchestrationStatus === "failed") {
    return "role-failure";
  }

  if (result.orchestrationStatus === "waiting-for-result-import") {
    return "follow-up-review";
  }

  if (result.orchestrationStatus === "completed") {
    return "orchestration-completed";
  }

  return "orchestration-in-progress";
}

export async function agentPrepare(
  input: AgentPrepareOptions,
): Promise<OperationResult<AgentPrepareResult>> {
  const cwd = input.cwd ?? process.cwd();
  try {
    const record = await findTaskById(input.taskId, cwd);

    if (!record) {
      throw new PrepareError(
        "PAA001",
        `Task ${input.taskId} was not found in the project. Check that the reference is a valid 3-digit task id or phase-id/milestone-id/task-id, and that the task file exists in a planned lane.`,
      );
    }

    const runId = generateRunId();

    if (input.promptOnly) {
      const summary = await prepareAgentRunFromRecord(record, {
        cwd,
        runId,
        check: true,
      });
      const shouldEnrichFromCanonicalState = await pathExists(record.filePath);
      const enrichedContext = shouldEnrichFromCanonicalState
        ? await resolvePrepareContextEnrichment(record, cwd)
        : undefined;
      const contract = buildTaskContract(record, runId, cwd, enrichedContext);
      const prompt = buildPromptContent(contract);

      await appendAgentAuditEvent(
        {
          command: "prepare",
          status: "success",
          runId,
          taskId: record.frontmatter.id,
          metadata: {
            mode: "prompt-only",
          },
        },
        cwd,
      );

      return {
        success: true,
        data: {
          ...summary,
          prompt,
        },
      };
    }

    const prepared = await prepareAgentRunFromRecord(record, {
      cwd,
      runId,
      check: input.check,
    });

    await appendAgentAuditEvent(
      {
        command: "prepare",
        status: "success",
        runId,
        taskId: record.frontmatter.id,
        metadata: {
          mode: input.check ? "check" : "write",
        },
      },
      cwd,
    );

    return {
      success: true,
      data: prepared,
    };
  } catch (error) {
    const message =
      error instanceof PrepareError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);

    await appendAgentAuditEvent(
      {
        command: "prepare",
        status: "error",
        runId: undefined,
        taskId: input.taskId,
        message,
        metadata: {
          mode: input.promptOnly ? "prompt-only" : input.check ? "check" : "write",
        },
      },
      cwd,
    ).catch(() => undefined);

    return {
      success: false,
      errors: [message],
    };
  }
}

export async function agentRun(input: AgentRunOptions): Promise<OperationResult<AgentRunResult>> {
  return wrap(async () => runAgentTask(input));
}

export async function agentRunStatus(
  input: AgentRunStatusOptions,
): Promise<OperationResult<AgentRunStatusResult>> {
  return wrap(async () => getAgentRunLaunchStatus(input));
}

export async function agentValidate(
  input: AgentValidateOptions,
): Promise<OperationResult<AgentValidateResult>> {
  return wrap(async () => validateAgentRun(input));
}

export async function agentReconcile(
  input: AgentReconcileOptions,
): Promise<OperationResult<AgentReconcileResult>> {
  return wrap(async () => reconcileAgentRun(input));
}

export async function agentReviewRun(
  input: AgentReviewRunOptions,
): Promise<OperationResult<AgentReviewRunResult>> {
  return wrap(async () => getAgentRunReview(input));
}

export async function agentAuditHistory(
  input: AgentAuditOptions,
): Promise<OperationResult<AgentAuditResult>> {
  return wrap(async () => readAgentAuditHistory(input));
}

export async function agentOrchestrate(
  input: AgentOrchestrateOptions,
): Promise<OperationResult<AgentOrchestrateResult>> {
  return wrap(async () => orchestrateAgentRun(input));
}

export function agentBuildRoleOrchestrationContract(
  input: AgentRoleOrchestrationOptions,
): AgentRoleOrchestrationResult {
  return buildAgentRoleOrchestrationContract(input);
}

export {
  buildAgentRuntimeLaunchInput,
  createBootstrappedAgentRuntimeAdapterRegistry,
  createAgentRuntimeAdapterRegistry,
  listAgentRuntimeAdapters,
  registerAgentRuntimeAdapter,
  resolveAgentRuntimeAdapter,
  buildAgentRoleOrchestrationContract,
};
