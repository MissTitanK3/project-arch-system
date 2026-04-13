import type { WebviewToHostMessage } from "./types";

type RunCommandMessage = Extract<WebviewToHostMessage, { type: "runCommand" }>;
type LaunchTaskMessage = Extract<WebviewToHostMessage, { type: "launchTask" }>;
type CreateDiscoveredFromSelectedTaskMessage = Extract<
  WebviewToHostMessage,
  { type: "createDiscoveredFromSelectedTask" }
>;
type CreateLaneTaskMessage = Extract<WebviewToHostMessage, { type: "createLaneTask" }>;
type StageChatCommandMessage = Extract<WebviewToHostMessage, { type: "stageChatCommand" }>;
type StageChatSendIntentMessage = Extract<WebviewToHostMessage, { type: "stageChatSendIntent" }>;
type StageChatStopResponseMessage = Extract<
  WebviewToHostMessage,
  { type: "stageChatStopResponse" }
>;
type UpdateWorkflowChecklistItemMessage = Extract<
  WebviewToHostMessage,
  { type: "updateWorkflowChecklistItem" }
>;
type OpenArtifactInspectorMessage = Extract<
  WebviewToHostMessage,
  { type: "openArtifactInspector" }
>;

export interface ExperimentalTaskContext {
  phaseId: string;
  milestoneId: string;
  lane: "planned" | "discovered" | "backlog";
  taskId: string;
}

export interface ExperimentalCommandStagingAction {
  id:
    | "agent-orchestrate"
    | "agent-run"
    | "agent-status"
    | "agent-validate"
    | "agent-reconcile"
    | "result-import";
  label: string;
  command: string;
}

export interface ExperimentalWorkflowStageSummary {
  id: string;
  title: string;
}

export interface ExperimentalTaskWorkflowContext {
  taskRef: string;
  taskContext: ExperimentalTaskContext;
}

const TASK_PATH_PATTERN =
  /(?:^|\/)phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/(planned|discovered|backlog)\/([0-9]{3})-[^/]+[.](md|markdown)$/i;

export function parseTaskContext(relativePath: string): ExperimentalTaskContext | undefined {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  const match = normalized.match(TASK_PATH_PATTERN);
  if (!match) {
    return undefined;
  }

  const lane = (match[3] ?? "").toLowerCase();
  if (lane !== "planned" && lane !== "discovered" && lane !== "backlog") {
    return undefined;
  }

  return {
    phaseId: match[1] ?? "",
    milestoneId: match[2] ?? "",
    lane,
    taskId: match[4] ?? "",
  };
}

function toScopedTaskRef(taskContext: ExperimentalTaskContext): string {
  return `${taskContext.phaseId}/${taskContext.milestoneId}/${taskContext.taskId}`;
}

export function resolveTaskWorkflowContext(
  relativePath: string,
): ExperimentalTaskWorkflowContext | undefined {
  const taskContext = parseTaskContext(relativePath);
  if (!taskContext) {
    return undefined;
  }

  return {
    taskRef: toScopedTaskRef(taskContext),
    taskContext,
  };
}

export function buildCommandStagingActions(
  relativePath: string,
): ExperimentalCommandStagingAction[] {
  const workflowContext = resolveTaskWorkflowContext(relativePath);
  if (!workflowContext) {
    return [];
  }

  const scopedTaskRef = workflowContext.taskRef;
  return [
    {
      id: "agent-orchestrate",
      label: "Stage agent orchestrate",
      command: `pa agent orchestrate ${scopedTaskRef} --runtime <runtime> --json --timeout-ms <ms>`,
    },
    {
      id: "agent-run",
      label: "Stage agent run",
      command: `pa agent run ${scopedTaskRef} --runtime <runtime> --json --timeout-ms <ms>`,
    },
    {
      id: "agent-status",
      label: "Stage agent status",
      command: "pa agent status <runId> --json",
    },
    {
      id: "agent-validate",
      label: "Stage agent validate",
      command: "pa agent validate <runId> --json",
    },
    {
      id: "agent-reconcile",
      label: "Stage agent reconcile",
      command: "pa agent reconcile <runId> --json",
    },
    {
      id: "result-import",
      label: "Stage result import",
      command: "pa result import <path-to-result-bundle> --json",
    },
  ];
}

export function inferArtifactKind(relativePath: string): OpenArtifactInspectorMessage["kind"] {
  if (relativePath.includes(".project-arch/agent-runtime/logs/")) {
    return "audit";
  }

  if (relativePath.includes(".project-arch/reconcile/")) {
    return "diff";
  }

  if (relativePath.includes("/tasks/")) {
    return "task";
  }

  return "run";
}

export function toOpenArtifactInspectorMessage(input: {
  relativePath: string;
  label: string;
}): OpenArtifactInspectorMessage {
  return {
    type: "openArtifactInspector",
    kind: inferArtifactKind(input.relativePath),
    relativePath: input.relativePath,
    label: input.label,
  };
}

export function toLaunchTaskMessage(input: {
  taskRef: string;
  relativePath: string;
}): LaunchTaskMessage {
  return {
    type: "launchTask",
    taskRef: input.taskRef,
    relativePath: input.relativePath,
  };
}

export function toCreateDiscoveredFromSelectedTaskMessage(input: {
  phaseId: string;
  milestoneId: string;
  fromTaskId: string;
}): CreateDiscoveredFromSelectedTaskMessage {
  return {
    type: "createDiscoveredFromSelectedTask",
    phaseId: input.phaseId,
    milestoneId: input.milestoneId,
    fromTaskId: input.fromTaskId,
  };
}

export function toCreateLaneTaskMessage(input: {
  phaseId: string;
  milestoneId: string;
  lane: "planned" | "discovered" | "backlog";
  withSlug?: boolean;
}): CreateLaneTaskMessage {
  return {
    type: "createLaneTask",
    phaseId: input.phaseId,
    milestoneId: input.milestoneId,
    lane: input.lane,
    withSlug: input.withSlug,
  };
}

export function toUpdateWorkflowChecklistItemMessage(input: {
  relativePath: string;
  stageId: string;
  itemId: string;
  status: "planned" | "in_progress" | "done" | "blocked" | "skipped";
}): UpdateWorkflowChecklistItemMessage {
  return {
    type: "updateWorkflowChecklistItem",
    relativePath: input.relativePath,
    stageId: input.stageId,
    itemId: input.itemId,
    status: input.status,
  };
}

export const OPEN_STAGE_CHAT_COMMAND_ID = "projectArch.openStageChat" as const;

export function toStageChatOpenMessage(input: {
  relativePath: string;
  stageId: string;
  stageTitle?: string;
  runtime?: string;
}): StageChatCommandMessage {
  return {
    type: "stageChatCommand",
    command: OPEN_STAGE_CHAT_COMMAND_ID,
    relativePath: input.relativePath,
    stageId: input.stageId,
    stageTitle: input.stageTitle,
    runtime: input.runtime,
    action: "open",
  };
}

export function toStageChatSendIntentMessage(input: {
  relativePath: string;
  stageId: string;
  stageTitle?: string;
  runtime?: string;
  messageText: string;
}): StageChatSendIntentMessage {
  return {
    type: "stageChatSendIntent",
    relativePath: input.relativePath,
    stageId: input.stageId,
    stageTitle: input.stageTitle,
    runtime: input.runtime,
    messageText: input.messageText,
  };
}

export function toStageChatStopResponseMessage(input: {
  relativePath: string;
  stageId: string;
  stageTitle?: string;
}): StageChatStopResponseMessage {
  return {
    type: "stageChatStopResponse",
    relativePath: input.relativePath,
    stageId: input.stageId,
    stageTitle: input.stageTitle,
  };
}

export function toStagedRunCommandMessage(input: {
  command: string;
  relativePath: string;
}): RunCommandMessage {
  return {
    type: "runCommand",
    command: input.command,
    execute: false,
    relativePath: input.relativePath,
  };
}

export function isRunCommandMessage(message: WebviewToHostMessage): message is RunCommandMessage {
  return message.type === "runCommand";
}
