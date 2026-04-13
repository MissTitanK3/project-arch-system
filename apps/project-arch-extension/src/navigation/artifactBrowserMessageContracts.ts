import type { ArtifactBrowserModel } from "./artifactBrowserModelLoader";
import type { CommandCatalogModel } from "./commandCatalogView";
import type { LifecycleShellModel } from "./lifecycleView";
import type { RunsPanelModel } from "./runsView";
import type { RuntimesPanelModel } from "./runtimesView";

/**
 * Shared webview message contracts for the artifact browser.
 *
 * Both the baseline and experimental artifact browser providers speak the same
 * message protocol. These types make that protocol explicit and type-safe, so
 * both providers can depend on the same shapes without duplicating definitions
 * or drifting independently.
 *
 * - `WebviewToHostMessage` — messages sent by the webview client to the host
 * - `HostToWebviewMessage` — messages posted by the host back to the webview
 */

// ---------------------------------------------------------------------------
// Webview → Host messages (client-side actions dispatched to the host)
// ---------------------------------------------------------------------------

export interface OpenEditMessage {
  type: "openEdit";
  relativePath: string;
}

export interface OpenPreviewMessage {
  type: "openPreview";
  relativePath: string;
}

export interface CopyPathMessage {
  type: "copyPath";
  relativePath: string;
}

export interface OpenArtifactInspectorMessage {
  type: "openArtifactInspector";
  kind?: "task" | "run" | "audit" | "diff";
  relativePath: string;
  label?: string;
}

export interface RevealInExplorerMessage {
  type: "revealInExplorer";
  relativePath: string;
}

export interface DeleteFileMessage {
  type: "deleteFile";
  relativePath: string;
}

export interface DeleteDirectoryMessage {
  type: "deleteDirectory";
  relativePath: string;
}

export interface RunCommandMessage {
  type: "runCommand";
  command: string;
  execute?: boolean;
  relativePath?: string;
}

export interface LaunchTaskMessage {
  type: "launchTask";
  taskRef: string;
  relativePath?: string;
}

export interface StageChatCommandMessage {
  type: "stageChatCommand";
  command: string;
  relativePath: string;
  stageId: string;
  stageTitle?: string;
  runtime?: string;
  action?: string;
}

export interface StageChatSendIntentMessage {
  type: "stageChatSendIntent";
  relativePath: string;
  stageId: string;
  stageTitle?: string;
  runtime?: string;
  messageText: string;
}

export interface StageChatStopResponseMessage {
  type: "stageChatStopResponse";
  relativePath: string;
  stageId: string;
  stageTitle?: string;
}

export interface UpdateWorkflowChecklistItemMessage {
  type: "updateWorkflowChecklistItem";
  relativePath?: string;
  stageId?: string;
  itemId?: string;
  status?: string;
}

export interface CreateDiscoveredFromSelectedTaskMessage {
  type: "createDiscoveredFromSelectedTask";
  phaseId?: string;
  milestoneId?: string;
  fromTaskId?: string;
}

export interface CreateLaneTaskMessage {
  type: "createLaneTask";
  phaseId?: string;
  milestoneId?: string;
  lane?: string;
  withSlug?: boolean;
}

export interface RefreshRunsShellDataMessage {
  type: "refreshRunsShellData";
}

export interface RefreshRuntimesShellDataMessage {
  type: "refreshRuntimesShellData";
}

export interface RuntimeProfileMutationMessage {
  type: "runtimeProfileMutation";
  kind?: string;
  profileId?: string;
  currentModel?: string;
  runtime?: string;
  suggestedModel?: string;
}

export interface RefreshLifecycleShellDataMessage {
  type: "refreshLifecycleShellData";
}

export interface RefreshCommandCatalogShellDataMessage {
  type: "refreshCommandCatalogShellData";
}

export interface LifecycleStageRemoveMessage {
  type: "lifecycleStageRemove";
}

export interface CommandCatalogStageCommandMessage {
  type: "commandCatalogStageCommand";
  command?: string;
  target?: "existing" | "new";
}

/**
 * Discriminated union of all messages the artifact browser webview client may
 * send to the extension host. Both baseline and experimental browser providers
 * handle this same set of action types.
 */
export type WebviewToHostMessage =
  | OpenEditMessage
  | OpenPreviewMessage
  | CopyPathMessage
  | OpenArtifactInspectorMessage
  | RevealInExplorerMessage
  | DeleteFileMessage
  | DeleteDirectoryMessage
  | RunCommandMessage
  | LaunchTaskMessage
  | StageChatCommandMessage
  | StageChatSendIntentMessage
  | StageChatStopResponseMessage
  | UpdateWorkflowChecklistItemMessage
  | CreateDiscoveredFromSelectedTaskMessage
  | CreateLaneTaskMessage
  | RefreshRunsShellDataMessage
  | RefreshRuntimesShellDataMessage
  | RuntimeProfileMutationMessage
  | RefreshLifecycleShellDataMessage
  | RefreshCommandCatalogShellDataMessage
  | LifecycleStageRemoveMessage
  | CommandCatalogStageCommandMessage;

export type WebviewToHostMessageType = WebviewToHostMessage["type"];

/**
 * All valid message type strings that the artifact browser webview can send to
 * the extension host. Used by the type guard below.
 */
export const WEBVIEW_TO_HOST_MESSAGE_TYPES: ReadonlySet<WebviewToHostMessageType> =
  new Set<WebviewToHostMessageType>([
    "openEdit",
    "openPreview",
    "copyPath",
    "openArtifactInspector",
    "revealInExplorer",
    "deleteFile",
    "deleteDirectory",
    "runCommand",
    "launchTask",
    "stageChatCommand",
    "stageChatSendIntent",
    "stageChatStopResponse",
    "updateWorkflowChecklistItem",
    "createDiscoveredFromSelectedTask",
    "createLaneTask",
    "refreshRunsShellData",
    "refreshRuntimesShellData",
    "runtimeProfileMutation",
    "refreshLifecycleShellData",
    "refreshCommandCatalogShellData",
    "lifecycleStageRemove",
    "commandCatalogStageCommand",
  ]);

/**
 * Type guard: returns `true` if `value` has a `type` field matching a known
 * webview-to-host message type. Does not validate individual payload field
 * shapes beyond the discriminant.
 */
export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const type = (value as Record<string, unknown>).type;
  if (typeof type !== "string") {
    return false;
  }

  return WEBVIEW_TO_HOST_MESSAGE_TYPES.has(type as WebviewToHostMessageType);
}

// ---------------------------------------------------------------------------
// Host → Webview messages (host-side events pushed to the webview client)
// ---------------------------------------------------------------------------

export interface StageChatRuntimeResponseMessage {
  type: "stageChatRuntimeResponse";
  relativePath: string;
  stageId: string;
  stageTitle: string;
  role: "assistant" | "user";
  content: string;
  append: boolean;
}

export type StageChatSessionStatus = "none" | "active" | "stale";

export type StageChatLifecycleAction = "open" | "resume" | "reset" | "discard";

export interface ExperimentalStageChatSessionSnapshot {
  relativePath: string;
  stageId: string;
  stageTitle: string;
  sessionStatus: StageChatSessionStatus;
  threadKey: string;
  runtimeClass?: "local" | "cloud";
  availableActions: StageChatLifecycleAction[];
  turns: Array<{
    role: "assistant" | "user";
    content: string;
  }>;
}

export interface StageChatRuntimeStateMessage {
  type: "stageChatRuntimeState";
  relativePath: string;
  stageId: string;
  stageTitle: string;
  runtimeState: "idle" | "sending" | "success" | "error";
  statusMessage: string;
  canRetry: boolean;
  failedMessage: string;
  clearTurns?: boolean;
  sessionStatus?: StageChatSessionStatus;
  threadKey?: string;
  runtimeClass?: "local" | "cloud";
  availableActions?: StageChatLifecycleAction[];
}

/**
 * Discriminated union of all messages the extension host may post to the
 * artifact browser webview. Both baseline and experimental providers produce
 * this same set of outbound message shapes.
 */
export type HostToWebviewMessage = StageChatRuntimeResponseMessage | StageChatRuntimeStateMessage;

export type HostToWebviewMessageType = HostToWebviewMessage["type"];

/**
 * All valid message type strings that the host may post to the artifact browser
 * webview. Used by the type guard below.
 */
export const HOST_TO_WEBVIEW_MESSAGE_TYPES: ReadonlySet<HostToWebviewMessageType> =
  new Set<HostToWebviewMessageType>(["stageChatRuntimeResponse", "stageChatRuntimeState"]);

export const EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCHEMA_VERSION = "2.0" as const;

export const EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCRIPT_ID =
  "project-arch-experimental-artifact-browser-model" as const;

export interface ExperimentalArtifactBrowserBootstrap {
  schemaVersion: typeof EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCHEMA_VERSION;
  model: ArtifactBrowserModel;
  shellData?: {
    runs?: RunsPanelModel;
    runtimes?: RuntimesPanelModel;
    lifecycle?: LifecycleShellModel;
    commands?: CommandCatalogModel;
  };
  stageChat?: {
    sessions: ExperimentalStageChatSessionSnapshot[];
    generatedAt: string;
  };
}

/**
 * Type guard: returns `true` if `value` has a `type` field matching a known
 * host-to-webview message type.
 */
export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const type = (value as Record<string, unknown>).type;
  if (typeof type !== "string") {
    return false;
  }

  return HOST_TO_WEBVIEW_MESSAGE_TYPES.has(type as HostToWebviewMessageType);
}

export function isExperimentalArtifactBrowserBootstrap(
  value: unknown,
): value is ExperimentalArtifactBrowserBootstrap {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCHEMA_VERSION) {
    return false;
  }

  return Boolean(candidate.model && typeof candidate.model === "object");
}
