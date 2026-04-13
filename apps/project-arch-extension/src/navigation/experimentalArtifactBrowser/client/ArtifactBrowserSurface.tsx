import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ActionRow,
  Button,
  BreadcrumbTrail,
  CodeText,
  EmptyState,
  Input,
  Select,
  Surface,
  SurfaceSection,
  type BreadcrumbItem,
} from "../../preact";
import type {
  StageChatLifecycleAction,
  StageChatSessionStatus,
} from "../../artifactNavigationBrowser";
import {
  DISCARD_STAGE_CHAT_COMMAND_ID as DISCARD_STAGE_CHAT_WORKFLOW_COMMAND_ID,
  OPEN_STAGE_CHAT_COMMAND_ID as OPEN_STAGE_CHAT_WORKFLOW_COMMAND_ID,
  RESET_STAGE_CHAT_COMMAND_ID as RESET_STAGE_CHAT_WORKFLOW_COMMAND_ID,
} from "../../stageChatWorkflowView";
import {
  buildCommandStagingActions,
  parseTaskContext,
  resolveTaskWorkflowContext,
  toCreateDiscoveredFromSelectedTaskMessage,
  toCreateLaneTaskMessage,
  toLaunchTaskMessage,
  toStageChatSendIntentMessage,
  toStageChatStopResponseMessage,
  toStagedRunCommandMessage,
  toUpdateWorkflowChecklistItemMessage,
} from "./experimentalArtifactBrowserActions";
import {
  getActiveNode,
  getBreadcrumbPaths,
  openDirectory,
  openParentDirectory,
  selectFile,
  selectWorkflowStage,
  setStageChatIntentDraft,
  type ExperimentalArtifactBrowserViewState,
} from "./experimentalArtifactBrowserNavigationState";
import {
  createArtifactDirectoriesGuidancePayload,
  createArtifactCommandStagingGuidancePayload,
  createArtifactFilesGuidancePayload,
  createArtifactFileActionsGuidancePayload,
  createArtifactNavigationGuidancePayload,
  createArtifactRootsGuidancePayload,
  createArtifactStageChatGuidancePayload,
  createArtifactWorkflowChecklistGuidancePayload,
  createArtifactWorkflowActionsGuidancePayload,
} from "./artifactBrowserShellConfig";
import type { ShellGuidancePayload } from "../../preact";
import type {
  ArtifactBrowserModel,
  ExperimentalArtifactBrowserBootstrap,
  ExperimentalStageChatSessionState,
  HierarchyNode,
  WebviewToHostMessage,
} from "./types";

type RuntimesShellData = NonNullable<ExperimentalArtifactBrowserBootstrap["shellData"]>["runtimes"];
type RunsShellData = NonNullable<ExperimentalArtifactBrowserBootstrap["shellData"]>["runs"];

interface ArtifactBrowserSurfaceProps {
  readonly model: ArtifactBrowserModel;
  readonly runtimesModel?: RuntimesShellData;
  readonly runsModel?: RunsShellData;
  readonly viewState: ExperimentalArtifactBrowserViewState;
  readonly setViewState: (
    updater: (state: ExperimentalArtifactBrowserViewState) => ExperimentalArtifactBrowserViewState,
  ) => void;
  readonly stageChatSessionsByKey: Record<string, ExperimentalStageChatSessionState>;
  readonly postMessage: (message: WebviewToHostMessage) => void;
  readonly onSendStageChatIntent: (
    message: Extract<WebviewToHostMessage, { type: "stageChatSendIntent" }>,
  ) => void;
  readonly onOpenGuidance: (payload: ShellGuidancePayload) => void;
}

type HierarchyFile = HierarchyNode["files"][number];

interface MetadataField {
  label: string;
  value: string;
}

type ArtifactContextMenuTargetType = "file" | "directory";

interface ArtifactContextMenuTarget {
  type: ArtifactContextMenuTargetType;
  relativePath: string;
  x: number;
  y: number;
}

type RelatedMetadataBucket = "codeTargets" | "publicDocs" | "decisions" | "evidence" | "traceLinks";

interface RelatedFileEntry {
  relativePath: string;
  file?: HierarchyFile;
  buckets: RelatedMetadataBucket[];
}

type CommandParameterControl = "select" | "number" | "text" | "timeout";

interface WorkflowChecklistChatSession {
  relativePath: string;
  stageId: string;
  itemId: string;
  itemLabel: string;
  runtime: string;
}

function renderStageChatTurnMarkdown(content: string): string {
  const rendered = marked.parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  });

  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: {
      html: true,
    },
  });
}

function resolveStageChatLifecycleActions(
  sessionStatus: StageChatSessionStatus | undefined,
): StageChatLifecycleAction[] {
  if (sessionStatus === "active" || sessionStatus === "stale") {
    return ["resume", "reset", "discard"];
  }

  return ["open"];
}

function toStageChatCommandId(action: StageChatLifecycleAction): string {
  if (action === "reset") {
    return RESET_STAGE_CHAT_WORKFLOW_COMMAND_ID;
  }

  if (action === "discard") {
    return DISCARD_STAGE_CHAT_WORKFLOW_COMMAND_ID;
  }

  return OPEN_STAGE_CHAT_WORKFLOW_COMMAND_ID;
}

function toStageChatSessionStatusLabel(sessionStatus: StageChatSessionStatus | undefined): string {
  if (sessionStatus === "active") {
    return "Active";
  }

  if (sessionStatus === "stale") {
    return "Stale";
  }

  return "None";
}

const RELATED_METADATA_BUCKETS: ReadonlyArray<{
  key: RelatedMetadataBucket;
  label: string;
}> = [
  { key: "codeTargets", label: "codeTargets" },
  { key: "publicDocs", label: "publicDocs" },
  { key: "decisions", label: "decisions" },
  { key: "evidence", label: "evidence" },
  { key: "traceLinks", label: "traceLinks" },
];

function toPathLeafLabel(path: string, fallback: string): string {
  if (path.length === 0) {
    return fallback;
  }

  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? fallback;
}

function toBreadcrumbLabel(path: string): string {
  if (path.length === 0) {
    return "Repository";
  }

  return toPathLeafLabel(path, "Repository");
}

function isOverviewFilePath(relativePath: string): boolean {
  return /(?:^|\/)overview[.]markdown?$/i.test(relativePath);
}

function toDisplayValue(value: string | undefined, fallback = "(not available)"): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return value;
}

function toDisplayTimestamp(value: string | undefined): string {
  if (!value) {
    return "(not available)";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString();
}

function normalizeRelativeReference(value: string): string {
  const sanitized = value.replace(/\\/g, "/").trim();
  const segments = sanitized.split("/");
  const output: string[] = [];

  for (const segment of segments) {
    const token = segment.trim();
    if (!token || token === ".") {
      continue;
    }

    if (token === "..") {
      output.pop();
      continue;
    }

    output.push(token);
  }

  return output.join("/");
}

function toParentDirectory(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index > 0 ? relativePath.slice(0, index) : "";
}

function resolveReferenceCandidates(selectedFilePath: string, rawReference: string): string[] {
  const reference = rawReference.trim();
  if (!reference) {
    return [];
  }

  const normalizedReference = normalizeRelativeReference(reference);
  const parentDirectory = toParentDirectory(selectedFilePath);
  const relativeCandidate = normalizeRelativeReference(
    parentDirectory ? `${parentDirectory}/${reference}` : reference,
  );

  const candidates = [normalizedReference, relativeCandidate].filter((value) => value.length > 0);
  return [...new Set(candidates)];
}

function extractCommandParameters(command: string): string[] {
  const matches = [...command.matchAll(/<([^>]+)>/g)];
  const tokens = matches
    .map((match) => (match[1] ?? "").trim())
    .filter((token) => token.length > 0);
  return [...new Set(tokens)];
}

function toCommandParameterLabel(parameter: string): string {
  return parameter.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCommandParameterControl(parameter: string): CommandParameterControl {
  const token = parameter.toLowerCase();
  if (token === "runtime" || token === "runid") {
    return "select";
  }

  if (token === "ms" || token === "timeout-ms") {
    return "timeout";
  }

  return "text";
}

function toDefaultCommandParameterValue(parameter: string): string {
  const token = parameter.toLowerCase();
  if (token === "runtime") {
    return "local";
  }

  if (token === "ms" || token === "timeout-ms") {
    return "30";
  }

  return "";
}

function convertTimeoutToMilliseconds(value: string, unit: string): string {
  const numValue = parseInt(value, 10);
  if (isNaN(numValue)) {
    return "";
  }

  const unitLower = unit.toLowerCase();
  let milliseconds = numValue;
  if (unitLower === "sec") {
    milliseconds = numValue * 1000;
  } else if (unitLower === "min") {
    milliseconds = numValue * 60 * 1000;
  } else if (unitLower === "hr") {
    milliseconds = numValue * 60 * 60 * 1000;
  }
  // If "ms", keep as is

  return milliseconds.toString();
}

function resolveRuntimeInventoryOptions(model?: RuntimesShellData): string[] {
  if (!model || model.loadState === "failed") {
    return ["local", "cloud"];
  }

  const available = model.runtimes
    .filter((runtime) => runtime.available)
    .map((runtime) => runtime.runtime);
  const fallback = model.runtimes.map((runtime) => runtime.runtime);
  const options = (available.length > 0 ? available : fallback)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return options.length > 0 ? [...new Set(options)] : ["local", "cloud"];
}

function resolveRecentRunIdOptions(model?: RunsShellData): string[] {
  if (!model) {
    return [];
  }

  return model.cards.map((card) => card.runId);
}

function resolveReadyRuntimeEndpointOptions(model?: RuntimesShellData): string[] {
  if (!model || model.loadState === "failed") {
    return ["local", "cloud"];
  }

  const readyProfileRuntimes = model.profiles
    .filter((profile) => profile.enabled && profile.readiness === "ready")
    .map((profile) => profile.runtime.trim())
    .filter((runtime) => runtime.length > 0);

  if (readyProfileRuntimes.length > 0) {
    return [...new Set(readyProfileRuntimes)];
  }

  const availableRuntimeRuntimes = model.runtimes
    .filter((runtime) => runtime.available)
    .map((runtime) => runtime.runtime.trim())
    .filter((runtime) => runtime.length > 0);

  if (availableRuntimeRuntimes.length > 0) {
    return [...new Set(availableRuntimeRuntimes)];
  }

  return resolveRuntimeInventoryOptions(model);
}

function resolveCommandTemplate(
  commandTemplate: string,
  values: Record<string, string>,
  timeoutUnits?: Record<string, string>,
): string {
  return commandTemplate.replace(/<([^>]+)>/g, (match, token: string) => {
    const key = token.trim();
    let value = values[key];
    if (!value || value.trim().length === 0) {
      return match;
    }

    // Handle timeout conversion
    if ((key === "ms" || key === "timeout-ms") && timeoutUnits) {
      const unit = timeoutUnits[key] || "ms";
      value = convertTimeoutToMilliseconds(value, unit);
    }

    return value.trim();
  });
}

function toStageChatSessionKey(relativePath: string, stageId: string): string {
  return `${relativePath}::${stageId}`;
}

export function ArtifactBrowserSurface(props: ArtifactBrowserSurfaceProps) {
  const [contextMenuTarget, setContextMenuTarget] = useState<ArtifactContextMenuTarget | undefined>(
    undefined,
  );
  const [workflowChecklistChatSession, setWorkflowChecklistChatSession] = useState<
    WorkflowChecklistChatSession | undefined
  >(undefined);
  const [commandParameterValuesByActionId, setCommandParameterValuesByActionId] = useState<
    Record<string, Record<string, string>>
  >({});
  const [commandParameterUnitsByActionId, setCommandParameterUnitsByActionId] = useState<
    Record<string, Record<string, string>>
  >({});
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const rootNode = props.model.nodes[""];
  const roots = useMemo(() => rootNode?.directories ?? [], [rootNode]);
  const activeNode = useMemo(
    () => getActiveNode(props.model, props.viewState),
    [props.model, props.viewState],
  );
  const breadcrumbs = useMemo(
    () => getBreadcrumbPaths(props.model, props.viewState.activeDirectoryPath),
    [props.model, props.viewState.activeDirectoryPath],
  );
  const selectedFile = useMemo<HierarchyFile | undefined>(
    () => activeNode.files.find((file) => file.relativePath === props.viewState.selectedFilePath),
    [activeNode, props.viewState.selectedFilePath],
  );
  const commandStagingActions = useMemo(
    () => (selectedFile ? buildCommandStagingActions(selectedFile.relativePath) : []),
    [selectedFile],
  );
  const runtimeOptions = useMemo(
    () => resolveRuntimeInventoryOptions(props.runtimesModel),
    [props.runtimesModel],
  );
  const readyRuntimeEndpointOptions = useMemo(
    () => resolveReadyRuntimeEndpointOptions(props.runtimesModel),
    [props.runtimesModel],
  );
  const runIdOptions = useMemo(() => resolveRecentRunIdOptions(props.runsModel), [props.runsModel]);
  const taskWorkflowContext = useMemo(
    () => (selectedFile ? resolveTaskWorkflowContext(selectedFile.relativePath) : undefined),
    [selectedFile],
  );
  const workflowStages = selectedFile?.taskMetadata?.workflowDetail?.stages ?? [];
  const selectedWorkflowStage = workflowStages.find(
    (stage) => stage.id === props.viewState.selectedWorkflowStageId,
  );
  const activeWorkflowChecklistChatStage = workflowChecklistChatSession
    ? workflowStages.find((stage) => stage.id === workflowChecklistChatSession.stageId)
    : undefined;
  const activeWorkflowChecklistChatState =
    workflowChecklistChatSession && selectedFile
      ? props.stageChatSessionsByKey[
          toStageChatSessionKey(selectedFile.relativePath, workflowChecklistChatSession.stageId)
        ]
      : undefined;
  const hasParent = Boolean(activeNode.parentRelativePath);
  const navigationGuidance = useMemo(
    () =>
      createArtifactNavigationGuidancePayload({
        activeDirectoryPath: props.viewState.activeDirectoryPath,
        breadcrumbCount: breadcrumbs.length,
      }),
    [breadcrumbs.length, props.viewState.activeDirectoryPath],
  );
  const rootsGuidance = useMemo(
    () =>
      createArtifactRootsGuidancePayload({
        rootCount: roots.length,
        activeDirectoryPath: props.viewState.activeDirectoryPath,
      }),
    [props.viewState.activeDirectoryPath, roots.length],
  );
  const directoriesGuidance = useMemo(
    () =>
      createArtifactDirectoriesGuidancePayload({
        directoryCount: activeNode.directories.length,
        activeDirectoryPath: props.viewState.activeDirectoryPath,
      }),
    [activeNode.directories.length, props.viewState.activeDirectoryPath],
  );
  const filesGuidance = useMemo(
    () =>
      createArtifactFilesGuidancePayload({
        fileCount: activeNode.files.length,
        activeDirectoryPath: props.viewState.activeDirectoryPath,
      }),
    [activeNode.files.length, props.viewState.activeDirectoryPath],
  );
  const fileActionsGuidance = useMemo(
    () =>
      createArtifactFileActionsGuidancePayload({
        selectedFilePath: selectedFile?.relativePath,
        hasWorkflowContext: Boolean(taskWorkflowContext),
        stagedCommandCount: commandStagingActions.length,
      }),
    [commandStagingActions.length, selectedFile?.relativePath, taskWorkflowContext],
  );
  const commandStagingGuidance = useMemo(
    () =>
      createArtifactCommandStagingGuidancePayload({
        selectedFilePath: selectedFile?.relativePath,
        stagedCommandCount: commandStagingActions.length,
      }),
    [commandStagingActions.length, selectedFile?.relativePath],
  );
  const workflowActionsGuidance = useMemo(
    () =>
      createArtifactWorkflowActionsGuidancePayload({
        selectedFilePath: selectedFile?.relativePath,
        hasWorkflowContext: Boolean(taskWorkflowContext),
      }),
    [selectedFile?.relativePath, taskWorkflowContext],
  );
  const workflowChecklistGuidance = useMemo(
    () =>
      createArtifactWorkflowChecklistGuidancePayload({
        selectedFilePath: selectedFile?.relativePath,
        stageCount: workflowStages.length,
        selectedStageId: props.viewState.selectedWorkflowStageId,
      }),
    [props.viewState.selectedWorkflowStageId, selectedFile?.relativePath, workflowStages.length],
  );
  const stageChatGuidance = useMemo(
    () =>
      createArtifactStageChatGuidancePayload({
        selectedFilePath: selectedFile?.relativePath,
        stageId: selectedWorkflowStage?.id,
        stageTitle: selectedWorkflowStage?.title,
      }),
    [selectedFile?.relativePath, selectedWorkflowStage?.id, selectedWorkflowStage?.title],
  );
  const selectedFileMetadataFields = useMemo<MetadataField[]>(() => {
    if (!selectedFile) {
      return [];
    }

    const relativePath = selectedFile.relativePath;
    if (isOverviewFilePath(relativePath)) {
      return [
        {
          label: "Schema Version",
          value: toDisplayValue(selectedFile.schemaVersion),
        },
        {
          label: "Updated At",
          value: toDisplayTimestamp(selectedFile.updatedAt),
        },
      ];
    }

    const taskContext = parseTaskContext(relativePath);
    if (taskContext) {
      return [
        {
          label: "Status",
          value: toDisplayValue(selectedFile.taskMetadata?.status),
        },
        {
          label: "Lane",
          value: taskContext.lane,
        },
        {
          label: "Task",
          value: `${taskContext.phaseId}/${taskContext.milestoneId}/${taskContext.taskId}`,
        },
        {
          label: "Workflow State",
          value: toDisplayValue(selectedFile.taskMetadata?.workflowSummary?.overallState),
        },
      ];
    }

    return [
      {
        label: "Updated At",
        value: toDisplayTimestamp(selectedFile.updatedAt),
      },
      {
        label: "Format",
        value: selectedFile.isMarkdown ? "Markdown" : "Other",
      },
    ];
  }, [selectedFile]);
  const relatedFiles = useMemo<RelatedFileEntry[]>(() => {
    if (!selectedFile) {
      return [];
    }

    const relatedByPath = new Map<
      string,
      {
        relativePath: string;
        file?: HierarchyFile;
        buckets: Set<RelatedMetadataBucket>;
      }
    >();
    const selectedPath = selectedFile.relativePath;
    const allFiles = Object.values(props.model.nodes).flatMap((node) => node.files);
    const filesByPath = new Map(allFiles.map((file) => [file.relativePath, file]));

    for (const bucket of RELATED_METADATA_BUCKETS) {
      const references = selectedFile.taskMetadata?.[bucket.key] ?? [];
      for (const reference of references) {
        const candidates = resolveReferenceCandidates(selectedPath, reference);
        const resolvedFile = candidates
          .map((candidate) => filesByPath.get(candidate))
          .find((file): file is HierarchyFile => Boolean(file));
        const referencePath = resolvedFile?.relativePath ?? candidates[0];

        if (!referencePath || referencePath === selectedPath) {
          continue;
        }

        const existing = relatedByPath.get(referencePath);
        if (existing) {
          existing.buckets.add(bucket.key);
          if (!existing.file && resolvedFile) {
            existing.file = resolvedFile;
          }
          continue;
        }

        relatedByPath.set(referencePath, {
          relativePath: referencePath,
          file: resolvedFile,
          buckets: new Set([bucket.key]),
        });
      }
    }

    return [...relatedByPath.values()]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .map((entry) => ({
        relativePath: entry.relativePath,
        ...(entry.file ? { file: entry.file } : {}),
        buckets: RELATED_METADATA_BUCKETS.map((bucket) => bucket.key).filter((bucket) =>
          entry.buckets.has(bucket),
        ),
      }));
  }, [props.model.nodes, selectedFile]);
  const breadcrumbItems = useMemo<BreadcrumbItem[]>(
    () =>
      breadcrumbs.map((path, index) => ({
        id: `${path}-${index}`,
        label: toBreadcrumbLabel(path),
        onSelect: () => props.setViewState((state) => openDirectory(props.model, state, path)),
      })),
    [breadcrumbs, props.model, props.setViewState],
  );

  useEffect(() => {
    if (!contextMenuTarget) {
      return;
    }

    const onDismissMenu = (event: MouseEvent | KeyboardEvent) => {
      const eventTarget = "target" in event ? event.target : null;
      if (eventTarget instanceof Node && contextMenuRef.current?.contains(eventTarget)) {
        return;
      }

      setContextMenuTarget(undefined);
    };

    window.addEventListener("click", onDismissMenu);
    window.addEventListener("keydown", onDismissMenu);

    return () => {
      window.removeEventListener("click", onDismissMenu);
      window.removeEventListener("keydown", onDismissMenu);
    };
  }, [contextMenuTarget]);

  useEffect(() => {
    setCommandParameterValuesByActionId((previous) => {
      const next: Record<string, Record<string, string>> = {};

      for (const action of commandStagingActions) {
        const parameters = extractCommandParameters(action.command);
        const previousValues = previous[action.id] ?? {};
        const parameterValues: Record<string, string> = {};

        for (const parameter of parameters) {
          const defaultValue =
            parameter.toLowerCase() === "runtime"
              ? (runtimeOptions[0] ?? "local")
              : toDefaultCommandParameterValue(parameter);
          parameterValues[parameter] = previousValues[parameter] ?? defaultValue;
        }

        next[action.id] = parameterValues;
      }

      return next;
    });
  }, [commandStagingActions, runtimeOptions]);

  useEffect(() => {
    if (!workflowChecklistChatSession) {
      return;
    }

    if (
      !selectedFile ||
      selectedFile.relativePath !== workflowChecklistChatSession.relativePath ||
      !activeWorkflowChecklistChatStage
    ) {
      setWorkflowChecklistChatSession(undefined);
      return;
    }

    const hasMatchingItem = activeWorkflowChecklistChatStage.items.some(
      (item) => item.id === workflowChecklistChatSession.itemId,
    );
    if (!hasMatchingItem) {
      setWorkflowChecklistChatSession(undefined);
    }
  }, [
    activeWorkflowChecklistChatStage,
    selectedFile,
    workflowChecklistChatSession,
    workflowStages,
  ]);

  useEffect(() => {
    if (!workflowChecklistChatSession) {
      return;
    }

    const nextRuntime = readyRuntimeEndpointOptions[0];
    if (!nextRuntime) {
      return;
    }

    if (readyRuntimeEndpointOptions.includes(workflowChecklistChatSession.runtime)) {
      return;
    }

    setWorkflowChecklistChatSession((previous) =>
      previous
        ? {
            ...previous,
            runtime: nextRuntime,
          }
        : previous,
    );
  }, [readyRuntimeEndpointOptions, workflowChecklistChatSession]);

  const openContextMenuForTarget = (
    event: MouseEvent,
    input: { type: ArtifactContextMenuTargetType; relativePath: string },
  ) => {
    event.preventDefault();
    setContextMenuTarget({
      type: input.type,
      relativePath: input.relativePath,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const runContextMenuDeleteAction = () => {
    if (!contextMenuTarget) {
      return;
    }

    props.postMessage({
      type: contextMenuTarget.type === "directory" ? "deleteDirectory" : "deleteFile",
      relativePath: contextMenuTarget.relativePath,
    });
    setContextMenuTarget(undefined);
  };

  const isWorkflowChecklistChatMode = Boolean(
    selectedFile && workflowChecklistChatSession && activeWorkflowChecklistChatStage,
  );

  if (
    isWorkflowChecklistChatMode &&
    selectedFile &&
    workflowChecklistChatSession &&
    activeWorkflowChecklistChatStage
  ) {
    const defaultChecklistChatIntent =
      `For checklist item ${workflowChecklistChatSession.itemId} (${workflowChecklistChatSession.itemLabel}), ` +
      "summarize current status and recommend next steps.";
    const chatTurns = activeWorkflowChecklistChatState?.turns ?? [];
    const runtimeState = activeWorkflowChecklistChatState?.runtimeState ?? "idle";
    const statusMessage = activeWorkflowChecklistChatState?.statusMessage ?? "";
    const lastFailedMessage = activeWorkflowChecklistChatState?.lastFailedMessage ?? "";
    const sessionStatus = activeWorkflowChecklistChatState?.sessionStatus ?? "none";
    const lifecycleActions =
      activeWorkflowChecklistChatState?.availableActions ??
      resolveStageChatLifecycleActions(sessionStatus);
    const postStageChatLifecycleAction = (action: StageChatLifecycleAction) => {
      props.postMessage({
        type: "stageChatCommand",
        command: toStageChatCommandId(action),
        relativePath: selectedFile.relativePath,
        stageId: activeWorkflowChecklistChatStage.id,
        stageTitle: activeWorkflowChecklistChatStage.title,
        runtime: workflowChecklistChatSession.runtime,
        action,
      });
    };
    const sendChecklistChatIntent = (messageText: string) => {
      const trimmedMessage = messageText.trim();
      if (!trimmedMessage) {
        return;
      }

      props.onSendStageChatIntent(
        toStageChatSendIntentMessage({
          relativePath: selectedFile.relativePath,
          stageId: activeWorkflowChecklistChatStage.id,
          stageTitle: activeWorkflowChecklistChatStage.title,
          runtime: workflowChecklistChatSession.runtime,
          messageText: trimmedMessage,
        }),
      );
      props.setViewState((state) => setStageChatIntentDraft(state, ""));
    };

    return (
      <Surface className="pa-artifact-chat-mode">
        <SurfaceSection
          title="Workflow Stage Chat"
          description="Checklist chat mode focuses on one stage item at a time and hides the rest of the artifact workspace while you work through the stage conversation."
          className="pa-workflow-chat-mode-section"
        >
          <div class="pa-workflow-chat-mode-shell">
            <div class="pa-workflow-chat-mode-header">
              <div class="pa-workflow-chat-mode-context">
                <p>
                  Task: <CodeText>{selectedFile.relativePath}</CodeText>
                </p>
                <p>
                  Stage: <CodeText>{activeWorkflowChecklistChatStage.title}</CodeText> (
                  <CodeText>{activeWorkflowChecklistChatStage.id}</CodeText>)
                </p>
                <p>
                  Checklist Item: <CodeText>{workflowChecklistChatSession.itemId}</CodeText>{" "}
                  {workflowChecklistChatSession.itemLabel}
                </p>
                <p>
                  Session: <CodeText>{toStageChatSessionStatusLabel(sessionStatus)}</CodeText>
                  {activeWorkflowChecklistChatState?.runtimeClass ? (
                    <>
                      {" "}
                      · Runtime Class:{" "}
                      <CodeText>{activeWorkflowChecklistChatState.runtimeClass}</CodeText>
                    </>
                  ) : null}
                </p>
              </div>
              <ActionRow>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setWorkflowChecklistChatSession(undefined)}
                >
                  Back to Workflow Checklist
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => props.onOpenGuidance(stageChatGuidance)}
                >
                  Stage Chat Help
                </Button>
              </ActionRow>
            </div>

            <div class="pa-workflow-chat-mode-body">
              <div class="pa-workflow-chat-transcript">
                {chatTurns.length > 0 ? (
                  <div class="pa-workflow-chat-transcript-list">
                    {chatTurns.map((turn, index) => {
                      const isStreamingAssistantTurn =
                        runtimeState === "sending" &&
                        turn.role === "assistant" &&
                        index === chatTurns.length - 1;

                      return (
                        <div
                          key={`${turn.role}-${index}`}
                          class={`pa-workflow-chat-turn pa-workflow-chat-turn-${turn.role}`}
                        >
                          <div class="pa-workflow-chat-turn-header">
                            <strong>{turn.role === "assistant" ? "Assistant" : "You"}</strong>
                            {isStreamingAssistantTurn ? (
                              <span class="pa-workflow-chat-streaming">Streaming…</span>
                            ) : null}
                          </div>
                          <div
                            class="pa-workflow-chat-turn-content"
                            dangerouslySetInnerHTML={{
                              __html: renderStageChatTurnMarkdown(turn.content),
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div class="pa-workflow-chat-transcript-card">
                    <p>
                      Endpoint: <CodeText>{workflowChecklistChatSession.runtime}</CodeText>
                    </p>
                    <p>
                      No messages yet. Use the composer below to start a stage-chat conversation for
                      this checklist item.
                    </p>
                  </div>
                )}
              </div>

              <div class="pa-workflow-chat-composer">
                <label class="pa-workflow-chat-endpoint-field">
                  Endpoint
                  <Select
                    value={workflowChecklistChatSession.runtime}
                    onInput={(event) =>
                      setWorkflowChecklistChatSession((previous) =>
                        previous
                          ? {
                              ...previous,
                              runtime: (event.currentTarget as HTMLSelectElement).value,
                            }
                          : previous,
                      )
                    }
                  >
                    {readyRuntimeEndpointOptions.map((runtimeOption) => (
                      <option
                        key={`workflow-checklist-chat-runtime-${runtimeOption}`}
                        value={runtimeOption}
                      >
                        {runtimeOption}
                      </option>
                    ))}
                  </Select>
                </label>

                <textarea
                  value={props.viewState.stageChatIntentDraft ?? ""}
                  onInput={(event) =>
                    props.setViewState((state) =>
                      setStageChatIntentDraft(
                        state,
                        (event.currentTarget as HTMLTextAreaElement).value,
                      ),
                    )
                  }
                  placeholder="Describe what you need for this checklist item"
                  class="pa-workflow-chat-mode-input"
                />

                <ActionRow>
                  {lifecycleActions.includes("open") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => postStageChatLifecycleAction("open")}
                    >
                      Open Stage Chat
                    </Button>
                  ) : null}
                  {lifecycleActions.includes("resume") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => postStageChatLifecycleAction("resume")}
                    >
                      Resume Stage Chat
                    </Button>
                  ) : null}
                  {lifecycleActions.includes("reset") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => postStageChatLifecycleAction("reset")}
                    >
                      Reset Session
                    </Button>
                  ) : null}
                  {lifecycleActions.includes("discard") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => postStageChatLifecycleAction("discard")}
                    >
                      Discard Session
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      sendChecklistChatIntent(
                        (props.viewState.stageChatIntentDraft ?? "").trim() ||
                          defaultChecklistChatIntent,
                      )
                    }
                  >
                    Send
                  </Button>
                  {runtimeState === "sending" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        props.postMessage(
                          toStageChatStopResponseMessage({
                            relativePath: selectedFile.relativePath,
                            stageId: activeWorkflowChecklistChatStage.id,
                            stageTitle: activeWorkflowChecklistChatStage.title,
                          }),
                        )
                      }
                    >
                      Stop Response
                    </Button>
                  ) : null}
                  {runtimeState === "error" && lastFailedMessage ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => sendChecklistChatIntent(lastFailedMessage)}
                    >
                      Retry Last Message
                    </Button>
                  ) : null}
                </ActionRow>
                {statusMessage ? (
                  <div class="pa-workflow-chat-status" data-runtime-state={runtimeState}>
                    {statusMessage}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </SurfaceSection>
      </Surface>
    );
  }

  return (
    <Surface>
      <SurfaceSection
        title="Roots Navigation"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Roots Navigation Help"
            onClick={() => props.onOpenGuidance(rootsGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {roots.length > 0 ? (
          <div class="pa-artifact-roots-row">
            {roots.map((root) => (
              <Button
                key={root.relativePath}
                class="pa-artifact-roots-row-button"
                variant="secondary"
                type="button"
                onClick={() =>
                  props.setViewState((state) =>
                    openDirectory(props.model, state, root.relativePath),
                  )
                }
              >
                {root.relativePath}
              </Button>
            ))}
          </div>
        ) : (
          <EmptyState>No project-arch roots detected in workspace.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection
        title="Navigation"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Navigation Help"
            onClick={() => props.onOpenGuidance(navigationGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        <div class="pa-artifact-breadcrumbs">
          <span>Breadcrumbs:</span>
          <BreadcrumbTrail items={breadcrumbItems} />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => props.setViewState((state) => openParentDirectory(props.model, state))}
          disabled={!hasParent}
        >
          Up
        </Button>
      </SurfaceSection>

      <SurfaceSection
        title="Directories"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Directories Help"
            onClick={() => props.onOpenGuidance(directoriesGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {activeNode.directories.length > 0 ? (
          <div class="pa-artifact-directory-cards">
            {activeNode.directories.map((directory) => (
              <Button
                key={directory.relativePath}
                type="button"
                variant="secondary"
                class="pa-artifact-directory-card"
                title={directory.relativePath}
                onContextMenu={(event) =>
                  openContextMenuForTarget(event, {
                    type: "directory",
                    relativePath: directory.relativePath,
                  })
                }
                onClick={() =>
                  props.setViewState((state) =>
                    openDirectory(props.model, state, directory.relativePath),
                  )
                }
              >
                <span class="pa-artifact-directory-card-icon" aria-hidden="true">
                  📁
                </span>
                <span class="pa-artifact-directory-card-name">
                  {toPathLeafLabel(directory.relativePath, directory.relativePath)}
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <EmptyState>No child directories in this location.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection
        title="Files"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Files Help"
            onClick={() => props.onOpenGuidance(filesGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {activeNode.files.length > 0 ? (
          <div class="pa-artifact-file-cards">
            {activeNode.files.map((file) => (
              <Button
                key={file.relativePath}
                type="button"
                variant="secondary"
                class="pa-artifact-file-card"
                title={file.relativePath}
                data-pa-selected={
                  props.viewState.selectedFilePath === file.relativePath ? "true" : "false"
                }
                onContextMenu={(event) =>
                  openContextMenuForTarget(event, {
                    type: "file",
                    relativePath: file.relativePath,
                  })
                }
                onClick={() =>
                  props.setViewState((state) => selectFile(props.model, state, file.relativePath))
                }
              >
                <span class="pa-artifact-file-card-icon" aria-hidden="true">
                  📄
                </span>
                <span class="pa-artifact-file-card-name">
                  {toPathLeafLabel(file.relativePath, file.relativePath)}
                </span>
                {props.viewState.selectedFilePath === file.relativePath ? (
                  <span class="pa-artifact-file-card-selected">Selected</span>
                ) : null}
              </Button>
            ))}
          </div>
        ) : (
          <EmptyState>No files discovered in this location.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection
        title="Selected File Actions"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="File Actions Help"
            onClick={() => props.onOpenGuidance(fileActionsGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {selectedFile ? (
          <ul>
            {selectedFileMetadataFields.map((field) => (
              <li key={field.label}>
                <strong>{field.label}:</strong> <CodeText>{field.value}</CodeText>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Select a file to view file-type metadata and actions.</EmptyState>
        )}
        <ActionRow>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              selectedFile
                ? props.postMessage({
                    type: "openEdit",
                    relativePath: selectedFile.relativePath,
                  })
                : undefined
            }
            disabled={!selectedFile}
          >
            Open
          </Button>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              selectedFile
                ? props.postMessage({
                    type: "copyPath",
                    relativePath: selectedFile.relativePath,
                  })
                : undefined
            }
            disabled={!selectedFile}
          >
            Copy Path
          </Button>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              selectedFile
                ? props.postMessage({
                    type: "openPreview",
                    relativePath: selectedFile.relativePath,
                  })
                : undefined
            }
            disabled={!selectedFile}
          >
            Preview
          </Button>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              selectedFile
                ? props.postMessage({
                    type: "revealInExplorer",
                    relativePath: selectedFile.relativePath,
                  })
                : undefined
            }
            disabled={!selectedFile}
          >
            Reveal in Explorer
          </Button>
        </ActionRow>
        {selectedFile ? (
          relatedFiles.length > 0 ? (
            <div class="pa-artifact-related-files">
              <strong>Related files</strong>
              <div class="pa-artifact-related-file-actions">
                {relatedFiles.map((entry) => (
                  <div key={entry.relativePath} class="pa-artifact-related-file-entry">
                    <span class="pa-artifact-related-file-buckets">{entry.buckets.join(", ")}</span>
                    <span class="pa-artifact-related-file-name" title={entry.relativePath}>
                      {toPathLeafLabel(entry.relativePath, entry.relativePath)}
                    </span>
                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          props.postMessage({
                            type: "openEdit",
                            relativePath: entry.relativePath,
                          })
                        }
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          props.postMessage({
                            type: "openPreview",
                            relativePath: entry.relativePath,
                          })
                        }
                      >
                        Preview
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState>No related files discovered for the current selection.</EmptyState>
          )
        ) : null}
      </SurfaceSection>

      <SurfaceSection
        title="Workflow Actions"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Workflow Actions Help"
            onClick={() => props.onOpenGuidance(workflowActionsGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {selectedFile && taskWorkflowContext ? (
          <ActionRow>
            <Button
              type="button"
              variant="secondary"
              title="Launches a runtime-backed task run for the currently selected task artifact."
              onClick={() =>
                props.postMessage(
                  toLaunchTaskMessage({
                    taskRef: taskWorkflowContext.taskRef,
                    relativePath: selectedFile.relativePath,
                  }),
                )
              }
            >
              Launch Run
            </Button>{" "}
            <Button
              type="button"
              variant="secondary"
              title="Creates a discovered follow-up task in the same phase and milestone, linked from the selected task."
              onClick={() =>
                props.postMessage(
                  toCreateDiscoveredFromSelectedTaskMessage({
                    phaseId: taskWorkflowContext.taskContext.phaseId,
                    milestoneId: taskWorkflowContext.taskContext.milestoneId,
                    fromTaskId: taskWorkflowContext.taskContext.taskId,
                  }),
                )
              }
            >
              Create Discovered
            </Button>{" "}
            <Button
              type="button"
              variant="secondary"
              title="Creates a new planned task in the current phase and milestone with guided slug creation."
              onClick={() =>
                props.postMessage(
                  toCreateLaneTaskMessage({
                    phaseId: taskWorkflowContext.taskContext.phaseId,
                    milestoneId: taskWorkflowContext.taskContext.milestoneId,
                    lane: "planned",
                    withSlug: true,
                  }),
                )
              }
            >
              Create Planned
            </Button>{" "}
            <Button
              type="button"
              variant="secondary"
              title="Creates a new backlog task in the current phase and milestone with guided slug creation."
              onClick={() =>
                props.postMessage(
                  toCreateLaneTaskMessage({
                    phaseId: taskWorkflowContext.taskContext.phaseId,
                    milestoneId: taskWorkflowContext.taskContext.milestoneId,
                    lane: "backlog",
                    withSlug: true,
                  }),
                )
              }
            >
              Create Backlog
            </Button>
          </ActionRow>
        ) : (
          <EmptyState>Select a task file to access workflow-aware task actions.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection
        title="Command Staging"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Command Staging Help"
            onClick={() => props.onOpenGuidance(commandStagingGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {selectedFile && commandStagingActions.length > 0 ? (
          <div class="pa-command-staging-map">
            {commandStagingActions.map((action) => {
              const parameters = extractCommandParameters(action.command);
              const parameterValues = commandParameterValuesByActionId[action.id] ?? {};
              const parameterUnits = commandParameterUnitsByActionId[action.id] ?? {};
              const resolvedCommand = resolveCommandTemplate(
                action.command,
                parameterValues,
                parameterUnits,
              );
              const hasMissingParameters = parameters.some(
                (parameter) => (parameterValues[parameter] ?? "").trim().length === 0,
              );

              return (
                <div key={action.id} class="pa-command-staging-subsection">
                  <h4 class="pa-command-staging-subsection-title">{action.label}</h4>
                  {parameters.length > 0 ? (
                    <div class="pa-command-staging-parameter-grid">
                      {parameters.map((parameter) => {
                        const control = toCommandParameterControl(parameter);
                        const value = parameterValues[parameter] ?? "";
                        const unit = parameterUnits[parameter] ?? "ms";

                        return (
                          <label
                            key={`${action.id}-${parameter}`}
                            class="pa-command-staging-parameter-field"
                          >
                            <span>
                              {control === "timeout"
                                ? "Timeout"
                                : toCommandParameterLabel(parameter)}
                            </span>
                            {control === "select" ? (
                              parameter.toLowerCase() === "runid" ? (
                                runIdOptions.length > 0 ? (
                                  <Select
                                    value={value}
                                    onInput={(event) =>
                                      setCommandParameterValuesByActionId((previous) => ({
                                        ...previous,
                                        [action.id]: {
                                          ...(previous[action.id] ?? {}),
                                          [parameter]: (event.currentTarget as HTMLSelectElement)
                                            .value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">Select a run...</option>
                                    {runIdOptions.map((runId) => (
                                      <option
                                        key={`${action.id}-${parameter}-${runId}`}
                                        value={runId}
                                      >
                                        {runId}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <div class="pa-command-parameter-empty-state">
                                    No recent runs available. Check the Runs panel to see recent
                                    activity.
                                  </div>
                                )
                              ) : (
                                <Select
                                  value={value}
                                  onInput={(event) =>
                                    setCommandParameterValuesByActionId((previous) => ({
                                      ...previous,
                                      [action.id]: {
                                        ...(previous[action.id] ?? {}),
                                        [parameter]: (event.currentTarget as HTMLSelectElement)
                                          .value,
                                      },
                                    }))
                                  }
                                >
                                  {runtimeOptions.map((runtimeOption) => (
                                    <option
                                      key={`${action.id}-${parameter}-${runtimeOption}`}
                                      value={runtimeOption}
                                    >
                                      {runtimeOption}
                                    </option>
                                  ))}
                                </Select>
                              )
                            ) : control === "timeout" ? (
                              <div class="pa-timeout-input-group">
                                <Input
                                  type="number"
                                  min="0"
                                  value={value}
                                  onInput={(event) =>
                                    setCommandParameterValuesByActionId((previous) => ({
                                      ...previous,
                                      [action.id]: {
                                        ...(previous[action.id] ?? {}),
                                        [parameter]: (event.currentTarget as HTMLInputElement)
                                          .value,
                                      },
                                    }))
                                  }
                                  placeholder="Value"
                                />
                                <Select
                                  value={unit}
                                  onInput={(event) =>
                                    setCommandParameterUnitsByActionId((previous) => ({
                                      ...previous,
                                      [action.id]: {
                                        ...(previous[action.id] ?? {}),
                                        [parameter]: (event.currentTarget as HTMLSelectElement)
                                          .value,
                                      },
                                    }))
                                  }
                                >
                                  <option value="ms">milliseconds</option>
                                  <option value="sec">seconds</option>
                                  <option value="min">minutes</option>
                                  <option value="hr">hours</option>
                                </Select>
                              </div>
                            ) : (
                              <Input
                                type="text"
                                value={value}
                                placeholder={`Enter ${parameter}`}
                                onInput={(event) =>
                                  setCommandParameterValuesByActionId((previous) => ({
                                    ...previous,
                                    [action.id]: {
                                      ...(previous[action.id] ?? {}),
                                      [parameter]: (event.currentTarget as HTMLInputElement).value,
                                    },
                                  }))
                                }
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  <p>
                    Resolved Command: <CodeText>{resolvedCommand}</CodeText>
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={hasMissingParameters}
                    onClick={() =>
                      props.postMessage(
                        toStagedRunCommandMessage({
                          command: resolvedCommand,
                          relativePath: selectedFile.relativePath,
                        }),
                      )
                    }
                  >
                    Stage Command
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState>Select a task file to stage task-scoped commands.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection
        title="Workflow Checklist"
        titleAction={
          <Button
            type="button"
            variant="icon"
            aria-label="Workflow Checklist Help"
            onClick={() => props.onOpenGuidance(workflowChecklistGuidance)}
          >
            ⓘ
          </Button>
        }
      >
        {selectedFile && workflowStages.length > 0 ? (
          <div class="pa-command-staging-map">
            {workflowStages.map((stage) => {
              const isSelectedStage = props.viewState.selectedWorkflowStageId === stage.id;
              const stageChatState = selectedFile
                ? props.stageChatSessionsByKey[
                    toStageChatSessionKey(selectedFile.relativePath, stage.id)
                  ]
                : undefined;
              const stageChatSessionStatus = stageChatState?.sessionStatus ?? "none";
              const stageChatLifecycleActions =
                stageChatState?.availableActions ??
                resolveStageChatLifecycleActions(stageChatSessionStatus);
              const primaryStageChatAction = stageChatLifecycleActions.includes("resume")
                ? "resume"
                : "open";

              return (
                <div key={stage.id} class="pa-command-staging-subsection">
                  <h4 class="pa-command-staging-subsection-title">{stage.title}</h4>
                  <p>
                    Stage ID: <CodeText>{stage.id}</CodeText>
                    {isSelectedStage ? (
                      <span class="pa-selected-stage-badge">Selected Stage</span>
                    ) : null}
                  </p>
                  <p>
                    Chat Session:{" "}
                    <CodeText>{toStageChatSessionStatusLabel(stageChatSessionStatus)}</CodeText>
                    {stageChatState?.runtimeClass ? (
                      <>
                        {" "}
                        · Runtime Class: <CodeText>{stageChatState.runtimeClass}</CodeText>
                      </>
                    ) : null}
                  </p>
                  <ActionRow>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        props.setViewState((state) =>
                          selectWorkflowStage(props.model, state, stage.id),
                        )
                      }
                    >
                      Select Stage
                    </Button>
                  </ActionRow>
                  {stage.items.length > 0 ? (
                    <div class="pa-workflow-stage-item-list">
                      {stage.items.map((item) => (
                        <div key={item.id} class="pa-workflow-stage-item">
                          <span>
                            <CodeText>{item.id}</CodeText> {item.label}
                          </span>
                          <p>
                            Status: <CodeText>{item.status}</CodeText>
                          </p>
                          <ActionRow>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                props.setViewState((state) =>
                                  setStageChatIntentDraft(
                                    selectWorkflowStage(props.model, state, stage.id),
                                    `For checklist item ${item.id} (${item.label}), summarize current status and recommend next steps.`,
                                  ),
                                );
                                const selectedRuntime = readyRuntimeEndpointOptions[0] ?? "local";
                                setWorkflowChecklistChatSession({
                                  relativePath: selectedFile.relativePath,
                                  stageId: stage.id,
                                  itemId: item.id,
                                  itemLabel: item.label,
                                  runtime: selectedRuntime,
                                });
                                props.postMessage({
                                  type: "stageChatCommand",
                                  command: toStageChatCommandId(primaryStageChatAction),
                                  relativePath: selectedFile.relativePath,
                                  stageId: stage.id,
                                  stageTitle: stage.title,
                                  runtime: selectedRuntime,
                                  action: primaryStageChatAction,
                                });
                              }}
                            >
                              {primaryStageChatAction === "resume" ? "Resume Chat" : "Start Chat"}
                            </Button>
                            {stageChatLifecycleActions.includes("reset") ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  props.postMessage({
                                    type: "stageChatCommand",
                                    command: RESET_STAGE_CHAT_WORKFLOW_COMMAND_ID,
                                    relativePath: selectedFile.relativePath,
                                    stageId: stage.id,
                                    stageTitle: stage.title,
                                    runtime:
                                      workflowChecklistChatSession?.runtime ??
                                      readyRuntimeEndpointOptions[0] ??
                                      "local",
                                    action: "reset",
                                  })
                                }
                              >
                                Reset Chat
                              </Button>
                            ) : null}
                            {stageChatLifecycleActions.includes("discard") ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  props.postMessage({
                                    type: "stageChatCommand",
                                    command: DISCARD_STAGE_CHAT_WORKFLOW_COMMAND_ID,
                                    relativePath: selectedFile.relativePath,
                                    stageId: stage.id,
                                    stageTitle: stage.title,
                                    runtime:
                                      workflowChecklistChatSession?.runtime ??
                                      readyRuntimeEndpointOptions[0] ??
                                      "local",
                                    action: "discard",
                                  })
                                }
                              >
                                Discard Chat
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                props.postMessage(
                                  toUpdateWorkflowChecklistItemMessage({
                                    relativePath: selectedFile.relativePath,
                                    stageId: stage.id,
                                    itemId: item.id,
                                    status: "in_progress",
                                  }),
                                )
                              }
                            >
                              In Progress
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                props.postMessage(
                                  toUpdateWorkflowChecklistItemMessage({
                                    relativePath: selectedFile.relativePath,
                                    stageId: stage.id,
                                    itemId: item.id,
                                    status: "done",
                                  }),
                                )
                              }
                            >
                              Done
                            </Button>
                          </ActionRow>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>No checklist items for this stage.</EmptyState>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState>No workflow detail available for the selected file.</EmptyState>
        )}
      </SurfaceSection>
      {contextMenuTarget ? (
        <div
          ref={contextMenuRef}
          class="pa-artifact-context-menu"
          style={`left: ${contextMenuTarget.x}px; top: ${contextMenuTarget.y}px;`}
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="secondary"
            class="pa-artifact-context-menu-action"
            onClick={() => runContextMenuDeleteAction()}
          >
            Delete {contextMenuTarget.type}
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}
