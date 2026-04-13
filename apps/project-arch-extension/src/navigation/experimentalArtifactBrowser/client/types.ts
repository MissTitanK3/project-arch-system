import type {
  ArtifactBrowserModel,
  ExperimentalArtifactBrowserBootstrap,
  StageChatLifecycleAction,
  StageChatSessionStatus,
  HierarchyNode,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../../artifactNavigationBrowser";

export interface ExperimentalArtifactBrowserWebviewApi {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface ExperimentalArtifactBrowserWindow {
  acquireVsCodeApi?: () => ExperimentalArtifactBrowserWebviewApi;
}

export interface ExperimentalStageChatTurn {
  role: "assistant" | "user";
  content: string;
}

export interface ExperimentalStageChatSessionState {
  relativePath: string;
  stageId: string;
  stageTitle: string;
  runtimeState: "idle" | "sending" | "success" | "error";
  statusMessage: string;
  lastFailedMessage: string;
  threadKey?: string;
  runtimeClass?: "local" | "cloud";
  sessionStatus?: StageChatSessionStatus;
  availableActions?: StageChatLifecycleAction[];
  turns: ExperimentalStageChatTurn[];
}

export type {
  ArtifactBrowserModel,
  ExperimentalArtifactBrowserBootstrap,
  HierarchyNode,
  HostToWebviewMessage,
  WebviewToHostMessage,
};
