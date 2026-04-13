import { render } from "preact";
import { ExperimentalArtifactBrowserApp } from "./ExperimentalArtifactBrowserApp";
import "../../preact/styles/tokens.css";
import {
  EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCRIPT_ID,
  isExperimentalArtifactBrowserBootstrap,
} from "../../artifactBrowserMessageContracts";
import { type ExperimentalArtifactBrowserViewState } from "./experimentalArtifactBrowserNavigationState";
import type { ShellNavigationGuidanceState } from "../../preact";
import type {
  ExperimentalArtifactBrowserBootstrap,
  ExperimentalArtifactBrowserWebviewApi,
  ExperimentalArtifactBrowserWindow,
  WebviewToHostMessage,
} from "./types";

const ROOT_ID = "project-arch-experimental-artifact-browser-root";

interface PersistedExperimentalArtifactBrowserState {
  viewState?: Partial<ExperimentalArtifactBrowserViewState>;
  activeSurfaceId?: string;
  isGuidanceRailOpen?: boolean;
}

function readPersistedState(
  webviewApi: ExperimentalArtifactBrowserWebviewApi,
): PersistedExperimentalArtifactBrowserState {
  const raw = webviewApi.getState() as unknown;
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const candidate = raw as Record<string, unknown>;
  const hasStructuredShape =
    "viewState" in candidate || "activeSurfaceId" in candidate || "isGuidanceRailOpen" in candidate;
  if (hasStructuredShape) {
    return {
      viewState:
        candidate.viewState && typeof candidate.viewState === "object"
          ? (candidate.viewState as Partial<ExperimentalArtifactBrowserViewState>)
          : undefined,
      activeSurfaceId:
        typeof candidate.activeSurfaceId === "string" ? candidate.activeSurfaceId : undefined,
      isGuidanceRailOpen:
        typeof candidate.isGuidanceRailOpen === "boolean"
          ? candidate.isGuidanceRailOpen
          : undefined,
    };
  }

  return {
    viewState: candidate as Partial<ExperimentalArtifactBrowserViewState>,
  };
}

function readBootstrap(): ExperimentalArtifactBrowserBootstrap {
  const modelNode = globalThis.document.getElementById(
    EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCRIPT_ID,
  );
  if (!modelNode?.textContent) {
    throw new Error("Project Arch experimental browser: initial model script is missing.");
  }

  const parsed = JSON.parse(modelNode.textContent) as unknown;
  if (!isExperimentalArtifactBrowserBootstrap(parsed)) {
    throw new Error("Project Arch experimental browser: bootstrap payload is invalid.");
  }

  return parsed as ExperimentalArtifactBrowserBootstrap;
}

function resolveWebviewApi(
  windowRef: ExperimentalArtifactBrowserWindow,
): ExperimentalArtifactBrowserWebviewApi {
  if (!windowRef.acquireVsCodeApi) {
    return {
      postMessage: () => undefined,
      getState: () => undefined,
      setState: () => undefined,
    };
  }

  return windowRef.acquireVsCodeApi();
}

function mountExperimentalArtifactBrowser() {
  const windowRef = globalThis.window as unknown as ExperimentalArtifactBrowserWindow;
  const webviewApi = resolveWebviewApi(windowRef);
  const bootstrap = readBootstrap();
  const persistedState = readPersistedState(webviewApi);
  let currentViewState = persistedState.viewState;
  let currentActiveSurfaceId = persistedState.activeSurfaceId;
  let currentGuidanceRailOpen = persistedState.isGuidanceRailOpen;

  const root = globalThis.document.getElementById(ROOT_ID);
  if (!root) {
    throw new Error("Project Arch experimental browser: root container is missing.");
  }

  const postMessage = (message: WebviewToHostMessage) => {
    webviewApi.postMessage(message);
  };

  render(
    <ExperimentalArtifactBrowserApp
      model={bootstrap.model}
      shellData={bootstrap.shellData}
      stageChat={bootstrap.stageChat}
      postMessage={postMessage}
      initialViewState={persistedState.viewState}
      initialActiveSurfaceId={persistedState.activeSurfaceId}
      initialGuidanceRailOpen={persistedState.isGuidanceRailOpen}
      onViewStateChange={(viewState) => {
        currentViewState = viewState;
        webviewApi.setState({
          viewState: currentViewState,
          activeSurfaceId: currentActiveSurfaceId,
          isGuidanceRailOpen: currentGuidanceRailOpen,
        } satisfies PersistedExperimentalArtifactBrowserState);
      }}
      onActiveSurfaceIdChange={(activeSurfaceId) => {
        currentActiveSurfaceId = activeSurfaceId;
        webviewApi.setState({
          viewState: currentViewState,
          activeSurfaceId: currentActiveSurfaceId,
          isGuidanceRailOpen: currentGuidanceRailOpen,
        } satisfies PersistedExperimentalArtifactBrowserState);
      }}
      onGuidanceRailOpenChange={(isGuidanceRailOpen) => {
        currentGuidanceRailOpen = isGuidanceRailOpen;
        webviewApi.setState({
          viewState: currentViewState,
          activeSurfaceId: currentActiveSurfaceId,
          isGuidanceRailOpen: currentGuidanceRailOpen,
        } satisfies PersistedExperimentalArtifactBrowserState);
      }}
    />,
    root,
  );
}

mountExperimentalArtifactBrowser();
