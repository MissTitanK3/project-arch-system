import type { LocalTaskWorkflowAction, LocalTaskWorkflowState } from "./localTaskWorkflow";

export const LOCAL_WORKFLOW_STATUS_KEY = "projectArch.localWorkflow.status" as const;

export type LocalWorkflowPhase = "prepare" | "import" | "validate" | "reconcile" | "review";
export type LocalWorkflowStateName = "in-progress" | "completed" | "failed";

export interface LocalWorkflowStatus {
  action: LocalTaskWorkflowAction;
  taskRef: string;
  runId?: string;
  phase: LocalWorkflowPhase;
  state: LocalWorkflowStateName;
  canonicalOutcome:
    | "prepare-running"
    | "prepare-completed"
    | "import-running"
    | "import-completed"
    | "validate-running"
    | "validate-completed"
    | "reconcile-running"
    | "reconcile-completed"
    | "review-running"
    | "review-completed"
    | "authorization-failed"
    | "import-failed"
    | "validation-failed"
    | "reconcile-failed"
    | "review-failed"
    | "workflow-failed";
  message: string;
  nextStep?: string;
  updatedAt: string;
}

export interface LocalWorkflowStepEvent {
  action: LocalTaskWorkflowAction;
  taskRef: string;
  runId?: string;
  phase: Exclude<LocalWorkflowPhase, "review">;
  state: "started" | "completed";
  at: string;
}

function mapRunningOutcome(
  phase: Exclude<LocalWorkflowPhase, "review">,
): LocalWorkflowStatus["canonicalOutcome"] {
  if (phase === "prepare") {
    return "prepare-running";
  }
  if (phase === "import") {
    return "import-running";
  }
  if (phase === "validate") {
    return "validate-running";
  }
  return "reconcile-running";
}

function mapCompletedOutcome(
  phase: Exclude<LocalWorkflowPhase, "review">,
): LocalWorkflowStatus["canonicalOutcome"] {
  if (phase === "prepare") {
    return "prepare-completed";
  }
  if (phase === "import") {
    return "import-completed";
  }
  if (phase === "validate") {
    return "validate-completed";
  }
  return "reconcile-completed";
}

export function buildStatusFromStep(event: LocalWorkflowStepEvent): LocalWorkflowStatus {
  const state: LocalWorkflowStateName = event.state === "started" ? "in-progress" : "completed";
  const canonicalOutcome =
    event.state === "started" ? mapRunningOutcome(event.phase) : mapCompletedOutcome(event.phase);

  return {
    action: event.action,
    taskRef: event.taskRef,
    runId: event.runId,
    phase: event.phase,
    state,
    canonicalOutcome,
    message: `Local workflow ${event.phase} ${event.state} for task ${event.taskRef}${event.runId ? ` (${event.runId})` : ""}.`,
    updatedAt: event.at,
  };
}

function classifyFailureOutcome(input: {
  phase: LocalWorkflowPhase;
  message: string;
}): Pick<LocalWorkflowStatus, "canonicalOutcome" | "nextStep"> {
  const normalized = input.message.toLowerCase();

  if (normalized.includes("paa013") || normalized.includes("approval required")) {
    return {
      canonicalOutcome: "authorization-failed",
      nextStep: "Promote or authorize the task before rerunning the workflow.",
    };
  }

  if (input.phase === "import") {
    return {
      canonicalOutcome: "import-failed",
      nextStep: "Fix the result bundle path/content, then rerun Implement Task.",
    };
  }

  if (input.phase === "validate") {
    return {
      canonicalOutcome: "validation-failed",
      nextStep: "Inspect validation output and rerun validate/reconcile after fixes.",
    };
  }

  if (input.phase === "reconcile") {
    return {
      canonicalOutcome: "reconcile-failed",
      nextStep: "Resolve reconcile blockers, then rerun reconcile for this run.",
    };
  }

  if (input.phase === "review") {
    return {
      canonicalOutcome: "review-failed",
      nextStep: "Rebuild local workflow state and retry diff-first review.",
    };
  }

  return {
    canonicalOutcome: "workflow-failed",
    nextStep: "Review command output and retry from prepare.",
  };
}

export function buildFailureStatus(input: {
  action: LocalTaskWorkflowAction;
  taskRef: string;
  runId?: string;
  phase: LocalWorkflowPhase;
  message: string;
  at: string;
}): LocalWorkflowStatus {
  const classified = classifyFailureOutcome({
    phase: input.phase,
    message: input.message,
  });

  return {
    action: input.action,
    taskRef: input.taskRef,
    runId: input.runId,
    phase: input.phase,
    state: "failed",
    canonicalOutcome: classified.canonicalOutcome,
    message: input.message,
    nextStep: classified.nextStep,
    updatedAt: input.at,
  };
}

export function buildCompletedStatus(
  workflow: LocalTaskWorkflowState,
  at: string,
): LocalWorkflowStatus {
  if (workflow.action === "implement") {
    return {
      action: workflow.action,
      taskRef: workflow.taskRef,
      runId: workflow.runId,
      phase: "reconcile",
      state: "completed",
      canonicalOutcome: "reconcile-completed",
      message: `Local workflow completed for task ${workflow.taskRef} (${workflow.runId}) through reconcile.`,
      nextStep: "Review diffs before accepting repository changes.",
      updatedAt: at,
    };
  }

  return {
    action: workflow.action,
    taskRef: workflow.taskRef,
    runId: workflow.runId,
    phase: "prepare",
    state: "completed",
    canonicalOutcome: "prepare-completed",
    message: `Local workflow prepared task ${workflow.taskRef} (${workflow.runId}).`,
    nextStep: "Run Implement Task when runtime result bundle is ready.",
    updatedAt: at,
  };
}

export function formatStatusSummary(status: LocalWorkflowStatus): string {
  const next = status.nextStep ? ` Next: ${status.nextStep}` : "";
  return `Project Arch status: ${status.state} (${status.phase}) for task ${status.taskRef}${status.runId ? ` (${status.runId})` : ""}. ${status.message}${next}`;
}
