import type { ArtifactBrowserModel, HierarchyNode } from "./types";

export interface ExperimentalArtifactBrowserViewState {
  activeDirectoryPath: string;
  selectedFilePath?: string;
  selectedWorkflowStageId?: string;
  stageChatIntentDraft?: string;
}

function selectedFileFromViewState(
  model: ArtifactBrowserModel,
  viewState: Pick<ExperimentalArtifactBrowserViewState, "activeDirectoryPath" | "selectedFilePath">,
) {
  if (!viewState.selectedFilePath) {
    return undefined;
  }

  const activeNode = model.nodes[viewState.activeDirectoryPath] ?? model.nodes[""];
  return activeNode?.files.find((file) => file.relativePath === viewState.selectedFilePath);
}

function hasWorkflowStage(input: {
  model: ArtifactBrowserModel;
  viewState: ExperimentalArtifactBrowserViewState;
  stageId: string;
}): boolean {
  const selectedFile = selectedFileFromViewState(input.model, input.viewState);
  const stages = selectedFile?.taskMetadata?.workflowDetail?.stages ?? [];
  return stages.some((stage) => stage.id === input.stageId);
}

function hasNode(model: ArtifactBrowserModel, relativePath: string): boolean {
  return typeof model.nodes[relativePath] === "object";
}

export function createInitialViewState(
  model: ArtifactBrowserModel,
  candidate?: Partial<ExperimentalArtifactBrowserViewState> | undefined,
): ExperimentalArtifactBrowserViewState {
  const requestedPath = candidate?.activeDirectoryPath;
  const activeDirectoryPath = requestedPath && hasNode(model, requestedPath) ? requestedPath : "";
  const selectedFilePath = candidate?.selectedFilePath;

  if (!selectedFilePath) {
    return {
      activeDirectoryPath,
      ...(typeof candidate?.stageChatIntentDraft === "string"
        ? { stageChatIntentDraft: candidate.stageChatIntentDraft }
        : {}),
    };
  }

  const activeNode = model.nodes[activeDirectoryPath];
  const fileExistsInActiveNode = activeNode?.files.some(
    (file) => file.relativePath === selectedFilePath,
  );
  if (!fileExistsInActiveNode) {
    return {
      activeDirectoryPath,
      ...(typeof candidate?.stageChatIntentDraft === "string"
        ? { stageChatIntentDraft: candidate.stageChatIntentDraft }
        : {}),
    };
  }

  const selectedWorkflowStageId =
    typeof candidate?.selectedWorkflowStageId === "string" &&
    hasWorkflowStage({
      model,
      viewState: {
        activeDirectoryPath,
        selectedFilePath,
      },
      stageId: candidate.selectedWorkflowStageId,
    })
      ? candidate.selectedWorkflowStageId
      : undefined;

  return {
    activeDirectoryPath,
    selectedFilePath,
    ...(selectedWorkflowStageId ? { selectedWorkflowStageId } : {}),
    ...(typeof candidate?.stageChatIntentDraft === "string"
      ? { stageChatIntentDraft: candidate.stageChatIntentDraft }
      : {}),
  };
}

export function getActiveNode(
  model: ArtifactBrowserModel,
  viewState: ExperimentalArtifactBrowserViewState,
): HierarchyNode {
  return model.nodes[viewState.activeDirectoryPath] ?? model.nodes[""];
}

export function openDirectory(
  model: ArtifactBrowserModel,
  viewState: ExperimentalArtifactBrowserViewState,
  nextDirectoryPath: string,
): ExperimentalArtifactBrowserViewState {
  if (!hasNode(model, nextDirectoryPath)) {
    return viewState;
  }

  if (viewState.activeDirectoryPath === nextDirectoryPath && !viewState.selectedFilePath) {
    return viewState;
  }

  return {
    activeDirectoryPath: nextDirectoryPath,
    ...(typeof viewState.stageChatIntentDraft === "string"
      ? { stageChatIntentDraft: viewState.stageChatIntentDraft }
      : {}),
  };
}

export function openParentDirectory(
  model: ArtifactBrowserModel,
  viewState: ExperimentalArtifactBrowserViewState,
): ExperimentalArtifactBrowserViewState {
  const activeNode = getActiveNode(model, viewState);
  const parentPath = activeNode.parentRelativePath ?? "";
  return openDirectory(model, viewState, parentPath);
}

export function selectFile(
  model: ArtifactBrowserModel,
  viewState: ExperimentalArtifactBrowserViewState,
  fileRelativePath: string,
): ExperimentalArtifactBrowserViewState {
  const activeNode = getActiveNode(model, viewState);
  const hasFile = activeNode.files.some((file) => file.relativePath === fileRelativePath);
  if (!hasFile) {
    return viewState;
  }

  if (viewState.selectedFilePath === fileRelativePath) {
    return viewState;
  }

  return {
    activeDirectoryPath: viewState.activeDirectoryPath,
    selectedFilePath: fileRelativePath,
    selectedWorkflowStageId: undefined,
    ...(typeof viewState.stageChatIntentDraft === "string"
      ? { stageChatIntentDraft: viewState.stageChatIntentDraft }
      : {}),
  };
}

export function selectWorkflowStage(
  model: ArtifactBrowserModel,
  viewState: ExperimentalArtifactBrowserViewState,
  stageId: string,
): ExperimentalArtifactBrowserViewState {
  if (!hasWorkflowStage({ model, viewState, stageId })) {
    return viewState;
  }

  if (viewState.selectedWorkflowStageId === stageId) {
    return viewState;
  }

  return {
    ...viewState,
    selectedWorkflowStageId: stageId,
  };
}

export function setStageChatIntentDraft(
  viewState: ExperimentalArtifactBrowserViewState,
  draft: string,
): ExperimentalArtifactBrowserViewState {
  if (viewState.stageChatIntentDraft === draft) {
    return viewState;
  }

  return {
    ...viewState,
    stageChatIntentDraft: draft,
  };
}

export function getBreadcrumbPaths(
  model: ArtifactBrowserModel,
  activeDirectoryPath: string,
): string[] {
  const breadcrumbs: string[] = [];
  const seen = new Set<string>();
  let currentPath = hasNode(model, activeDirectoryPath) ? activeDirectoryPath : "";

  while (!seen.has(currentPath)) {
    seen.add(currentPath);
    breadcrumbs.unshift(currentPath);

    if (currentPath === "") {
      break;
    }

    const node = model.nodes[currentPath];
    const parentPath = node?.parentRelativePath ?? "";
    currentPath = parentPath;
  }

  return breadcrumbs;
}
