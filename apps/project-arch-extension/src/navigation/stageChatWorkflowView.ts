import type { StageChatSessionBoundary } from "../integration/stageChatSessionBoundary";
import type { StageChatSessionIdentity } from "../integration/stageChatSessionStoreBoundary";
import type { NormalizedTaskWorkflowStage } from "./taskWorkflowParser";

// ---------------------------------------------------------------------------
// Command IDs
// ---------------------------------------------------------------------------

export const OPEN_STAGE_CHAT_COMMAND_ID = "projectArch.openStageChat" as const;
export const RESET_STAGE_CHAT_COMMAND_ID = "projectArch.resetStageChat" as const;
export const DISCARD_STAGE_CHAT_COMMAND_ID = "projectArch.discardStageChat" as const;
export const RETURN_TO_WORKFLOW_VIEW_COMMAND_ID = "projectArch.returnToWorkflowView" as const;

// ---------------------------------------------------------------------------
// Navigation layer
// ---------------------------------------------------------------------------

/**
 * The two navigation layers of the guided-task UX surface.
 *
 * - `workflow-view`: user is looking at the workflow stage list (default layer).
 * - `stage-chat`: user has entered a stage's chat conversation.
 *
 * Stage chat is subordinate: moving into it does not replace the workflow view;
 * returning always brings the user back to the same stage list.
 */
export type StageChatNavigationLayer =
  | { kind: "workflow-view" }
  | {
      kind: "stage-chat";
      stageId: string;
      stageTitle: string;
    };

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

/**
 * Coarse session status used for rendering stage-entry affordances.
 *
 * - `none`: no session exists for this stage yet.
 * - `active`: a session exists and is current (not stale).
 * - `stale`: a session exists but has not been interacted with recently.
 */
export type StageChatSessionStatus = "none" | "active" | "stale";

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

/**
 * Lifecycle actions that may be offered for a stage's chat session.
 *
 * - `open`: start a fresh stage-chat session (only when none exists).
 * - `resume`: re-enter an existing session at the current stage.
 * - `reset`: discard the current thread and start fresh at the same stage.
 * - `discard`: remove the session entirely without starting a new one.
 */
export type StageChatLifecycleAction = "open" | "resume" | "reset" | "discard";

// ---------------------------------------------------------------------------
// Per-stage workflow view entry
// ---------------------------------------------------------------------------

/**
 * The stage-chat entry shown for a single workflow stage inside the workflow view.
 *
 * One of these exists for every stage, regardless of whether a session has
 * been started. The affordances guide the user toward the applicable actions.
 */
export interface StageChatStageEntry {
  stageId: string;
  stageTitle: string;
  stageDescription?: string;
  sessionStatus: StageChatSessionStatus;
  threadKey: string;
  runtimeClass?: "local" | "cloud";
  availableActions: StageChatLifecycleAction[];
}

// ---------------------------------------------------------------------------
// Stage-chat surface model
// ---------------------------------------------------------------------------

/**
 * The full view model for the stage-chat surface, present only when the
 * navigation layer is `stage-chat`.
 *
 * Carries everything the UI needs to present session state, controls, and
 * handoff history to the user.
 */
export interface StageChatSurfaceModel {
  taskId: string;
  stageId: string;
  stageTitle: string;
  stageDescription?: string;
  sessionStatus: StageChatSessionStatus;
  threadKey: string;
  runtimeClass: "local" | "cloud";
  hasHandoffs: boolean;
  handoffCount: number;
  lifecycleControls: StageChatLifecycleAction[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Top-level workflow view model
// ---------------------------------------------------------------------------

/**
 * The complete view model for the workflow surface when stage-chat awareness
 * is included.
 *
 * `layer` tracks which navigation layer the user is currently on.
 * `stages` always lists all workflow stages with their per-stage entries.
 * `surface` is only present when `layer.kind === "stage-chat"`.
 */
export interface StageChatWorkflowViewModel {
  taskId: string;
  layer: StageChatNavigationLayer;
  stages: StageChatStageEntry[];
  surface?: StageChatSurfaceModel;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Navigation intent output
// ---------------------------------------------------------------------------

/**
 * Describes the navigation transition that should happen in response to a
 * user action.
 */
export type StageChatNavigationIntent =
  | { kind: "enter-stage-chat"; stageId: string; stageTitle: string }
  | { kind: "return-to-workflow-view" };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Determines which lifecycle actions are available given a session status.
 *
 * Rules:
 * - `none` → only `open` is offered.
 * - `active` → `resume`, `reset`, and `discard` are offered.
 * - `stale` → `resume`, `reset`, and `discard` are offered (user can choose
 *   whether to pick up or start fresh).
 */
export function resolveStageChatLifecycleActions(
  status: StageChatSessionStatus,
): StageChatLifecycleAction[] {
  if (status === "none") {
    return ["open"];
  }

  return ["resume", "reset", "discard"];
}

/**
 * Resolves the coarse session status for a stage given the output of
 * `boundary.lookupSession`.
 */
export function resolveStageChatSessionStatus(lookup: {
  status: "found" | "missing" | "stale";
}): StageChatSessionStatus {
  if (lookup.status === "missing") {
    return "none";
  }

  if (lookup.status === "stale") {
    return "stale";
  }

  return "active";
}

/**
 * Builds the navigation intent for entering a stage's chat from the workflow view.
 */
export function buildEnterStageChatIntent(
  stage: Pick<NormalizedTaskWorkflowStage, "id" | "title">,
): StageChatNavigationIntent {
  return {
    kind: "enter-stage-chat",
    stageId: stage.id,
    stageTitle: stage.title,
  };
}

/**
 * Builds the navigation intent for returning to the workflow stage list.
 */
export function buildReturnToWorkflowIntent(): StageChatNavigationIntent {
  return { kind: "return-to-workflow-view" };
}

// ---------------------------------------------------------------------------
// View model builders
// ---------------------------------------------------------------------------

/**
 * Builds per-stage entries for the workflow view from a list of workflow stages
 * and a session boundary, without entering stage chat.
 *
 * This is the data that drives the stage-list part of the workflow view.
 */
export function buildStageChatWorkflowEntries(input: {
  taskId: string;
  stages: ReadonlyArray<Pick<NormalizedTaskWorkflowStage, "id" | "title" | "description">>;
  boundary: Pick<StageChatSessionBoundary, "buildThreadKey" | "lookupSession">;
  staleAfterMs?: number;
  now?: number;
}): StageChatStageEntry[] {
  const { taskId, stages, boundary, staleAfterMs, now } = input;

  return stages.map((stage) => {
    const identity: StageChatSessionIdentity = { taskId, stageId: stage.id };
    const threadKey = boundary.buildThreadKey(identity);
    const lookup = boundary.lookupSession({ identity, staleAfterMs, now });
    const sessionStatus = resolveStageChatSessionStatus(lookup);

    return {
      stageId: stage.id,
      stageTitle: stage.title,
      stageDescription: stage.description,
      sessionStatus,
      threadKey,
      runtimeClass: lookup.status === "found" ? lookup.session.runtimeClass : undefined,
      availableActions: resolveStageChatLifecycleActions(sessionStatus),
    };
  });
}

/**
 * Builds the surface model for the stage-chat layer.
 *
 * Called when the user has entered a stage's chat (the navigation layer is
 * `stage-chat`). The model drives all controls visible on the chat surface.
 */
export function buildStageChatSurfaceModel(input: {
  taskId: string;
  stage: Pick<NormalizedTaskWorkflowStage, "id" | "title" | "description">;
  boundary: Pick<StageChatSessionBoundary, "buildThreadKey" | "lookupSession" | "lookupHandoffs">;
  runtimeClass?: "local" | "cloud";
  staleAfterMs?: number;
  now?: number;
}): StageChatSurfaceModel {
  const { taskId, stage, boundary, staleAfterMs, now } = input;
  const identity: StageChatSessionIdentity = { taskId, stageId: stage.id };
  const threadKey = boundary.buildThreadKey(identity);
  const lookup = boundary.lookupSession({ identity, staleAfterMs, now });
  const sessionStatus = resolveStageChatSessionStatus(lookup);

  const handoffsResult = boundary.lookupHandoffs({ identity });
  const handoffCount = handoffsResult.handoffs.length;

  const runtimeClass =
    input.runtimeClass ??
    ((lookup.status === "found" || lookup.status === "stale") && lookup.session.runtimeClass != null
      ? lookup.session.runtimeClass
      : "local");

  return {
    taskId,
    stageId: stage.id,
    stageTitle: stage.title,
    stageDescription: stage.description,
    sessionStatus,
    threadKey,
    runtimeClass,
    hasHandoffs: handoffCount > 0,
    handoffCount,
    lifecycleControls: resolveStageChatLifecycleActions(sessionStatus),
    generatedAt: new Date(now ?? Date.now()).toISOString(),
  };
}

/**
 * Builds the full `StageChatWorkflowViewModel`.
 *
 * - When `layer.kind === "workflow-view"`, only stage entries are produced.
 * - When `layer.kind === "stage-chat"`, stage entries AND the surface model
 *   for the active stage are produced.
 */
export function buildStageChatWorkflowViewModel(input: {
  taskId: string;
  layer: StageChatNavigationLayer;
  stages: ReadonlyArray<Pick<NormalizedTaskWorkflowStage, "id" | "title" | "description">>;
  boundary: Pick<StageChatSessionBoundary, "buildThreadKey" | "lookupSession" | "lookupHandoffs">;
  runtimeClass?: "local" | "cloud";
  staleAfterMs?: number;
  now?: number;
}): StageChatWorkflowViewModel {
  const { taskId, layer, stages, boundary, runtimeClass, staleAfterMs, now } = input;

  const stageEntries = buildStageChatWorkflowEntries({
    taskId,
    stages,
    boundary,
    staleAfterMs,
    now,
  });

  let surface: StageChatSurfaceModel | undefined;

  if (layer.kind === "stage-chat") {
    const activeStage = stages.find((s) => s.id === layer.stageId);

    if (activeStage) {
      surface = buildStageChatSurfaceModel({
        taskId,
        stage: activeStage,
        boundary,
        runtimeClass,
        staleAfterMs,
        now,
      });
    }
  }

  return {
    taskId,
    layer,
    stages: stageEntries,
    surface,
    generatedAt: new Date(now ?? Date.now()).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSessionStatusBadge(status: StageChatSessionStatus): string {
  if (status === "none") {
    return `<span class="badge badge-none">No session</span>`;
  }
  if (status === "stale") {
    return `<span class="badge badge-stale">Stale</span>`;
  }
  return `<span class="badge badge-active">Active</span>`;
}

function renderLifecycleActionButton(action: StageChatLifecycleAction, threadKey: string): string {
  const labels: Record<StageChatLifecycleAction, string> = {
    open: "Open Stage Chat",
    resume: "Resume Stage Chat",
    reset: "Reset Stage Chat",
    discard: "Discard Stage Chat",
  };

  const classes: Record<StageChatLifecycleAction, string> = {
    open: "action-open",
    resume: "action-resume",
    reset: "action-reset",
    discard: "action-discard",
  };

  const commandIds: Record<StageChatLifecycleAction, string> = {
    open: OPEN_STAGE_CHAT_COMMAND_ID,
    resume: OPEN_STAGE_CHAT_COMMAND_ID,
    reset: RESET_STAGE_CHAT_COMMAND_ID,
    discard: DISCARD_STAGE_CHAT_COMMAND_ID,
  };

  return `<button class="${escapeHtml(classes[action])}" data-command="${escapeHtml(commandIds[action])}" data-thread-key="${escapeHtml(threadKey)}" data-action="${escapeHtml(action)}">${escapeHtml(labels[action])}</button>`;
}

/**
 * Renders a single stage entry card for the workflow-view layer.
 */
export function renderStageChatStageEntry(entry: StageChatStageEntry): string {
  const descriptionLine = entry.stageDescription
    ? `<div class="description">${escapeHtml(entry.stageDescription)}</div>`
    : "";

  const actionButtons = entry.availableActions
    .map((action) => renderLifecycleActionButton(action, entry.threadKey))
    .join("\n      ");

  return `<article class="card stage-chat-entry" data-stage-id="${escapeHtml(entry.stageId)}" data-thread-key="${escapeHtml(entry.threadKey)}">
  <div class="kind">Stage Chat</div>
  <div class="title">${escapeHtml(entry.stageTitle)}</div>
  ${descriptionLine}
  <div class="session-status">${renderSessionStatusBadge(entry.sessionStatus)}</div>
  <div class="actions-section">
    <div class="actions">
      ${actionButtons}
    </div>
  </div>
</article>`;
}

/**
 * Renders the stage-chat surface panel, shown when the user is inside a stage's chat.
 */
export function renderStageChatSurface(model: StageChatSurfaceModel): string {
  const descriptionLine = model.stageDescription
    ? `<div class="description">${escapeHtml(model.stageDescription)}</div>`
    : "";

  const handoffLine = model.hasHandoffs
    ? `<div class="meta-row"><span class="meta-label">Runtime Transitions</span><span class="meta-value">${model.handoffCount}</span></div>`
    : "";

  const controlButtons = model.lifecycleControls
    .map((action) => renderLifecycleActionButton(action, model.threadKey))
    .join("\n      ");

  const returnButton = `<button class="action-return" data-command="${escapeHtml(RETURN_TO_WORKFLOW_VIEW_COMMAND_ID)}" data-thread-key="${escapeHtml(model.threadKey)}">Return to workflow</button>`;

  return `<section class="stage-chat-surface" data-stage-id="${escapeHtml(model.stageId)}" data-thread-key="${escapeHtml(model.threadKey)}">
  <div class="surface-header">
    <div class="kind">Stage Chat</div>
    <div class="title">${escapeHtml(model.stageTitle)}</div>
    ${descriptionLine}
  </div>
  <div class="surface-meta">
    <div class="meta-row"><span class="meta-label">Session</span><span class="meta-value">${renderSessionStatusBadge(model.sessionStatus)}</span></div>
    <div class="meta-row"><span class="meta-label">Runtime</span><span class="meta-value">${escapeHtml(model.runtimeClass)}</span></div>
    ${handoffLine}
  </div>
  <div class="surface-controls">
    <div class="actions primary-actions">
      ${controlButtons}
    </div>
    <div class="actions nav-actions">
      ${returnButton}
    </div>
  </div>
</section>`;
}

/**
 * Renders the full stage-chat workflow view panel.
 *
 * In `workflow-view` mode, shows all stage entries.
 * In `stage-chat` mode, shows the surface for the active stage plus a
 * condensed list of other stages for orientation.
 */
export function renderStageChatWorkflowPanel(model: StageChatWorkflowViewModel): string {
  if (model.layer.kind === "stage-chat" && model.surface) {
    const surfaceHtml = renderStageChatSurface(model.surface);
    const activeStageChatId = model.layer.stageId;

    const otherStages = model.stages.filter((s) => s.stageId !== activeStageChatId);
    const otherStagesList =
      otherStages.length > 0
        ? `<div class="other-stages-section">
  <div class="section-label">Other stages</div>
  <ul class="stage-list">
    ${otherStages.map((s) => `<li class="stage-list-item" data-stage-id="${escapeHtml(s.stageId)}">${escapeHtml(s.stageTitle)} — ${escapeHtml(s.sessionStatus)}</li>`).join("\n    ")}
  </ul>
</div>`
        : "";

    return `<div class="stage-chat-panel layer-stage-chat">
${surfaceHtml}
${otherStagesList}
</div>`;
  }

  const stageCards = model.stages.map(renderStageChatStageEntry).join("\n");

  return `<div class="stage-chat-panel layer-workflow-view">
${stageCards}
</div>`;
}
