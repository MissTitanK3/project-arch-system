import { promises as fs } from "node:fs";
import path from "node:path";
import type * as vscode from "vscode";
import { tasks } from "project-arch";
import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";
import {
  loadRuntimeProfileLaunchBoundaryModel,
  type RuntimeLaunchProfileOption,
  type RuntimeProfileLaunchBoundaryModel,
} from "../integration/runtimeProfileLaunchBoundary";
import {
  createRoutingDriftAcknowledgmentBoundary,
  type RoutingDriftStateStore,
} from "../integration/routingDriftAcknowledgmentBoundary";
import { createStageRuntimeRoutingBoundary } from "../integration/stageRuntimeRoutingBoundary";
import { createTaskWorkflowMetadataBoundary } from "../integration/taskWorkflowMetadataBoundary";
import {
  DISCARD_STAGE_CHAT_COMMAND_ID,
  OPEN_STAGE_CHAT_COMMAND_ID,
  RESET_STAGE_CHAT_COMMAND_ID,
  RETURN_TO_WORKFLOW_VIEW_COMMAND_ID,
  resolveStageChatLifecycleActions,
  resolveStageChatSessionStatus,
} from "./stageChatWorkflowView";
import { resolveStageChatSessionBoundary } from "./stageChatSessionAccess";
import type { StageChatSessionStateStore } from "../integration/stageChatSessionStoreBoundary";
import {
  OPEN_ARTIFACT_INSPECTOR_COMMAND_ID,
  registerArtifactInspectorPanel,
} from "./artifactInspectorPanel";
import {
  type ArtifactBrowserModel,
  buildArtifactBrowserModel,
  type NormalizedTaskWorkflow,
} from "./artifactBrowserModelLoader";
import {
  EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCHEMA_VERSION,
  EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCRIPT_ID,
  type CommandCatalogStageCommandMessage,
  type ExperimentalArtifactBrowserBootstrap,
  type RuntimeProfileMutationMessage,
  isWebviewToHostMessage,
} from "./artifactBrowserMessageContracts";
import {
  buildCommandCatalogModel,
  STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID,
  STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID,
} from "./commandCatalogView";
import { loadLifecycleShellModelSnapshot, runLifecycleRemoveFlow } from "./lifecycleView";
import { buildRunsPanelModel } from "./runsView";
import { loadRuntimesPanelModelSnapshot, runRuntimeProfileMutationFlow } from "./runtimesView";

export const ARTIFACT_TREE_VIEW_ID = "projectArch.artifacts" as const;
export const REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID =
  "projectArch.refreshArtifactNavigation" as const;
export const EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID = "projectArch.artifacts.experimental" as const;
export const REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID =
  "projectArch.refreshArtifactNavigationExperimental" as const;
const DEFAULT_AGENT_TIMEOUT_MS = 30_000;
const SHELL_SNAPSHOT_TIMEOUT_MS = 1_500;
const DEFAULT_STAGE_CHAT_TRANSCRIPTS_STATE_KEY = "projectArch.stageChat.transcripts.v1" as const;

interface PersistedStageChatTurn {
  role: "assistant" | "user";
  content: string;
}

interface PersistedStageChatTranscriptRecord {
  relativePath: string;
  stageId: string;
  stageTitle: string;
  turns: PersistedStageChatTurn[];
  updatedAt: number;
}

type PersistedStageChatTranscriptMap = Record<string, PersistedStageChatTranscriptRecord>;

interface ArtifactNavigationSurfaceDefinition {
  viewId: string;
  refreshCommandId: string;
}

export const BASELINE_ARTIFACT_NAVIGATION_SURFACE: ArtifactNavigationSurfaceDefinition = {
  viewId: ARTIFACT_TREE_VIEW_ID,
  refreshCommandId: REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID,
};

export const EXPERIMENTAL_ARTIFACT_NAVIGATION_SURFACE: ArtifactNavigationSurfaceDefinition = {
  viewId: EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID,
  refreshCommandId: REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID,
};

export const ARTIFACT_NAVIGATION_SURFACES: readonly ArtifactNavigationSurfaceDefinition[] = [
  EXPERIMENTAL_ARTIFACT_NAVIGATION_SURFACE,
  BASELINE_ARTIFACT_NAVIGATION_SURFACE,
];

interface ArtifactNavigationDependencies {
  boundary?: ProjectArchBoundary;
  loadRuntimeProfiles?: (input: {
    boundary: ProjectArchBoundary;
    workspaceRoot: string;
  }) => Promise<RuntimeProfileLaunchBoundaryModel>;
}

type TaskLane = "planned" | "discovered" | "backlog";
type TaskWorkflowItemStatus = "planned" | "in_progress" | "done" | "blocked" | "skipped";

interface CommandDrivenChecklistOfferDefinition {
  commandPattern: RegExp;
  stageId: string;
  preferredItemIds: string[];
  targetStatus: TaskWorkflowItemStatus;
}

const COMMAND_DRIVEN_CHECKLIST_OFFERS: CommandDrivenChecklistOfferDefinition[] = [
  {
    commandPattern: /^pa\s+learn\s+--path\s+/i,
    stageId: "context-readiness",
    preferredItemIds: ["inspect-dependencies", "inspect-context", "review-scope"],
    targetStatus: "done",
  },
  {
    commandPattern: /^pa\s+agent\s+prepare\s+/i,
    stageId: "task-refinement",
    preferredItemIds: ["update-task"],
    targetStatus: "in_progress",
  },
  {
    commandPattern: /^pa\s+agent\s+(run|orchestrate)\s+/i,
    stageId: "implementation",
    preferredItemIds: ["implement-slice"],
    targetStatus: "in_progress",
  },
  {
    commandPattern: /^pa\s+check\s+--file\s+/i,
    stageId: "validation",
    preferredItemIds: ["run-checks"],
    targetStatus: "done",
  },
  {
    commandPattern: /^pa\s+result\s+import\s+/i,
    stageId: "follow-up-closure",
    preferredItemIds: ["capture-follow-up"],
    targetStatus: "in_progress",
  },
];

const CHECKLIST_PROMPT_SUPPRESSION_WINDOW_MS = 5 * 60 * 1000;
const ROUTING_DRIFT_ACK_STATE_KEY = "projectArch.routingDriftAckByTask.v1";

const taskWorkflowMetadataBoundary = createTaskWorkflowMetadataBoundary();
const stageRuntimeRoutingBoundary = createStageRuntimeRoutingBoundary();
const routingDriftAcknowledgmentBoundary = createRoutingDriftAcknowledgmentBoundary();

function createInMemoryDriftStateStore(): RoutingDriftStateStore {
  const state = new Map<string, unknown>();
  return {
    get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
    update: async (key: string, value: unknown): Promise<void> => {
      state.set(key, value);
    },
  };
}

function parseAgentCommandContext(command: string):
  | {
      mode: "run" | "orchestrate";
      taskRef: string;
    }
  | undefined {
  const match = command.trim().match(/^pa\s+agent\s+(run|orchestrate)\s+(\S+)/i);
  if (!match) {
    return undefined;
  }

  const mode = match[1]?.toLowerCase() === "orchestrate" ? "orchestrate" : "run";
  const taskRef = match[2]?.trim();
  if (!taskRef) {
    return undefined;
  }

  return {
    mode,
    taskRef,
  };
}

function pickFallbackRuntimeOption(input: {
  runtimeProfiles: RuntimeProfileLaunchBoundaryModel;
  alternatives: Array<"local" | "cloud" | "hybrid" | "deterministic">;
}): RuntimeLaunchProfileOption | undefined {
  for (const alternative of input.alternatives) {
    if (alternative !== "local" && alternative !== "cloud") {
      continue;
    }

    const option = input.runtimeProfiles.options.find(
      (candidate) =>
        candidate.runtime === alternative && candidate.enabled && candidate.eligibility === "ready",
    );

    if (option) {
      return option;
    }
  }

  return undefined;
}

function buildFallbackRunCommand(input: {
  mode: "run" | "orchestrate";
  taskRef: string;
  fallbackOption: RuntimeLaunchProfileOption;
}): string {
  return (
    `pa runtime check ${input.fallbackOption.id} --json && ` +
    `pa agent ${input.mode} ${input.taskRef} --runtime ${input.fallbackOption.runtime} --json`
  );
}

function inferArtifactInspectorKind(relativePath: string): "task" | "run" | "audit" | "diff" {
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

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function renderWorkflowFrontmatterLines(workflow: NormalizedTaskWorkflow): string[] {
  const lines: string[] = [
    "workflow:",
    '  schemaVersion: "2.0"',
    `  template: ${workflow.workflow.template}`,
    "  stages:",
  ];

  for (const stage of workflow.workflow.stages) {
    lines.push(`    - id: ${stage.id}`);
    lines.push(`      title: ${quoteYamlString(stage.title)}`);
    lines.push(`      runtimePreference: ${stage.runtimePreference}`);
    lines.push("      items:");

    for (const item of stage.items) {
      lines.push(`        - id: ${item.id}`);
      lines.push(`          label: ${quoteYamlString(item.label)}`);
      lines.push(`          status: ${item.status}`);
    }
  }

  return lines;
}

function replaceWorkflowFrontmatterBlock(
  frontmatterLines: string[],
  workflow: NormalizedTaskWorkflow,
): string[] {
  const workflowStartIndex = frontmatterLines.findIndex((line) => line.trim() === "workflow:");
  const workflowLines = renderWorkflowFrontmatterLines(workflow);

  if (workflowStartIndex < 0) {
    return [...frontmatterLines, ...workflowLines];
  }

  let workflowEndIndex = workflowStartIndex + 1;
  while (workflowEndIndex < frontmatterLines.length) {
    const line = frontmatterLines[workflowEndIndex] ?? "";
    if (/^[a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line.trim()) && !/^\s/.test(line)) {
      break;
    }
    workflowEndIndex += 1;
  }

  return [
    ...frontmatterLines.slice(0, workflowStartIndex),
    ...workflowLines,
    ...frontmatterLines.slice(workflowEndIndex),
  ];
}

function splitTaskFrontmatterAndBody(
  content: string,
): { frontmatterLines: string[]; body: string } | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  const closingFence = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closingFence < 0) {
    return undefined;
  }

  const closingIndex = closingFence + 1;
  return {
    frontmatterLines: lines.slice(1, closingIndex),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function renderMirroredChecklistSection(workflow: NormalizedTaskWorkflow): string {
  const lines: string[] = ["## Workflow Checklist (Mirrored)", ""];

  for (const stage of workflow.workflow.stages) {
    lines.push(`### ${stage.title}`);
    for (const item of stage.items) {
      const isComplete = item.status === "done" || item.status === "skipped";
      const statusSuffix =
        item.status === "in_progress"
          ? " (in progress)"
          : item.status === "blocked"
            ? " (blocked)"
            : item.status === "skipped"
              ? " (skipped)"
              : "";
      lines.push(`- [${isComplete ? "x" : " "}] ${item.label}${statusSuffix}`);
    }
    lines.push("");
  }

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function replaceMirroredChecklistSection(body: string, workflow: NormalizedTaskWorkflow): string {
  const section = renderMirroredChecklistSection(workflow);
  const bodyLines = body.split(/\r?\n/);
  const headingRegex = /^##\s+workflow checklist(?:\s*\(mirrored\))?\s*$/i;
  const startIndex = bodyLines.findIndex((line) => headingRegex.test(line.trim()));

  if (startIndex < 0) {
    const trimmedBody = body.replace(/\s+$/, "");
    if (trimmedBody.length === 0) {
      return `${section}\n`;
    }

    return `${trimmedBody}\n\n${section}\n`;
  }

  let endIndex = bodyLines.length;
  for (let index = startIndex + 1; index < bodyLines.length; index += 1) {
    if (/^##\s+/.test((bodyLines[index] ?? "").trim())) {
      endIndex = index;
      break;
    }
  }

  const updatedBodyLines = [
    ...bodyLines.slice(0, startIndex),
    section,
    ...bodyLines.slice(endIndex),
  ];
  const updatedBody = updatedBodyLines.join("\n").replace(/\s+$/, "");

  return `${updatedBody}\n`;
}

function renderTaskDocumentWithUpdatedWorkflow(
  content: string,
  workflow: NormalizedTaskWorkflow,
): string | undefined {
  const split = splitTaskFrontmatterAndBody(content);
  if (!split) {
    return undefined;
  }

  const nextFrontmatter = replaceWorkflowFrontmatterBlock(split.frontmatterLines, workflow);
  const nextBody = replaceMirroredChecklistSection(split.body, workflow);

  return ["---", ...nextFrontmatter, "---", "", nextBody.replace(/^\n+/, "")].join("\n");
}

function withUpdatedWorkflowItemStatus(input: {
  workflow: NormalizedTaskWorkflow;
  stageId: string;
  itemId: string;
  status: TaskWorkflowItemStatus;
}): NormalizedTaskWorkflow | undefined {
  const { workflow, stageId, itemId, status } = input;

  let didUpdate = false;
  const updatedStages = workflow.workflow.stages.map((stage) => {
    if (stage.id !== stageId) {
      return stage;
    }

    const updatedItems = stage.items.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      didUpdate = true;
      if (item.status === status) {
        return item;
      }

      return {
        ...item,
        status,
      };
    });

    return {
      ...stage,
      items: updatedItems,
    };
  });

  if (!didUpdate) {
    return undefined;
  }

  return {
    ...workflow,
    workflow: {
      ...workflow.workflow,
      stages: updatedStages,
    },
  };
}

function resolveCommandDrivenChecklistOffer(
  command: string,
): CommandDrivenChecklistOfferDefinition | undefined {
  const normalizedCommand = command.trim();
  return COMMAND_DRIVEN_CHECKLIST_OFFERS.find((offer) =>
    offer.commandPattern.test(normalizedCommand),
  );
}

function canTransitionChecklistItemByPrompt(input: {
  currentStatus: TaskWorkflowItemStatus;
  targetStatus: TaskWorkflowItemStatus;
}): boolean {
  if (input.currentStatus === input.targetStatus) {
    return false;
  }

  if (input.currentStatus === "done") {
    return false;
  }

  if (input.currentStatus === "blocked" || input.currentStatus === "skipped") {
    return false;
  }

  return true;
}

function renderBrowserHtml(model: ArtifactBrowserModel): string {
  const nonce = String(Date.now());
  const modelPayload = JSON.stringify(model)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/<\//g, "<\\/");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
        .toolbar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
        .button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
        .button.action-navigation { background: color-mix(in srgb, var(--vscode-button-background) 72%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-button-background) 55%, var(--vscode-panel-border)); }
        .context-chip { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 6px 2px 8px; font-size: 11px; color: var(--vscode-descriptionForeground); display: inline-flex; align-items: center; gap: 6px; max-width: 420px; }
        .context-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .context-chip-clear { border: none; background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 12px; line-height: 1; padding: 0 2px; border-radius: 3px; }
        .context-chip-clear:hover { background: var(--vscode-toolbar-hoverBackground); }
        .top-filter { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .top-filter button { border: 1px solid color-mix(in srgb, rebeccapurple 60%, var(--vscode-panel-border)); background: color-mix(in srgb, rebeccapurple 78%, var(--vscode-editor-background)); color: #ffffff; border-radius: 999px; padding: 2px 8px; cursor: pointer; font-size: 11px; }
        .top-filter button.active { background: rebeccapurple; color: #ffffff; border-color: color-mix(in srgb, rebeccapurple 75%, var(--vscode-panel-border)); }
        .breadcrumbs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
        .breadcrumb-chip { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 999px; padding: 2px 8px; cursor: pointer; font-size: 11px; }
        .breadcrumb-chip.current { background: rebeccapurple; color: #ffffff; border-color: color-mix(in srgb, rebeccapurple 75%, var(--vscode-panel-border)); cursor: default; }
        .breadcrumb-separator { color: var(--vscode-descriptionForeground); font-size: 11px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; background: var(--vscode-editor-background); }
        .kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
        .title { font-size: 12px; font-weight: 600; margin-bottom: 6px; word-break: break-word; }
        .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
        .task-metadata { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .task-metadata-chip { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; font-size: 10px; color: var(--vscode-descriptionForeground); }
        .path-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 3px; }
        .path-value { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-foreground); margin-bottom: 8px; word-break: break-all; }
        .actions-section { border-top: 1px solid var(--vscode-panel-border); margin-top: 8px; padding-top: 8px; }
        .actions-heading { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
        .actions-subheading { font-size: 10px; color: var(--vscode-descriptionForeground); margin: 6px 0; }
        .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
        .actions button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 6px 8px; font-size: 11px; cursor: pointer; width: 100%; min-height: 30px; text-align: center; }
        .actions button.action-navigation { background: color-mix(in srgb, var(--vscode-button-background) 72%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-button-background) 55%, var(--vscode-panel-border)); }
        .actions button.action-run { background: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 58%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 52%, var(--vscode-panel-border)); }
        .actions button.action-stage { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 58%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 52%, var(--vscode-panel-border)); }
        .actions button.action-stage:disabled { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-color: var(--vscode-button-border, transparent); }
        .actions button:disabled { opacity: 0.7; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button class="button action-navigation" id="back-button">Back</button>
        <div class="top-filter" id="top-filter">
          <button data-root-filter="all" class="active">All</button>
          <button data-root-filter="roadmap">Roadmap</button>
          <button data-root-filter="runtime">Runtime</button>
          <button data-root-filter="agent-skills">Agent Skills</button>
        </div>
        <div class="context-chip" id="context-chip" hidden>
          <span class="context-chip-label" id="context-chip-label"></span>
          <button class="context-chip-clear" id="context-chip-clear" title="Clear context" aria-label="Clear context">×</button>
        </div>
      </div>
      <div class="breadcrumbs" id="breadcrumbs"></div>
      <div class="grid" id="cards"></div>
      <script id="model-data" type="application/json">${modelPayload}</script>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const model = JSON.parse(document.getElementById("model-data").textContent);
        const persistedState = vscode.getState() || {};

        const breadcrumbs = document.getElementById("breadcrumbs");
        const cards = document.getElementById("cards");
        const backButton = document.getElementById("back-button");
        const topFilter = document.getElementById("top-filter");
        const contextChip = document.getElementById("context-chip");
        const contextChipLabel = document.getElementById("context-chip-label");
        const contextChipClear = document.getElementById("context-chip-clear");
        const rootFilterButtons = Array.from(document.querySelectorAll("button[data-root-filter]"));

        const validRootFilters = ["all", "roadmap", "runtime", "agent-skills"];
        let activeRootFilter = typeof persistedState.activeRootFilter === "string" && validRootFilters.includes(persistedState.activeRootFilter)
          ? persistedState.activeRootFilter
          : "all";

        let currentPath = typeof persistedState.currentPath === "string" ? persistedState.currentPath : "";
        if (!model.nodes[currentPath]) {
          currentPath = "";
        }
        let history = Array.isArray(persistedState.history) ? persistedState.history.filter((value) => typeof value === "string") : [];
        let contextualFilePath =
          typeof persistedState.contextualFilePath === "string" ? persistedState.contextualFilePath : "";
        let selectedTaskPath =
          typeof persistedState.selectedTaskPath === "string" ? persistedState.selectedTaskPath : "";
        let selectedStageChat =
          persistedState.selectedStageChat && typeof persistedState.selectedStageChat === "object"
            ? persistedState.selectedStageChat
            : undefined;

        function isKnownFilePath(relativePath) {
          if (!relativePath || typeof relativePath !== "string") {
            return false;
          }

          return Object.values(model.nodes).some((node) =>
            node.files.some((file) => file.relativePath === relativePath),
          );
        }

        if (!isKnownFilePath(contextualFilePath)) {
          contextualFilePath = "";
        }

        function isWorkflowDetailFilePath(relativePath) {
          if (!relativePath || typeof relativePath !== "string") {
            return false;
          }

          return Object.values(model.nodes).some((node) =>
            node.files.some(
              (file) =>
                file.relativePath === relativePath &&
                file.taskMetadata &&
                file.taskMetadata.workflowDetail,
            ),
          );
        }

        if (!isWorkflowDetailFilePath(selectedTaskPath)) {
          selectedTaskPath = "";
        }

        window.addEventListener("message", (event) => {
          const message = event && event.data ? event.data : undefined;
          if (!message) {
            return;
          }

          if (message.type === "stageChatRuntimeState") {
            const relativePath = typeof message.relativePath === "string" ? message.relativePath : "";
            const stageId = typeof message.stageId === "string" ? message.stageId : "";
            const stageTitle = typeof message.stageTitle === "string" ? message.stageTitle : stageId;
            const runtimeState =
              message.runtimeState === "sending" ||
              message.runtimeState === "success" ||
              message.runtimeState === "error"
                ? message.runtimeState
                : "idle";
            const statusMessage =
              typeof message.statusMessage === "string" ? message.statusMessage : "";
            const canRetry = message.canRetry === true;
            const failedMessage =
              typeof message.failedMessage === "string" ? message.failedMessage : "";

            if (!relativePath || !stageId) {
              return;
            }

            if (
              !selectedStageChat ||
              selectedStageChat.relativePath !== relativePath ||
              selectedStageChat.stageId !== stageId
            ) {
              selectedStageChat = {
                relativePath,
                stageId,
                stageTitle,
                turns: [],
              };
            }

            selectedStageChat = {
              ...selectedStageChat,
              relativePath,
              stageId,
              stageTitle,
              runtimeState,
              statusMessage,
              lastFailedMessage: canRetry ? failedMessage : "",
            };

            persist();
            render();
            return;
          }

          if (message.type !== "stageChatRuntimeResponse") {
            return;
          }

          const relativePath = typeof message.relativePath === "string" ? message.relativePath : "";
          const stageId = typeof message.stageId === "string" ? message.stageId : "";
          const stageTitle = typeof message.stageTitle === "string" ? message.stageTitle : stageId;
          const role = message.role === "assistant" ? "assistant" : "user";
          const content = typeof message.content === "string" ? message.content : "";
          const append = message.append === true;

          if (!relativePath || !stageId || !content) {
            return;
          }

          if (!selectedStageChat || selectedStageChat.relativePath !== relativePath || selectedStageChat.stageId !== stageId) {
            selectedStageChat = {
              relativePath,
              stageId,
              stageTitle,
              turns: [],
            };
          }

          const existingTurns =
            selectedStageChat && Array.isArray(selectedStageChat.turns) ? selectedStageChat.turns : [];

          const nextTurns = (() => {
            if (!append) {
              return [
                ...existingTurns,
                {
                  role,
                  content,
                },
              ];
            }

            const lastTurn = existingTurns[existingTurns.length - 1];
            if (lastTurn && lastTurn.role === role) {
              return [
                ...existingTurns.slice(0, -1),
                {
                  ...lastTurn,
                  content:
                    (typeof lastTurn.content === "string" ? lastTurn.content : "") + content,
                },
              ];
            }

            return [
              ...existingTurns,
              {
                role,
                content,
              },
            ];
          })();

          selectedStageChat = {
            ...selectedStageChat,
            relativePath,
            stageId,
            stageTitle,
            runtimeState: append ? "sending" : "success",
            statusMessage: append
              ? "Receiving response from default runtime..."
              : "Response received.",
            lastFailedMessage: "",
            turns: nextTurns,
          };

          persist();
          render();
        });

        function persist() {
          vscode.setState({
            currentPath,
            history,
            activeRootFilter,
            contextualFilePath,
            selectedTaskPath,
            selectedStageChat,
          });
        }

        function setContextualFilePath(relativePath, rerender) {
          if (typeof relativePath !== "string" || relativePath.length === 0) {
            return;
          }

          contextualFilePath = relativePath;
          persist();

          if (rerender) {
            render();
          }
        }

        function setSelectedTaskPath(relativePath, rerender) {
          if (typeof relativePath !== "string") {
            return;
          }

          if (selectedTaskPath !== relativePath) {
            selectedStageChat = undefined;
          }

          selectedTaskPath = relativePath;
          persist();

          if (rerender) {
            render();
          }
        }

        function renderContextChip() {
          if (!contextChip || !contextChipLabel) {
            return;
          }

          if (contextualFilePath.length === 0) {
            contextChip.hidden = true;
            contextChipLabel.textContent = "";
            contextChip.removeAttribute("title");
            return;
          }

          contextChip.hidden = false;
          contextChipLabel.textContent = "Context: " + contextualFilePath;
          contextChip.title = contextualFilePath;
        }

        function rootCategory(relativePath) {
          const first = relativePath.split("/")[0] || "";
          if (first === ".project-arch") {
            return "runtime";
          }

          if (first === ".arch") {
            return "agent-skills";
          }

          return "roadmap";
        }

        function visibleRootDirectories(directories) {
          if (activeRootFilter === "all") {
            return directories;
          }

          return directories.filter((entry) => rootCategory(entry.relativePath) === activeRootFilter);
        }

        function renderRootFilterControls(currentPathValue) {
          if (!topFilter) {
            return;
          }

          topFilter.hidden = currentPathValue !== "";
          rootFilterButtons.forEach((button) => {
            const candidate = button.getAttribute("data-root-filter");
            button.classList.toggle("active", candidate === activeRootFilter);
          });
        }

        function breadcrumbSegments(value) {
          if (!value) {
            return [{ label: "Repository", relativePath: "" }];
          }

          const segments = value.split("/").filter((part) => part.length > 0);
          const output = [{ label: "Repository", relativePath: "" }];
          let current = "";

          for (const segment of segments) {
            current = current.length === 0 ? segment : current + "/" + segment;
            output.push({
              label: segment,
              relativePath: current,
            });
          }

          return output;
        }

        function goTo(pathValue) {
          if (!model.nodes[pathValue]) {
            return;
          }
          if (pathValue === currentPath) {
            return;
          }
          history.push(currentPath);
          currentPath = pathValue;
          selectedTaskPath = "";
          render();
          persist();
        }

        function goBack() {
          const previous = history.pop();
          if (typeof previous !== "string" || !model.nodes[previous]) {
            return;
          }
          currentPath = previous;
          selectedTaskPath = "";
          render();
          persist();
        }

        function parseTaskContext(relativePath) {
          const normalized = String(relativePath || "").replaceAll(String.fromCharCode(92), "/");
          const taskPathPattern = new RegExp(
            "(?:^|/)phases/([^/]+)/milestones/([^/]+)/tasks/(planned|discovered|backlog)/([0-9]{3})-[^/]+[.](md|markdown)$",
            "i",
          );
          const match = normalized.match(taskPathPattern);
          if (!match) {
            return undefined;
          }

          return {
            phaseId: match[1],
            milestoneId: match[2],
            lane: match[3].toLowerCase(),
            taskId: match[4],
          };
        }

        function toScopedTaskRef(taskContext) {
          if (!taskContext) {
            return "";
          }

          return (
            taskContext.phaseId + "/" + taskContext.milestoneId + "/" + taskContext.taskId
          );
        }

        function parseTaskLaneContext(relativePath) {
          const normalized = String(relativePath || "").replaceAll(String.fromCharCode(92), "/");
          const lanePattern = new RegExp(
            "(?:^|/)phases/([^/]+)/milestones/([^/]+)/tasks/(planned|discovered|backlog)$",
            "i",
          );
          const match = normalized.match(lanePattern);
          if (!match) {
            return undefined;
          }

          return {
            phaseId: match[1],
            milestoneId: match[2],
            lane: match[3].toLowerCase(),
            relativePath: normalized,
          };
        }

        function formatRelativeTimestamp(value) {
          if (!value || typeof value !== "string") {
            return "unknown";
          }

          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            return value;
          }

          const deltaMs = Math.max(0, Date.now() - parsed.getTime());
          const minuteMs = 60 * 1000;
          const hourMs = 60 * minuteMs;
          const dayMs = 24 * hourMs;
          const monthMs = 30 * dayMs;
          const yearMs = 365 * dayMs;

          if (deltaMs < minuteMs) {
            return "just now";
          }

          if (deltaMs < hourMs) {
            return Math.floor(deltaMs / minuteMs) + "m ago";
          }

          if (deltaMs < dayMs) {
            return Math.floor(deltaMs / hourMs) + "h ago";
          }

          if (deltaMs < monthMs) {
            return Math.floor(deltaMs / dayMs) + "d ago";
          }

          if (deltaMs < yearMs) {
            return Math.floor(deltaMs / monthMs) + "mo ago";
          }

          return Math.floor(deltaMs / yearMs) + "y ago";
        }

        function formatWorkflowStateLabel(value) {
          if (!value || typeof value !== "string") {
            return "Unknown";
          }

          if (value === "not_started") {
            return "Not Started";
          }

          if (value === "in_progress") {
            return "In Progress";
          }

          if (value === "completed") {
            return "Completed";
          }

          if (value === "blocked") {
            return "Blocked";
          }

          return value;
        }

        function createNewTaskSkeletonCard(laneContext) {
          const article = document.createElement("article");
          article.className = "card";

          const laneLabel = laneContext.lane.charAt(0).toUpperCase() + laneContext.lane.slice(1);

          article.innerHTML =
            '<div class="kind">Task</div>' +
            '<div class="title">New ' + laneLabel + ' Task</div>' +
            '<div class="meta">Create a lane task skeleton from the SDK without guessing command shape.</div>' +
            '<div class="path-label">Lane Path</div>' +
            '<div class="path-value">' + laneContext.relativePath + '</div>' +
            '<div class="actions-section">' +
            '<div class="actions-heading">Actions</div>' +
            '<div class="actions">' +
            '<button class="action-stage" data-create-mode="placeholder">Create Placeholder Task</button>' +
            '<button class="action-stage" data-create-mode="slug">Create Task with Slug</button>' +
            '</div>' +
            '</div>';

          article.querySelectorAll("button[data-create-mode]").forEach((button) => {
            button.addEventListener("click", () => {
              const mode = button.getAttribute("data-create-mode");
              vscode.postMessage({
                type: "createLaneTask",
                phaseId: laneContext.phaseId,
                milestoneId: laneContext.milestoneId,
                lane: laneContext.lane,
                withSlug: mode === "slug",
              });
            });
          });

          return article;
        }

        function createDirectoryCard(entry) {
          const article = document.createElement("article");
          article.className = "card";

          const metadataRow =
            '<div class="task-metadata">' +
            '<span class="task-metadata-chip" title="' + (entry.createdAt || "") + '">Created ' + formatRelativeTimestamp(entry.createdAt) + '</span>' +
            '<span class="task-metadata-chip" title="' + (entry.updatedAt || "") + '">Updated ' + formatRelativeTimestamp(entry.updatedAt) + '</span>' +
            '</div>';

          const runNowDirectoryCommands = [
            {
              label: "Run pa doctor health",
              command: "pa doctor health --json",
              execute: true,
            },
            {
              label: "Run learn on path",
              command: "pa learn --path " + entry.relativePath + " --json",
              execute: true,
            },
          ];

          const stagedDirectoryCommands = [
            {
              label: "Stage pa doctor (full sweep)",
              command: "pa doctor",
              execute: false,
            },
            {
              label: "Stage learn template",
              command: "pa learn --path <relative-path> --json",
              execute: false,
            },
          ];

          if (contextualFilePath.length > 0) {
            stagedDirectoryCommands.push({
              label: "Stage check selected file",
              command: "pa check --file " + contextualFilePath,
              execute: false,
            });
          } else {
            stagedDirectoryCommands.push({
              label: "Select a file to stage check template",
              execute: false,
              disabled: true,
            });
          }

          const renderDirectoryCommandButtons = (definitions) =>
            definitions
              .map(
                (definition) => {
                  const runAttribute = definition.command
                    ? ' data-run="' + definition.command + '"'
                    : "";
                  const executeAttribute = definition.command
                    ? ' data-execute="' + (definition.execute ? "true" : "false") + '"'
                    : "";
                  const disabledAttribute = definition.disabled ? " disabled" : "";

                  const actionClass = definition.execute ? "action-run" : "action-stage";

                  return (
                    '<button class="' + actionClass + '"' +
                    runAttribute +
                    executeAttribute +
                    disabledAttribute +
                    ">" +
                    definition.label +
                    "</button>"
                  );
                },
              )
              .join("");

          article.innerHTML =
            '<div class="kind">Directory</div>' +
            '<div class="title">' + entry.label + '</div>' +
            metadataRow +
            '<div class="path-label">Path</div>' +
            '<div class="path-value">' + entry.relativePath + '</div>' +
            '<div class="actions-section">' +
            '<div class="actions-heading">Actions</div>' +
            '<div class="actions-subheading">Run Now</div>' +
            '<div class="actions">' +
            '<button class="action-navigation" data-enter="' + entry.relativePath + '">Open Level</button>' +
            '<button class="action-navigation" data-copy="' + entry.relativePath + '">Copy Path</button>' +
            renderDirectoryCommandButtons(runNowDirectoryCommands) +
            '</div>' +
            '<div class="actions-subheading">Stage Template</div>' +
            '<div class="actions">' +
            renderDirectoryCommandButtons(stagedDirectoryCommands) +
            '</div>' +
            '</div>';
          const button = article.querySelector("button[data-enter]");
          button.addEventListener("click", () => {
            goTo(entry.relativePath);
          });

          const copyButton = article.querySelector("button[data-copy]");
          copyButton.addEventListener("click", () => {
            vscode.postMessage({ type: "copyPath", relativePath: entry.relativePath });
          });

          article.querySelectorAll("button[data-run]").forEach((runButton) => {
            runButton.addEventListener("click", () => {
              const command = runButton.getAttribute("data-run");
              if (!command) {
                return;
              }

              const execute = runButton.getAttribute("data-execute") !== "false";
              vscode.postMessage({ type: "runCommand", command, execute });
            });
          });

          return article;
        }

        function createFileCard(entry) {
          const article = document.createElement("article");
          article.className = "card";

          article.addEventListener("click", (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("button")) {
              return;
            }

            setContextualFilePath(entry.relativePath, true);
          });

          const taskContext = parseTaskContext(entry.relativePath);
          const scopedTaskRef = toScopedTaskRef(taskContext);
          const taskCommandDefinitions = taskContext
            ? [
                {
                  label: "Run task status",
                  command:
                    "pa task status " +
                    taskContext.phaseId +
                    " " +
                    taskContext.milestoneId +
                    " " +
                    taskContext.taskId,
                  execute: true,
                },
                {
                  label: "Run task lanes",
                  command: "pa task lanes " + taskContext.phaseId + " " + taskContext.milestoneId,
                  execute: true,
                },
                {
                  label: "Run learn on task path",
                  command: "pa learn --path " + entry.relativePath,
                  execute: true,
                },
                {
                  label: "Run check on task file",
                  command: "pa check --file " + entry.relativePath,
                  execute: true,
                },
                {
                  label: "Run agent prepare",
                  command: "pa agent prepare " + scopedTaskRef + " --json",
                  execute: true,
                },
                {
                  label: "Stage agent orchestrate",
                  command:
                    "pa agent orchestrate " +
                    scopedTaskRef +
                    " --runtime <runtime> --json --timeout-ms <ms>",
                  execute: false,
                },
                {
                  label: "Stage agent run",
                  command:
                    "pa agent run " +
                    scopedTaskRef +
                    " --runtime <runtime> --json --timeout-ms <ms>",
                  execute: false,
                },
                {
                  label: "Stage agent status",
                  command: "pa agent status <runId> --json",
                  execute: false,
                },
                {
                  label: "Stage agent validate",
                  command: "pa agent validate <runId> --json",
                  execute: false,
                },
                {
                  label: "Stage agent reconcile",
                  command: "pa agent reconcile <runId> --json",
                  execute: false,
                },
                {
                  label: "Stage result import",
                  command: "pa result import <path-to-result-bundle> --json",
                  execute: false,
                },
              ]
            : [];

          const runNowTaskCommands = taskCommandDefinitions.filter((definition) => definition.execute);
          const stagedTaskCommands = taskCommandDefinitions.filter((definition) => !definition.execute);

          const renderTaskCommandButtons = (definitions) =>
            definitions
              .map(
                (definition) => {
                  const actionClass = definition.execute ? "action-run" : "action-stage";

                  return (
                    '<button class="' + actionClass + '" data-run="' +
                    definition.command +
                    '" data-execute="' +
                    (definition.execute ? "true" : "false") +
                    '">' +
                    definition.label +
                    "</button>"
                  );
                },
              )
              .join("");

          const workflowActionRows = taskContext
            ? '<div class="actions-subheading">Task Commands</div>' +
              (runNowTaskCommands.length > 0
                ? '<div class="actions-subheading">Run Now</div>' +
                  '<div class="actions">' +
                  '<button class="action-run" data-launch-task-ref="' + scopedTaskRef + '">Launch Run</button>' +
                  renderTaskCommandButtons(runNowTaskCommands) +
                  '</div>'
                : "") +
              (stagedTaskCommands.length > 0
                ? '<div class="actions-subheading">Stage Template</div>' +
                  '<div class="actions">' +
                  renderTaskCommandButtons(stagedTaskCommands) +
                  '</div>'
                : "") +
              '<div class="actions-subheading">Create</div>' +
              '<div class="actions">' +
              '<button class="action-stage" data-create-discovered-phase="' + taskContext.phaseId + '" data-create-discovered-milestone="' + taskContext.milestoneId + '" data-create-discovered-from="' + taskContext.taskId + '">Create Discovered (from selected task)</button>' +
              '</div>'
            : "";

          const metadata = entry.taskMetadata || { status: undefined, tags: [], dependsOn: [], blocks: [] };
          const workflowSummary = metadata.workflowSummary;
          const workflowMetadataRow = workflowSummary
            ? '<span class="task-metadata-chip">Checklist: ' + workflowSummary.completedChecklistItems + '/' + workflowSummary.totalChecklistItems + '</span>' +
              '<span class="task-metadata-chip">Stages: ' + workflowSummary.completedStages + '/' + workflowSummary.totalStages + ' completed</span>' +
              '<span class="task-metadata-chip">Workflow State: ' + formatWorkflowStateLabel(workflowSummary.overallState) + '</span>' +
              (workflowSummary.currentStageTitle
                ? '<span class="task-metadata-chip">Current Stage: ' + workflowSummary.currentStageTitle + ' (' + formatWorkflowStateLabel(workflowSummary.currentStageState) + ')</span>'
                : "")
            : "";
          const metadataRow =
            '<div class="task-metadata">' +
            '<span class="task-metadata-chip">Status: ' + (metadata.status || "unknown") + '</span>' +
            workflowMetadataRow +
            '<span class="task-metadata-chip">Depends On: ' + (metadata.dependsOn.length > 0 ? metadata.dependsOn.join(", ") : "none") + '</span>' +
            '<span class="task-metadata-chip">Blocks: ' + (metadata.blocks.length > 0 ? metadata.blocks.join(", ") : "none") + '</span>' +
            '<span class="task-metadata-chip">Tags: ' + (metadata.tags.length > 0 ? metadata.tags.join(", ") : "none") + '</span>' +
            '</div>';

          article.innerHTML =
            '<div class="kind">File</div>' +
            '<div class="title">' + entry.label + '</div>' +
            metadataRow +
            '<div class="path-label">Path</div>' +
            '<div class="path-value">' + entry.relativePath + '</div>' +
            '<div class="actions-section">' +
            '<div class="actions-heading">Actions</div>' +
            '<div class="actions">' +
            '<button class="action-navigation" data-edit="' + entry.relativePath + '">Open for Edit</button>' +
            (entry.isMarkdown
              ? '<button class="action-navigation" data-preview="' + entry.relativePath + '">Open Preview</button>'
              : '') +
            '<button class="action-navigation" data-copy="' + entry.relativePath + '">Copy Path</button>' +
            (metadata.workflowDetail
              ? '<button class="action-navigation" data-open-workflow="' + entry.relativePath + '">Open Workflow</button>'
              : '') +
            '</div>' +
            workflowActionRows +
            '</div>';

          const editButton = article.querySelector("button[data-edit]");
          editButton.addEventListener("click", () => {
            setContextualFilePath(entry.relativePath, false);
            vscode.postMessage({ type: "openEdit", relativePath: entry.relativePath });
          });

          const previewButton = article.querySelector("button[data-preview]");
          if (previewButton) {
            previewButton.addEventListener("click", () => {
              setContextualFilePath(entry.relativePath, false);
              vscode.postMessage({ type: "openPreview", relativePath: entry.relativePath });
            });
          }

          const copyButton = article.querySelector("button[data-copy]");
          copyButton.addEventListener("click", () => {
            setContextualFilePath(entry.relativePath, false);
            vscode.postMessage({ type: "copyPath", relativePath: entry.relativePath });
          });

          const openWorkflowButton = article.querySelector("button[data-open-workflow]");
          if (openWorkflowButton) {
            openWorkflowButton.addEventListener("click", () => {
              setContextualFilePath(entry.relativePath, false);
              setSelectedTaskPath(entry.relativePath, true);
            });
          }

          article.querySelectorAll("button[data-run]").forEach((button) => {
            button.addEventListener("click", () => {
              const command = button.getAttribute("data-run");
              if (!command) {
                return;
              }

              setContextualFilePath(entry.relativePath, false);
              const execute = button.getAttribute("data-execute") !== "false";
              vscode.postMessage({
                type: "runCommand",
                command,
                execute,
                relativePath: entry.relativePath,
              });
            });
          });

          article.querySelectorAll("button[data-launch-task-ref]").forEach((button) => {
            button.addEventListener("click", () => {
              const taskRef = button.getAttribute("data-launch-task-ref");
              if (!taskRef) {
                return;
              }

              setContextualFilePath(entry.relativePath, false);
              vscode.postMessage({
                type: "launchTask",
                taskRef,
                relativePath: entry.relativePath,
              });
            });
          });

          article.querySelectorAll("button[data-create-discovered-from]").forEach((button) => {
            button.addEventListener("click", () => {
              const phaseId = button.getAttribute("data-create-discovered-phase");
              const milestoneId = button.getAttribute("data-create-discovered-milestone");
              const fromTaskId = button.getAttribute("data-create-discovered-from");

              if (!phaseId || !milestoneId || !fromTaskId) {
                return;
              }

              setContextualFilePath(entry.relativePath, false);
              vscode.postMessage({
                type: "createDiscoveredFromSelectedTask",
                phaseId,
                milestoneId,
                fromTaskId,
              });
            });
          });

          return article;
        }

        function formatChecklistItemStatus(status) {
          if (status === "done") {
            return "Done";
          }

          if (status === "in_progress") {
            return "In Progress";
          }

          if (status === "blocked") {
            return "Blocked";
          }

          if (status === "skipped") {
            return "Skipped";
          }

          return "Planned";
        }

        function checklistItemMarker(status) {
          if (status === "done") {
            return "✓";
          }

          if (status === "in_progress") {
            return "◐";
          }

          if (status === "blocked") {
            return "!";
          }

          if (status === "skipped") {
            return "⤼";
          }

          return "○";
        }

        function workflowStatusOptions(currentStatus) {
          const statuses = ["planned", "in_progress", "done", "blocked", "skipped"];
          return statuses
            .map((status) => {
              const selected = status === currentStatus ? " selected" : "";
              return '<option value="' + status + '"' + selected + '>' + formatChecklistItemStatus(status) + '</option>';
            })
            .join("");
        }

        function stageChatActionsForStage(stage) {
          return [
            {
              id: "open",
              command: "projectArch.openStageChat",
              label: "Open Stage Chat",
            },
            {
              id: "resume",
              command: "projectArch.openStageChat",
              label: "Resume Stage Chat",
            },
            {
              id: "reset",
              command: "projectArch.resetStageChat",
              label: "Reset Stage Chat",
            },
            {
              id: "discard",
              command: "projectArch.discardStageChat",
              label: "Discard Stage Chat",
            },
            {
              id: "return",
              command: "projectArch.returnToWorkflowView",
              label: "Return to workflow",
            },
          ];
        }

        function createTaskWorkflowDetailCard(entry) {
          const article = document.createElement("article");
          article.className = "card";

          const metadata = entry.taskMetadata || {
            status: undefined,
            tags: [],
            dependsOn: [],
            blocks: [],
            workflowSummary: undefined,
            workflowDetail: undefined,
          };
          const workflowSummary = metadata.workflowSummary;
          const workflowDetail = metadata.workflowDetail;
          const selectedStageChatForEntry =
            selectedStageChat &&
            selectedStageChat.relativePath === entry.relativePath &&
            typeof selectedStageChat.stageId === "string"
              ? workflowDetail?.stages.find((stage) => stage.id === selectedStageChat.stageId)
              : undefined;

          if (!workflowDetail) {
            article.innerHTML =
              '<div class="kind">Task Workflow</div>' +
              '<div class="title">Workflow detail unavailable</div>' +
              '<div class="meta">This task does not expose normalized workflow detail yet.</div>' +
              '<div class="actions-section">' +
              '<div class="actions">' +
              '<button class="action-navigation" data-back-to-lane="true">Back to Lane</button>' +
              '</div>' +
              '</div>';

            const backButton = article.querySelector("button[data-back-to-lane]");
            if (backButton) {
              backButton.addEventListener("click", () => {
                setSelectedTaskPath("", true);
              });
            }

            return article;
          }

          const stageMarkup = workflowDetail.stages
            .map((stage, index) => {
              const itemMarkup = stage.items
                .map(
                  (item) =>
                    '<li>' +
                    '<span>' + checklistItemMarker(item.status) + ' ' + item.label + '</span>' +
                    '<div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">' +
                    '<span class="task-metadata-chip">' + formatChecklistItemStatus(item.status) + '</span>' +
                    '<select class="button" data-workflow-stage-id="' + stage.id + '" data-workflow-item-id="' + item.id + '">' +
                    workflowStatusOptions(item.status) +
                    '</select>' +
                    '<button class="action-stage" data-update-workflow-item="true" data-workflow-stage-id="' + stage.id + '" data-workflow-item-id="' + item.id + '">Update</button>' +
                    '</div>' +
                    '</li>',
                )
                .join("");

              return (
                '<div class="actions-section">' +
                '<div class="actions-heading">Stage ' +
                (index + 1) +
                ': ' +
                stage.title +
                '</div>' +
                '<div class="task-metadata">' +
                '<span class="task-metadata-chip">State: ' +
                formatWorkflowStateLabel(stage.state) +
                '</span>' +
                '</div>' +
                '<ul style="margin: 6px 0 0 16px; padding: 0; display: grid; gap: 6px; font-size: 11px;">' +
                itemMarkup +
                '</ul>' +
                '<div class="actions-section">' +
                '<div class="actions-heading">Stage Chat</div>' +
                '<div class="actions">' +
                stageChatActionsForStage(stage)
                  .map(
                    (action) =>
                      '<button class="action-stage-chat" data-stage-chat-command="' +
                      action.command +
                      '" data-stage-chat-action="' +
                      action.id +
                      '" data-stage-chat-stage-id="' +
                      stage.id +
                      '" data-stage-chat-stage-title="' +
                      stage.title +
                      '">' +
                      action.label +
                      '</button>',
                  )
                  .join("") +
                '</div>' +
                '</div>' +
                '</div>'
              );
            })
            .join("");

          const stageChatSurfaceMarkup = selectedStageChatForEntry
            ? '<div class="actions-section">' +
              '<div class="actions-heading">Stage Chat Mode</div>' +
              '<div class="kind">Stage Chat</div>' +
              '<div class="title">' + selectedStageChatForEntry.title + '</div>' +
              '<div class="meta">Stage chat mode is active for this workflow stage.</div>' +
              '<div class="task-metadata">' +
              '<span class="task-metadata-chip">Stage ID: ' + selectedStageChatForEntry.id + '</span>' +
              '<span class="task-metadata-chip">State: ' + formatWorkflowStateLabel(selectedStageChatForEntry.state) + '</span>' +
              '<span class="task-metadata-chip">Runtime: ' +
              (((selectedStageChat && typeof selectedStageChat.runtimeState === "string" && selectedStageChat.runtimeState.length > 0)
                ? selectedStageChat.runtimeState
                : "idle")) +
              '</span>' +
              '</div>' +
              ((selectedStageChat && typeof selectedStageChat.statusMessage === "string" && selectedStageChat.statusMessage.length > 0)
                ? '<div class="meta" data-stage-chat-runtime-status="true">' + selectedStageChat.statusMessage + '</div>'
                : '') +
              '<div class="actions-section">' +
              '<div class="actions-heading">Transcript</div>' +
              '<div class="meta" data-stage-chat-transcript="true">' +
              (((selectedStageChat && Array.isArray(selectedStageChat.turns) ? selectedStageChat.turns : []).length > 0)
                ? (selectedStageChat.turns || [])
                    .map(
                      (turn, index, turns) =>
                        '<div class="actions-section" style="margin-top: 6px; padding-top: 6px;">' +
                        '<div class="actions-subheading">' +
                        (turn.role === 'assistant' ? 'Assistant' : 'You') +
                        ((((selectedStageChat && selectedStageChat.runtimeState === "sending") &&
                          turn.role === 'assistant' &&
                          index === turns.length - 1)
                          ? ' <span class="meta" data-stage-chat-streaming="true" style="display: inline; margin-left: 6px;">Streaming…</span>'
                          : '')) +
                        '</div>' +
                        '<div>' +
                        (typeof turn.content === 'string' ? turn.content : '') +
                        '</div>' +
                        '</div>',
                    )
                    .join('')
                : 'No messages yet. Start the conversation below.') +
              '</div>' +
              '</div>' +
              '<div class="actions-section">' +
              '<div class="actions-heading">Message</div>' +
              '<textarea class="button" rows="4" data-stage-chat-input="true" placeholder="Ask about this stage..." style="width: 100%; resize: vertical; text-align: left; font-family: var(--vscode-editor-font-family);"></textarea>' +
              '<div class="actions" style="margin-top: 6px;">' +
              '<button class="action-stage-chat" data-stage-chat-send="true" data-stage-chat-stage-id="' +
              selectedStageChatForEntry.id +
              '" data-stage-chat-stage-title="' +
              selectedStageChatForEntry.title +
              '">Send</button>' +
              (((selectedStageChat && selectedStageChat.runtimeState === "error" && typeof selectedStageChat.lastFailedMessage === "string" && selectedStageChat.lastFailedMessage.length > 0)
                ? '<button class="action-stage-chat" data-stage-chat-retry="true" data-stage-chat-stage-id="' +
                  selectedStageChatForEntry.id +
                  '" data-stage-chat-stage-title="' +
                  selectedStageChatForEntry.title +
                  '">Retry Last Message</button>'
                : '')) +
              '</div>' +
              '</div>' +
              '<div class="actions-section">' +
              '<div class="actions">' +
              '<button class="action-stage-chat" data-stage-chat-command="projectArch.openStageChat" data-stage-chat-action="resume" data-stage-chat-stage-id="' +
              selectedStageChatForEntry.id +
              '" data-stage-chat-stage-title="' +
              selectedStageChatForEntry.title +
              '">Resume Stage Chat</button>' +
              '<button class="action-stage-chat" data-stage-chat-command="projectArch.resetStageChat" data-stage-chat-action="reset" data-stage-chat-stage-id="' +
              selectedStageChatForEntry.id +
              '" data-stage-chat-stage-title="' +
              selectedStageChatForEntry.title +
              '">Reset Stage Chat</button>' +
              '<button class="action-stage-chat" data-stage-chat-command="projectArch.discardStageChat" data-stage-chat-action="discard" data-stage-chat-stage-id="' +
              selectedStageChatForEntry.id +
              '" data-stage-chat-stage-title="' +
              selectedStageChatForEntry.title +
              '">Discard Stage Chat</button>' +
              '<button class="action-stage-chat" data-stage-chat-command="projectArch.returnToWorkflowView" data-stage-chat-action="return" data-stage-chat-stage-id="' +
              selectedStageChatForEntry.id +
              '" data-stage-chat-stage-title="' +
              selectedStageChatForEntry.title +
              '">Return to workflow</button>' +
              '</div>' +
              '</div>' +
              '</div>'
            : "";

          article.innerHTML =
            '<div class="kind">Task Workflow</div>' +
            '<div class="title">' + entry.label + '</div>' +
            '<div class="meta">Guided workflow detail view for the selected task.</div>' +
            '<div class="task-metadata">' +
            '<span class="task-metadata-chip">Status: ' + (metadata.status || "unknown") + '</span>' +
            (workflowSummary
              ? '<span class="task-metadata-chip">Checklist: ' +
                workflowSummary.completedChecklistItems +
                '/' +
                workflowSummary.totalChecklistItems +
                '</span>' +
                '<span class="task-metadata-chip">Stages: ' +
                workflowSummary.completedStages +
                '/' +
                workflowSummary.totalStages +
                ' completed</span>' +
                '<span class="task-metadata-chip">Workflow State: ' +
                formatWorkflowStateLabel(workflowSummary.overallState) +
                '</span>'
              : '') +
            '</div>' +
            '<div class="path-label">Task Path</div>' +
            '<div class="path-value">' + entry.relativePath + '</div>' +
            '<div class="actions-section">' +
            '<div class="actions-heading">Navigation</div>' +
            '<div class="actions">' +
            '<button class="action-navigation" data-back-to-lane="true">Back to Lane</button>' +
            '<button class="action-navigation" data-edit="' + entry.relativePath + '">Open for Edit</button>' +
            '<button class="action-navigation" data-copy="' + entry.relativePath + '">Copy Path</button>' +
            '</div>' +
            '</div>' +
            (selectedStageChatForEntry ? stageChatSurfaceMarkup : stageMarkup);

          const backToLaneButton = article.querySelector("button[data-back-to-lane]");
          if (backToLaneButton) {
            backToLaneButton.addEventListener("click", () => {
              selectedStageChat = undefined;
              setSelectedTaskPath("", true);
            });
          }

          const editButton = article.querySelector("button[data-edit]");
          if (editButton) {
            editButton.addEventListener("click", () => {
              setContextualFilePath(entry.relativePath, false);
              vscode.postMessage({ type: "openEdit", relativePath: entry.relativePath });
            });
          }

          const copyButton = article.querySelector("button[data-copy]");
          if (copyButton) {
            copyButton.addEventListener("click", () => {
              setContextualFilePath(entry.relativePath, false);
              vscode.postMessage({ type: "copyPath", relativePath: entry.relativePath });
            });
          }

          article.querySelectorAll("button[data-update-workflow-item]").forEach((button) => {
            button.addEventListener("click", () => {
              const stageId = button.getAttribute("data-workflow-stage-id");
              const itemId = button.getAttribute("data-workflow-item-id");
              if (!stageId || !itemId) {
                return;
              }

              const selector =
                'select[data-workflow-stage-id="' +
                stageId +
                '"][data-workflow-item-id="' +
                itemId +
                '"]';
              const statusSelect = article.querySelector(selector);
              if (!(statusSelect instanceof HTMLSelectElement)) {
                return;
              }

              vscode.postMessage({
                type: "updateWorkflowChecklistItem",
                relativePath: entry.relativePath,
                stageId,
                itemId,
                status: statusSelect.value,
              });
            });
          });

          article.querySelectorAll("button[data-stage-chat-command]").forEach((button) => {
            button.addEventListener("click", () => {
              const command = button.getAttribute("data-stage-chat-command");
              const stageId = button.getAttribute("data-stage-chat-stage-id");
              const stageTitle = button.getAttribute("data-stage-chat-stage-title");
              const action = button.getAttribute("data-stage-chat-action");
              if (!command || !stageId || !stageTitle || !action) {
                return;
              }

              if (action === "open" || action === "resume") {
                selectedStageChat = {
                  relativePath: entry.relativePath,
                  stageId,
                  stageTitle,
                };
                persist();
                render();
              }

              if (action === "return") {
                selectedStageChat = undefined;
                persist();
                render();
              }

              vscode.postMessage({
                type: "stageChatCommand",
                relativePath: entry.relativePath,
                command,
                stageId,
                stageTitle,
                action,
              });
            });
          });

          article.querySelectorAll("button[data-stage-chat-send]").forEach((button) => {
            button.addEventListener("click", () => {
              const stageId = button.getAttribute("data-stage-chat-stage-id");
              const stageTitle = button.getAttribute("data-stage-chat-stage-title");
              const input = article.querySelector("textarea[data-stage-chat-input='true']");
              if (!stageId || !stageTitle || !(input instanceof HTMLTextAreaElement)) {
                return;
              }

              const messageText = input.value.trim();
              if (!messageText) {
                return;
              }

              const existingTurns =
                selectedStageChat && Array.isArray(selectedStageChat.turns) ? selectedStageChat.turns : [];
              selectedStageChat = {
                relativePath: entry.relativePath,
                stageId,
                stageTitle,
                runtimeState: "sending",
                statusMessage: "Sending message...",
                lastFailedMessage: "",
                turns: [
                  ...existingTurns,
                  {
                    role: "user",
                    content: messageText,
                  },
                ],
              };
              input.value = "";
              persist();

              vscode.postMessage({
                type: "stageChatSendIntent",
                relativePath: entry.relativePath,
                stageId,
                stageTitle,
                messageText,
              });

              render();
            });
          });

          article.querySelectorAll("button[data-stage-chat-retry]").forEach((button) => {
            button.addEventListener("click", () => {
              const stageId = button.getAttribute("data-stage-chat-stage-id");
              const stageTitle = button.getAttribute("data-stage-chat-stage-title");
              const retryMessage =
                selectedStageChat && typeof selectedStageChat.lastFailedMessage === "string"
                  ? selectedStageChat.lastFailedMessage.trim()
                  : "";

              if (!stageId || !stageTitle || !retryMessage) {
                return;
              }

              selectedStageChat = {
                ...(selectedStageChat || {}),
                relativePath: entry.relativePath,
                stageId,
                stageTitle,
                runtimeState: "sending",
                statusMessage: "Retrying message...",
              };
              persist();

              vscode.postMessage({
                type: "stageChatSendIntent",
                relativePath: entry.relativePath,
                stageId,
                stageTitle,
                messageText: retryMessage,
              });

              render();
            });
          });

          return article;
        }

        function applyActionGridColumns(container) {
          if (!(container instanceof Element)) {
            return;
          }

          const actionRows = container.querySelectorAll(".actions");
          actionRows.forEach((row) => {
            const buttonCount = row.querySelectorAll("button").length;
            if (buttonCount === 0) {
              return;
            }

            const columnCount = Math.min(3, buttonCount);
            row.style.gridTemplateColumns = "repeat(" + columnCount + ", minmax(0, 1fr))";
          });
        }

        function render() {
          const node = model.nodes[currentPath];
          if (!node) {
            return;
          }

          if (
            selectedTaskPath.length > 0 &&
            !node.files.some((entry) => entry.relativePath === selectedTaskPath)
          ) {
            selectedTaskPath = "";
            selectedStageChat = undefined;
          }

          if (breadcrumbs) {
            breadcrumbs.innerHTML = "";
            const segments = breadcrumbSegments(currentPath);
            segments.forEach((segment, index) => {
              const isCurrent = segment.relativePath === currentPath;

              const chip = document.createElement("button");
              chip.className = "breadcrumb-chip" + (isCurrent ? " current" : "");
              chip.textContent = segment.label;
              chip.disabled = isCurrent;
              if (!isCurrent) {
                chip.addEventListener("click", () => {
                  goTo(segment.relativePath);
                });
              }
              breadcrumbs.appendChild(chip);

              if (index < segments.length - 1) {
                const separator = document.createElement("span");
                separator.className = "breadcrumb-separator";
                separator.textContent = "›";
                breadcrumbs.appendChild(separator);
              }
            });
          }

          cards.innerHTML = "";

          const directories = currentPath === "" ? visibleRootDirectories(node.directories) : node.directories;
          const laneContext = parseTaskLaneContext(currentPath);
          const selectedTaskEntry =
            selectedTaskPath.length > 0
              ? node.files.find((entry) => entry.relativePath === selectedTaskPath)
              : undefined;

          renderContextChip();

          if (selectedTaskEntry && selectedTaskEntry.taskMetadata?.workflowDetail) {
            cards.appendChild(createTaskWorkflowDetailCard(selectedTaskEntry));
          } else {
            directories.forEach((entry) => cards.appendChild(createDirectoryCard(entry)));
            node.files.forEach((entry) => cards.appendChild(createFileCard(entry)));
            if (laneContext) {
              cards.appendChild(createNewTaskSkeletonCard(laneContext));
            }
          }

          applyActionGridColumns(cards);

          renderRootFilterControls(currentPath);

          if (directories.length === 0 && node.files.length === 0) {
            const empty = document.createElement("article");
            empty.className = "card";
            empty.innerHTML = '<div class="title">No child directories or files at this level.</div>';
            cards.appendChild(empty);
          }

          backButton.disabled = history.length === 0;
        }

        backButton.addEventListener("click", goBack);

        rootFilterButtons.forEach((button) => {
          button.addEventListener("click", () => {
            const candidate = button.getAttribute("data-root-filter");
            if (!candidate || !validRootFilters.includes(candidate)) {
              return;
            }

            activeRootFilter = candidate;
            render();
            persist();
          });
        });

        if (contextChipClear) {
          contextChipClear.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            contextualFilePath = "";
            persist();
            render();
          });
        }

        render();
      </script>
    </body>
  </html>`;
}

const EXPERIMENTAL_ARTIFACT_BROWSER_ROOT_ID =
  "project-arch-experimental-artifact-browser-root" as const;

function renderExperimentalBrowserHtml(input: {
  bootstrap: ExperimentalArtifactBrowserBootstrap;
  clientEntrypointUri: string;
  clientStylesheetUris: readonly string[];
  cspSource: string;
}): string {
  const nonce = String(Date.now());
  const bootstrapPayload = JSON.stringify(input.bootstrap)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/<\//g, "<\\/");
  const stylesheetTags = input.clientStylesheetUris
    .map((uri) => `      <link rel="stylesheet" href="${uri}" />`)
    .join("\n");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${input.cspSource} https:; style-src ${input.cspSource} 'unsafe-inline'; script-src ${input.cspSource} 'nonce-${nonce}';" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
        #${EXPERIMENTAL_ARTIFACT_BROWSER_ROOT_ID} { min-height: 120px; }
      </style>
${stylesheetTags}
    </head>
    <body>
      <div id="${EXPERIMENTAL_ARTIFACT_BROWSER_ROOT_ID}"></div>
      <script id="${EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCRIPT_ID}" type="application/json">${bootstrapPayload}</script>
      <script nonce="${nonce}" type="module" src="${input.clientEntrypointUri}"></script>
    </body>
  </html>`;
}

interface ArtifactNavigationBrowserProviderOptions {
  renderMode: "baseline" | "experimental";
  extensionRoot?: string;
  workspaceState?: StageChatSessionStateStore;
}

class ArtifactNavigationBrowserProvider implements vscode.WebviewViewProvider {
  private model: ArtifactBrowserModel | undefined;
  private view: vscode.WebviewView | undefined;
  private readonly checklistPromptSuppressions = new Map<string, number>();
  private readonly stageChatAbortControllers = new Map<string, AbortController>();

  public constructor(
    private readonly sourceViewId: string,
    private readonly workspaceRoot: string,
    private readonly api: Pick<typeof vscode, "commands" | "Uri" | "window" | "env">,
    private readonly driftStateStore: RoutingDriftStateStore,
    private readonly dependencies?: ArtifactNavigationDependencies,
    private readonly options: ArtifactNavigationBrowserProviderOptions = {
      renderMode: "baseline",
    },
  ) {}

  private renderWebviewAssetUri(assetPath: string): string {
    const entryFile = this.api.Uri.file(assetPath);

    const webview = this.view?.webview as
      | ({
          asWebviewUri?: (uri: { fsPath?: string }) => { toString?: () => string; fsPath?: string };
        } & Record<string, unknown>)
      | undefined;
    const maybeWebviewUri =
      webview && typeof webview.asWebviewUri === "function"
        ? webview.asWebviewUri(entryFile)
        : entryFile;

    if (typeof maybeWebviewUri === "string") {
      return maybeWebviewUri;
    }

    if (maybeWebviewUri && typeof maybeWebviewUri.toString === "function") {
      const rendered = maybeWebviewUri.toString();
      if (rendered && rendered !== "[object Object]") {
        return rendered;
      }
    }

    if (maybeWebviewUri && typeof maybeWebviewUri.fsPath === "string") {
      return maybeWebviewUri.fsPath;
    }

    return assetPath;
  }

  private async resolveBundledAssetUris(): Promise<{
    clientEntrypointUri: string;
    clientStylesheetUris: string[];
  }> {
    const extensionRoot = this.options.extensionRoot ?? this.workspaceRoot;
    const scriptPath = path.join(
      extensionRoot,
      "dist/webviews/experimental-artifact-browser/client.js",
    );
    const stylesheetPath = path.join(
      extensionRoot,
      "dist/webviews/experimental-artifact-browser/client.css",
    );

    const clientStylesheetUris: string[] = [];
    try {
      await fs.access(stylesheetPath);
      clientStylesheetUris.push(this.renderWebviewAssetUri(stylesheetPath));
    } catch {
      // Stylesheet is optional because the current client is self-styled.
    }

    return {
      clientEntrypointUri: this.renderWebviewAssetUri(scriptPath),
      clientStylesheetUris,
    };
  }

  private async maybeWarnRoutingDrift(input: {
    relativePath?: string;
    command?: string;
  }): Promise<void> {
    const normalizedPath = typeof input.relativePath === "string" ? input.relativePath.trim() : "";
    if (!normalizedPath) {
      return;
    }

    const absolutePath = this.resolveWorkspaceFilePath(normalizedPath);
    if (!absolutePath) {
      return;
    }

    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      return;
    }

    const parsed = taskWorkflowMetadataBoundary.parseTaskWorkflowMetadata({
      content,
      absolutePath,
      workspaceRoot: this.workspaceRoot,
    });

    if (!parsed.taskWorkflow) {
      return;
    }

    let runtimeProfiles: RuntimeProfileLaunchBoundaryModel;
    try {
      runtimeProfiles = await this.loadRuntimeProfiles();
    } catch {
      return;
    }

    const routingModel = stageRuntimeRoutingBoundary.resolveWorkflowStageRoutings(
      parsed.taskWorkflow,
      runtimeProfiles,
    );

    const driftEvaluation = routingDriftAcknowledgmentBoundary.evaluateRoutingDrift({
      taskPath: normalizedPath,
      workflow: parsed.taskWorkflow,
      model: routingModel,
      stateStore: this.driftStateStore,
      stateKey: ROUTING_DRIFT_ACK_STATE_KEY,
    });

    if (!driftEvaluation.shouldWarn || driftEvaluation.driftSignals.length === 0) {
      return;
    }

    const degradedSignals = driftEvaluation.driftSignals.filter(
      (signal) => signal.routingState === "degraded" && signal.availableAlternatives.length > 0,
    );

    const degradedSignal = degradedSignals[0];
    const agentContext =
      typeof input.command === "string" ? parseAgentCommandContext(input.command) : undefined;
    const fallbackOption = degradedSignal
      ? pickFallbackRuntimeOption({
          runtimeProfiles,
          alternatives: degradedSignal.availableAlternatives,
        })
      : undefined;

    const fallbackCommand =
      degradedSignal && fallbackOption && agentContext
        ? buildFallbackRunCommand({
            mode: agentContext.mode,
            taskRef: agentContext.taskRef,
            fallbackOption,
          })
        : undefined;

    const fallbackActionLabel = fallbackCommand ? "Stage fallback run command" : undefined;
    const reviewActionLabel = degradedSignal ? "Review fallback guidance" : undefined;

    const stageSample = driftEvaluation.driftSignals
      .slice(0, 2)
      .map((signal) => signal.stageTitle)
      .join(", ");
    const additionalCount =
      driftEvaluation.driftSignals.length - Math.min(2, driftEvaluation.driftSignals.length);
    const stageSummary =
      additionalCount > 0 ? `${stageSample} (+${additionalCount} more)` : stageSample;

    const selection = await this.api.window.showWarningMessage(
      `Project Arch: Routing drift detected for '${path.basename(normalizedPath)}' in ${driftEvaluation.driftSignals.length} stage(s): ${stageSummary}.`,
      ...(fallbackActionLabel ? [fallbackActionLabel] : []),
      ...(reviewActionLabel ? [reviewActionLabel] : []),
      "Acknowledge drift",
      "Not now",
    );

    if (fallbackActionLabel && selection === fallbackActionLabel && fallbackCommand) {
      await this.runCommandInTerminal(fallbackCommand, false);
      await this.api.window.showInformationMessage(
        `Project Arch: Fallback run command staged for '${path.basename(normalizedPath)}'. Runtime switching remains explicit; review and run when ready.`,
      );
      return;
    }

    if (reviewActionLabel && selection === reviewActionLabel) {
      if (degradedSignal && degradedSignal.availableAlternatives.length > 0) {
        await this.api.window.showInformationMessage(
          `Project Arch: Stage '${degradedSignal.stageTitle}' is degraded and can fallback to ${degradedSignal.availableAlternatives.join(" or ")}. Runtime switching remains explicit.`,
        );
      }
      return;
    }

    if (selection !== "Acknowledge drift") {
      return;
    }

    await routingDriftAcknowledgmentBoundary.acknowledgeRoutingDrift({
      taskPath: driftEvaluation.taskPath,
      fingerprint: driftEvaluation.fingerprint,
      stateStore: this.driftStateStore,
      stateKey: ROUTING_DRIFT_ACK_STATE_KEY,
    });

    await this.api.window.showInformationMessage(
      `Project Arch: Drift acknowledgment saved for '${path.basename(normalizedPath)}'.`,
    );
  }

  private async loadRuntimeProfiles(): Promise<RuntimeProfileLaunchBoundaryModel> {
    const boundary = this.dependencies?.boundary ?? createProjectArchBoundary();
    const loadRuntimeProfiles =
      this.dependencies?.loadRuntimeProfiles ??
      (async ({
        boundary: candidateBoundary,
        workspaceRoot,
      }: {
        boundary: ProjectArchBoundary;
        workspaceRoot: string;
      }) =>
        await loadRuntimeProfileLaunchBoundaryModel({
          boundary: candidateBoundary,
          cwd: workspaceRoot,
        }));

    return await loadRuntimeProfiles({
      boundary,
      workspaceRoot: this.workspaceRoot,
    });
  }

  private async selectLaunchProfile(
    taskRef: string,
  ): Promise<{ boundary: ProjectArchBoundary; option: RuntimeLaunchProfileOption } | undefined> {
    const boundary = this.dependencies?.boundary ?? createProjectArchBoundary();
    const model = await this.loadRuntimeProfiles();
    const readyOptions = model.options.filter((option) => option.eligibility === "ready");

    if (readyOptions.length === 0) {
      await this.api.window.showWarningMessage(
        `Project Arch: No ready runtime profiles are available to launch '${taskRef}'. Open the Runtimes panel and fix readiness first.`,
      );
      return undefined;
    }

    const preferredOption = model.decision.selectedProfileId
      ? readyOptions.find((option) => option.id === model.decision.selectedProfileId)
      : undefined;

    if (readyOptions.length === 1) {
      return { boundary, option: readyOptions[0]! };
    }

    const selection = await this.api.window.showQuickPick(
      readyOptions.map((option) => ({
        label: option.id,
        description: `Runtime ${option.runtime}${option.model ? ` · Model ${option.model}` : ""}`,
        detail:
          option.id === preferredOption?.id ? "Preferred ready profile." : option.inlineSummary,
        option,
      })),
      {
        title: "Project Arch: Launch Run",
        placeHolder: `Choose a ready runtime profile for '${taskRef}'`,
        ignoreFocusOut: true,
      },
    );

    if (!selection) {
      return undefined;
    }

    return { boundary, option: selection.option };
  }

  private async resolvePreferredRuntimeOption(
    preferredRuntime?: string,
  ): Promise<RuntimeLaunchProfileOption | undefined> {
    const model = await this.loadRuntimeProfiles();
    const byId = new Map(model.options.map((option) => [option.id, option]));
    const normalizedPreferredRuntime = preferredRuntime?.trim().toLowerCase();

    if (normalizedPreferredRuntime) {
      const preferredReadyOption = model.options.find(
        (option) =>
          option.eligibility === "ready" &&
          option.runtime.trim().toLowerCase() === normalizedPreferredRuntime,
      );
      if (preferredReadyOption) {
        return preferredReadyOption;
      }
      return undefined;
    }

    if (model.decision.selectedProfileId) {
      const selected = byId.get(model.decision.selectedProfileId);
      if (selected?.eligibility === "ready") {
        return selected;
      }
    }

    if (model.defaultProfile) {
      const defaultOption = byId.get(model.defaultProfile);
      if (defaultOption) {
        return defaultOption;
      }
    }

    return model.options.find((option) => option.eligibility === "ready") ?? model.options[0];
  }

  private async postStageChatRuntimeResponse(input: {
    relativePath: string;
    stageId: string;
    stageTitle: string;
    role: "assistant" | "user";
    content: string;
    append?: boolean;
  }): Promise<void> {
    await this.updatePersistedStageChatTranscript({
      relativePath: input.relativePath,
      stageId: input.stageId,
      stageTitle: input.stageTitle,
      updateTurns: (existingTurns) => {
        if (!input.append) {
          return [...existingTurns, { role: input.role, content: input.content }];
        }

        const lastTurn = existingTurns[existingTurns.length - 1];
        if (lastTurn && lastTurn.role === input.role) {
          return [
            ...existingTurns.slice(0, -1),
            {
              ...lastTurn,
              content: `${lastTurn.content}${input.content}`,
            },
          ];
        }

        return [...existingTurns, { role: input.role, content: input.content }];
      },
    });

    if (!this.view) {
      return;
    }

    await this.view.webview.postMessage({
      type: "stageChatRuntimeResponse",
      relativePath: input.relativePath,
      stageId: input.stageId,
      stageTitle: input.stageTitle,
      role: input.role,
      content: input.content,
      append: input.append === true,
    });
  }

  private async postStageChatRuntimeState(input: {
    relativePath: string;
    stageId: string;
    stageTitle: string;
    runtimeState: "idle" | "sending" | "success" | "error";
    statusMessage: string;
    canRetry?: boolean;
    failedMessage?: string;
    clearTurns?: boolean;
    sessionStatus?: "none" | "active" | "stale";
    threadKey?: string;
    runtimeClass?: "local" | "cloud";
    availableActions?: Array<"open" | "resume" | "reset" | "discard">;
  }): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.view.webview.postMessage({
      type: "stageChatRuntimeState",
      relativePath: input.relativePath,
      stageId: input.stageId,
      stageTitle: input.stageTitle,
      runtimeState: input.runtimeState,
      statusMessage: input.statusMessage,
      canRetry: input.canRetry === true,
      failedMessage: typeof input.failedMessage === "string" ? input.failedMessage : "",
      clearTurns: input.clearTurns === true,
      sessionStatus: input.sessionStatus,
      threadKey: input.threadKey,
      runtimeClass: input.runtimeClass,
      availableActions: input.availableActions,
    });
  }

  private resolveStageChatSessionBoundary() {
    if (!this.options.workspaceState) {
      return undefined;
    }

    return resolveStageChatSessionBoundary({
      context: {
        workspaceState: this.options.workspaceState,
      },
    });
  }

  private readPersistedStageChatTranscriptMap(): PersistedStageChatTranscriptMap {
    if (!this.options.workspaceState) {
      return {};
    }

    const raw = this.options.workspaceState.get<unknown>(DEFAULT_STAGE_CHAT_TRANSCRIPTS_STATE_KEY);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    return raw as PersistedStageChatTranscriptMap;
  }

  private async writePersistedStageChatTranscriptMap(
    value: PersistedStageChatTranscriptMap,
  ): Promise<void> {
    if (!this.options.workspaceState) {
      return;
    }

    await this.options.workspaceState.update(DEFAULT_STAGE_CHAT_TRANSCRIPTS_STATE_KEY, value);
  }

  private sanitizePersistedStageChatTurns(
    turns: readonly PersistedStageChatTurn[],
  ): PersistedStageChatTurn[] {
    return turns
      .filter(
        (turn): turn is PersistedStageChatTurn =>
          (turn.role === "assistant" || turn.role === "user") &&
          typeof turn.content === "string" &&
          turn.content.length > 0,
      )
      .map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));
  }

  private async updatePersistedStageChatTranscript(input: {
    relativePath: string;
    stageId: string;
    stageTitle: string;
    updateTurns: (turns: PersistedStageChatTurn[]) => PersistedStageChatTurn[];
  }): Promise<void> {
    if (!this.options.workspaceState) {
      return;
    }

    const threadKey = `${input.relativePath}::${input.stageId}`;
    const transcripts = this.readPersistedStageChatTranscriptMap();
    const existing = transcripts[threadKey];
    const nextTurns = this.sanitizePersistedStageChatTurns(
      input.updateTurns(existing?.turns ?? []),
    );

    transcripts[threadKey] = {
      relativePath: input.relativePath,
      stageId: input.stageId,
      stageTitle: input.stageTitle,
      turns: nextTurns,
      updatedAt: Date.now(),
    };

    await this.writePersistedStageChatTranscriptMap(transcripts);
  }

  private async clearPersistedStageChatTranscript(input: {
    relativePath: string;
    stageId: string;
  }): Promise<void> {
    if (!this.options.workspaceState) {
      return;
    }

    const threadKey = `${input.relativePath}::${input.stageId}`;
    const transcripts = this.readPersistedStageChatTranscriptMap();
    if (!(threadKey in transcripts)) {
      return;
    }

    delete transcripts[threadKey];
    await this.writePersistedStageChatTranscriptMap(transcripts);
  }

  private toStageChatRuntimeClass(runtime?: string): "local" | "cloud" | undefined {
    const normalizedRuntime = runtime?.trim().toLowerCase();
    if (normalizedRuntime === "local" || normalizedRuntime === "cloud") {
      return normalizedRuntime;
    }

    return undefined;
  }

  private buildExperimentalStageChatSnapshot(
    model: ArtifactBrowserModel,
  ): ExperimentalArtifactBrowserBootstrap["stageChat"] | undefined {
    const boundary = this.resolveStageChatSessionBoundary();
    if (!boundary) {
      return undefined;
    }

    const transcriptMap = this.readPersistedStageChatTranscriptMap();

    const sessions = Object.values(model.nodes).flatMap((node) =>
      node.files.flatMap((file) => {
        const stages = file.taskMetadata?.workflowDetail?.stages ?? [];
        return stages.map((stage) => {
          const identity = {
            taskId: file.relativePath,
            stageId: stage.id,
          };
          const lookup = boundary.lookupSession({ identity });
          const sessionStatus = resolveStageChatSessionStatus(lookup);
          const persistedTranscript = transcriptMap[boundary.buildThreadKey(identity)];

          return {
            relativePath: file.relativePath,
            stageId: stage.id,
            stageTitle: stage.title,
            sessionStatus,
            threadKey: boundary.buildThreadKey(identity),
            runtimeClass:
              lookup.status === "found" || lookup.status === "stale"
                ? lookup.session.runtimeClass
                : undefined,
            availableActions: resolveStageChatLifecycleActions(sessionStatus),
            turns: persistedTranscript?.turns ?? [],
          };
        });
      }),
    );

    return {
      sessions,
      generatedAt: new Date().toISOString(),
    };
  }

  private async handleExperimentalStageChatLifecycle(message: {
    relativePath: string;
    stageId: string;
    stageTitle: string;
    runtime?: string;
    action?: string;
  }): Promise<void> {
    const boundary = this.resolveStageChatSessionBoundary();
    if (!boundary) {
      return;
    }

    const identity = {
      taskId: message.relativePath,
      stageId: message.stageId,
    };
    const stageTitle = message.stageTitle.trim().length > 0 ? message.stageTitle : message.stageId;
    const runtimeClass = this.toStageChatRuntimeClass(message.runtime);
    const action =
      message.action === "resume"
        ? "resume"
        : message.action === "reset"
          ? "reset"
          : message.action === "discard"
            ? "discard"
            : "open";

    if (action === "discard") {
      await boundary.discard({ identity });
      await this.clearPersistedStageChatTranscript({
        relativePath: message.relativePath,
        stageId: message.stageId,
      });
      await this.postStageChatRuntimeState({
        relativePath: message.relativePath,
        stageId: message.stageId,
        stageTitle,
        runtimeState: "idle",
        statusMessage: "Stage chat session discarded.",
        clearTurns: true,
        sessionStatus: "none",
        threadKey: boundary.buildThreadKey(identity),
        availableActions: ["open"],
      });
      return;
    }

    if (action === "reset") {
      const result = await boundary.reset({
        identity,
        runtimeClass,
      });
      await this.clearPersistedStageChatTranscript({
        relativePath: message.relativePath,
        stageId: message.stageId,
      });
      await this.postStageChatRuntimeState({
        relativePath: message.relativePath,
        stageId: message.stageId,
        stageTitle,
        runtimeState: "idle",
        statusMessage: "Stage chat session reset. Start a new message when ready.",
        clearTurns: true,
        sessionStatus: "active",
        threadKey: result.session.threadKey,
        runtimeClass: result.session.runtimeClass,
        availableActions: ["resume", "reset", "discard"],
      });
      return;
    }

    const result = await boundary.openOrResume({
      identity,
      runtimeClass,
    });
    await this.postStageChatRuntimeState({
      relativePath: message.relativePath,
      stageId: message.stageId,
      stageTitle,
      runtimeState: "idle",
      statusMessage:
        result.operation === "opened"
          ? "Stage chat session opened. Start messaging when ready."
          : result.wasStale
            ? "Resumed a stale stage chat session. Review context before continuing."
            : "Resumed active stage chat session.",
      sessionStatus: "active",
      threadKey: result.session.threadKey,
      runtimeClass: result.session.runtimeClass,
      availableActions: ["resume", "reset", "discard"],
    });
  }

  private async buildStageChatContextLine(input: {
    relativePath: string;
    stageId: string;
  }): Promise<string | undefined> {
    const absolutePath = this.resolveWorkspaceFilePath(input.relativePath);
    if (!absolutePath) {
      return undefined;
    }

    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      return undefined;
    }

    const parsed = taskWorkflowMetadataBoundary.parseTaskWorkflowMetadata({
      content,
      absolutePath,
      workspaceRoot: this.workspaceRoot,
    });

    const stage = parsed.taskWorkflow?.workflow.stages.find(
      (candidate) => candidate.id === input.stageId,
    );
    if (!stage) {
      return undefined;
    }

    const openItems = stage.items.filter(
      (item) => item.status !== "done" && item.status !== "skipped",
    );
    return `${stage.title}: ${openItems.length}/${stage.items.length} items still active.`;
  }

  private normalizeStageChatAssistantOutput(responseText: string): string {
    const normalized = responseText.trim();
    if (normalized.length === 0) {
      throw new Error("Ollama returned an empty or invalid output payload.");
    }

    return normalized;
  }

  private isStageChatInvalidOutputError(messageText: string): boolean {
    const normalized = messageText.toLowerCase();
    return (
      normalized.includes("empty response") ||
      normalized.includes("empty or invalid output") ||
      normalized.includes("invalid output")
    );
  }

  private isStageChatTimeoutError(messageText: string): boolean {
    return messageText.toLowerCase().includes("timed out");
  }

  private isStageChatTransportError(messageText: string): boolean {
    const normalized = messageText.toLowerCase();
    return normalized.includes("transport request failed") || normalized.includes("fetch failed");
  }

  private isStageChatInterruptedError(messageText: string): boolean {
    return messageText.toLowerCase().includes("interrupted");
  }

  private toStageChatAbortKey(relativePath: string, stageId: string): string {
    return `${relativePath}::${stageId}`;
  }

  private async handleStageChatStopResponse(message: {
    relativePath: string;
    stageId: string;
    stageTitle: string;
  }): Promise<void> {
    const stageTitle = message.stageTitle.trim().length > 0 ? message.stageTitle : message.stageId;
    const abortKey = this.toStageChatAbortKey(message.relativePath, message.stageId);
    const activeAbortController = this.stageChatAbortControllers.get(abortKey);
    if (!activeAbortController) {
      await this.postStageChatRuntimeState({
        relativePath: message.relativePath,
        stageId: message.stageId,
        stageTitle,
        runtimeState: "idle",
        statusMessage: "No active stage chat response to stop.",
      });
      return;
    }

    activeAbortController.abort();
    this.stageChatAbortControllers.delete(abortKey);
    await this.postStageChatRuntimeState({
      relativePath: message.relativePath,
      stageId: message.stageId,
      stageTitle,
      runtimeState: "idle",
      statusMessage: "Stage chat response interrupted.",
    });
  }

  private async handleStageChatSendIntent(message: {
    relativePath: string;
    stageId: string;
    stageTitle: string;
    runtime?: string;
    messageText: string;
  }): Promise<void> {
    const stageTitle = message.stageTitle.trim().length > 0 ? message.stageTitle : message.stageId;
    const requestedRuntime = message.runtime?.trim();
    const sessionBoundary = this.resolveStageChatSessionBoundary();
    const sessionIdentity = {
      taskId: message.relativePath,
      stageId: message.stageId,
    };
    const abortKey = this.toStageChatAbortKey(message.relativePath, message.stageId);
    const previousAbortController = this.stageChatAbortControllers.get(abortKey);
    if (previousAbortController) {
      previousAbortController.abort();
      this.stageChatAbortControllers.delete(abortKey);
    }

    const stageChatAbortController =
      typeof AbortController !== "undefined" ? new AbortController() : undefined;
    if (stageChatAbortController) {
      this.stageChatAbortControllers.set(abortKey, stageChatAbortController);
    }

    // Persist user message and send immediate "thinking" state to UI (fire-and-forget)
    await this.updatePersistedStageChatTranscript({
      relativePath: message.relativePath,
      stageId: message.stageId,
      stageTitle,
      updateTurns: (existingTurns) => [
        ...existingTurns,
        {
          role: "user",
          content: message.messageText,
        },
      ],
    });

    // Send immediate UI feedback without waiting (fire-and-forget pattern)
    void (async () => {
      if (sessionBoundary) {
        const session = await sessionBoundary.openOrResume({
          identity: sessionIdentity,
          runtimeClass: this.toStageChatRuntimeClass(requestedRuntime),
        });

        await this.postStageChatRuntimeState({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          runtimeState: "sending",
          statusMessage: requestedRuntime
            ? `Sending message through '${requestedRuntime}' runtime profile...`
            : "Sending message through default runtime profile...",
          sessionStatus: "active",
          threadKey: session.session.threadKey,
          runtimeClass: session.session.runtimeClass,
          availableActions: ["resume", "reset", "discard"],
        });
      } else {
        await this.postStageChatRuntimeState({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          runtimeState: "sending",
          statusMessage: requestedRuntime
            ? `Sending message through '${requestedRuntime}' runtime profile...`
            : "Sending message through default runtime profile...",
        });
      }
    })();

    try {
      const boundary = this.dependencies?.boundary ?? createProjectArchBoundary();

      let option: RuntimeLaunchProfileOption | undefined;
      try {
        option = await this.resolvePreferredRuntimeOption(requestedRuntime);
      } catch {
        option = undefined;
      }

      if (!option || option.eligibility !== "ready") {
        void this.postStageChatRuntimeResponse({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          role: "assistant",
          content: requestedRuntime
            ? `No ready runtime profile is available for '${requestedRuntime}'. Open the Runtimes view, fix readiness, choose a ready endpoint, and resend your message.`
            : "No ready default runtime profile is available for stage chat. Open the Runtimes view, fix readiness, and resend your message.",
        });
        void this.postStageChatRuntimeState({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          runtimeState: "error",
          statusMessage: requestedRuntime
            ? `Runtime '${requestedRuntime}' is not ready. Open Runtimes and retry.`
            : "Runtime not ready. Open Runtimes and retry.",
          canRetry: true,
          failedMessage: message.messageText,
          sessionStatus: sessionBoundary ? "active" : undefined,
          threadKey: sessionBoundary?.buildThreadKey(sessionIdentity),
          availableActions: sessionBoundary ? ["resume", "reset", "discard"] : undefined,
        });
        return;
      }

      // Parallelize runtime readiness check and context building
      const [readiness, stageContextLine] = await Promise.all([
        boundary.readRuntimeReadinessCheck({
          cwd: this.workspaceRoot,
          profileId: option.id,
        }),
        this.buildStageChatContextLine({
          relativePath: message.relativePath,
          stageId: message.stageId,
        }),
      ]);
      const liveProfile = readiness.profiles[0];

      if (!liveProfile || liveProfile.readiness !== "ready") {
        void this.postStageChatRuntimeResponse({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          role: "assistant",
          content: `Runtime profile '${option.id}' is not ready right now. Resolve runtime readiness and retry this stage chat message.`,
        });
        void this.postStageChatRuntimeState({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          runtimeState: "error",
          statusMessage: `Runtime '${option.id}' is not ready. Retry after readiness check.`,
          canRetry: true,
          failedMessage: message.messageText,
          sessionStatus: sessionBoundary ? "active" : undefined,
          threadKey: sessionBoundary?.buildThreadKey(sessionIdentity),
          runtimeClass: this.toStageChatRuntimeClass(option.runtime),
          availableActions: sessionBoundary ? ["resume", "reset", "discard"] : undefined,
        });
        return;
      }

      if (!boundary.invokeStageChatInference) {
        throw new Error("Runtime boundary does not expose live stage chat inference support.");
      }

      let streamedAssistantChunk = false;
      const inferenceResult = await boundary.invokeStageChatInference({
        cwd: this.workspaceRoot,
        profileId: option.id,
        runtime: option.runtime,
        model: option.model ?? liveProfile.model ?? "",
        messageText:
          typeof stageContextLine === "string" && stageContextLine.length > 0
            ? `${message.messageText}\n\nStage context: ${stageContextLine}`
            : message.messageText,
        stageTitle,
        taskPath: message.relativePath,
        abortSignal: stageChatAbortController?.signal,
        onPartialResponse: (chunk) => {
          if (chunk.length === 0) {
            return;
          }

          streamedAssistantChunk = true;
          // Fire-and-forget streaming updates to avoid blocking inference
          void this.postStageChatRuntimeResponse({
            relativePath: message.relativePath,
            stageId: message.stageId,
            stageTitle,
            role: "assistant",
            content: chunk,
            append: true,
          });
        },
      });

      const normalizedAssistantResponse = this.normalizeStageChatAssistantOutput(
        inferenceResult.responseText,
      );
      if (!streamedAssistantChunk) {
        await this.postStageChatRuntimeResponse({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          role: "assistant",
          content: normalizedAssistantResponse,
        });
      }
      void this.postStageChatRuntimeState({
        relativePath: message.relativePath,
        stageId: message.stageId,
        stageTitle,
        runtimeState: "success",
        statusMessage: "Response received from default runtime.",
        sessionStatus: sessionBoundary ? "active" : undefined,
        threadKey: sessionBoundary?.buildThreadKey(sessionIdentity),
        runtimeClass: this.toStageChatRuntimeClass(option.runtime),
        availableActions: sessionBoundary ? ["resume", "reset", "discard"] : undefined,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      const interruptedFailure = this.isStageChatInterruptedError(messageText);
      const invalidOutput = this.isStageChatInvalidOutputError(messageText);
      const timeoutFailure = this.isStageChatTimeoutError(messageText);
      const transportFailure = this.isStageChatTransportError(messageText);
      if (interruptedFailure) {
        void this.postStageChatRuntimeState({
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle,
          runtimeState: "idle",
          statusMessage: "Stage chat response interrupted.",
          sessionStatus: sessionBoundary ? "active" : undefined,
          threadKey: sessionBoundary?.buildThreadKey(sessionIdentity),
          availableActions: sessionBoundary ? ["resume", "reset", "discard"] : undefined,
        });
        return;
      }

      void this.postStageChatRuntimeResponse({
        relativePath: message.relativePath,
        stageId: message.stageId,
        stageTitle,
        role: "assistant",
        content: timeoutFailure
          ? "The runtime timed out while waiting for Ollama. Confirm the local Ollama server and model are responsive, then retry this message."
          : transportFailure
            ? "The runtime could not reach the Ollama endpoint. Confirm Ollama is running and reachable at http://127.0.0.1:11434, then retry this message."
            : invalidOutput
              ? "The runtime returned an invalid or empty Ollama response. Verify the selected model is available and retry this message."
              : `Stage chat send failed unexpectedly: ${messageText}`,
      });
      void this.postStageChatRuntimeState({
        relativePath: message.relativePath,
        stageId: message.stageId,
        stageTitle,
        runtimeState: "error",
        statusMessage: timeoutFailure
          ? "Runtime timed out. Confirm Ollama responsiveness and retry."
          : transportFailure
            ? "Runtime transport error. Confirm Ollama endpoint and retry."
            : invalidOutput
              ? "Runtime returned invalid output. Check model/runtime and retry."
              : "Send failed. Review diagnostics and retry.",
        canRetry: true,
        failedMessage: message.messageText,
        sessionStatus: sessionBoundary ? "active" : undefined,
        threadKey: sessionBoundary?.buildThreadKey(sessionIdentity),
        availableActions: sessionBoundary ? ["resume", "reset", "discard"] : undefined,
      });
    } finally {
      const activeAbortController = this.stageChatAbortControllers.get(abortKey);
      if (activeAbortController === stageChatAbortController) {
        this.stageChatAbortControllers.delete(abortKey);
      }
    }
  }

  private async hydrateAgentCommandTemplate(command: string): Promise<string> {
    if (!/^pa agent (run|orchestrate)\s/.test(command)) {
      return command;
    }

    let hydrated = command;
    let preferredOption: RuntimeLaunchProfileOption | undefined;
    try {
      preferredOption = await this.resolvePreferredRuntimeOption();
    } catch {
      preferredOption = undefined;
    }

    if (hydrated.includes("--runtime <runtime>") && preferredOption?.runtime) {
      hydrated = hydrated.replace("--runtime <runtime>", `--runtime ${preferredOption.runtime}`);
    }

    if (hydrated.includes("--timeout-ms <ms>")) {
      hydrated = hydrated.replace("--timeout-ms <ms>", `--timeout-ms ${DEFAULT_AGENT_TIMEOUT_MS}`);
    }

    return hydrated;
  }

  private async launchTask(taskRef: string, relativePath?: string): Promise<void> {
    const selection = await this.selectLaunchProfile(taskRef);
    if (!selection) {
      return;
    }

    const readiness = await selection.boundary.readRuntimeReadinessCheck({
      cwd: this.workspaceRoot,
      profileId: selection.option.id,
    });
    const liveProfile = readiness.profiles[0];
    if (!liveProfile || liveProfile.readiness !== "ready") {
      await this.api.window.showWarningMessage(
        `Project Arch: Runtime profile '${selection.option.id}' is no longer ready, so no run was launched. Next: Run pa runtime check ${selection.option.id} --json.`,
      );
      return;
    }

    const command =
      `pa runtime check ${selection.option.id} --json && ` +
      `pa agent run ${taskRef} --runtime ${selection.option.runtime} --json`;
    await this.runCommandInTerminal(command, true);
    await this.maybeWarnRoutingDrift({ relativePath, command });

    await this.maybeOfferCommandDrivenChecklistUpdate({
      command: `pa agent run ${taskRef} --runtime ${selection.option.runtime} --json`,
      execute: true,
      relativePath,
    });
  }

  private resolveWorkspaceFilePath(relativePath: string): string | undefined {
    const absolutePath = path.resolve(this.workspaceRoot, relativePath);
    const normalizedWorkspaceRoot = path.resolve(this.workspaceRoot);
    const workspacePrefix = `${normalizedWorkspaceRoot}${path.sep}`;
    if (absolutePath !== normalizedWorkspaceRoot && !absolutePath.startsWith(workspacePrefix)) {
      return undefined;
    }

    return absolutePath;
  }

  private canPromptChecklistUpdate(promptKey: string): boolean {
    const now = Date.now();

    for (const [key, timestamp] of this.checklistPromptSuppressions.entries()) {
      if (now - timestamp >= CHECKLIST_PROMPT_SUPPRESSION_WINDOW_MS) {
        this.checklistPromptSuppressions.delete(key);
      }
    }

    if (this.checklistPromptSuppressions.has(promptKey)) {
      return false;
    }

    this.checklistPromptSuppressions.set(promptKey, now);
    return true;
  }

  private async maybeOfferCommandDrivenChecklistUpdate(input: {
    relativePath?: string;
    command: string;
    execute: boolean;
  }): Promise<void> {
    const relativePath = typeof input.relativePath === "string" ? input.relativePath.trim() : "";
    if (!input.execute || !relativePath) {
      return;
    }

    const offerDefinition = resolveCommandDrivenChecklistOffer(input.command);
    if (!offerDefinition) {
      return;
    }

    const absolutePath = this.resolveWorkspaceFilePath(relativePath);
    if (!absolutePath) {
      return;
    }

    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      return;
    }

    const parsed = taskWorkflowMetadataBoundary.parseTaskWorkflowMetadata({
      content,
      absolutePath,
      workspaceRoot: this.workspaceRoot,
    });

    if (!parsed.taskWorkflow) {
      return;
    }

    const stage = parsed.taskWorkflow.workflow.stages.find(
      (candidate) => candidate.id === offerDefinition.stageId,
    );
    if (!stage || stage.items.length === 0) {
      return;
    }

    const selectedItem =
      offerDefinition.preferredItemIds
        .map((itemId) => stage.items.find((item) => item.id === itemId))
        .find((item) => Boolean(item)) ?? stage.items[0];

    if (!selectedItem) {
      return;
    }

    if (
      !canTransitionChecklistItemByPrompt({
        currentStatus: selectedItem.status,
        targetStatus: offerDefinition.targetStatus,
      })
    ) {
      return;
    }

    const promptKey = `${relativePath}:${offerDefinition.stageId}:${selectedItem.id}:${offerDefinition.targetStatus}`;
    if (!this.canPromptChecklistUpdate(promptKey)) {
      return;
    }

    const updateActionLabel = `Set status to '${offerDefinition.targetStatus}'`;

    const selection = await this.api.window.showInformationMessage(
      `Project Arch: Command may advance checklist item '${selectedItem.label}' in '${path.basename(relativePath)}'. Set status to '${offerDefinition.targetStatus}'?`,
      updateActionLabel,
      "Not now",
    );

    if (selection !== updateActionLabel) {
      return;
    }

    await this.updateWorkflowChecklistItem({
      relativePath,
      stageId: stage.id,
      itemId: selectedItem.id,
      status: offerDefinition.targetStatus,
    });
  }

  private async promptDiscoveredFromTaskId(): Promise<string | undefined> {
    const discoveredFrom = await this.api.window.showInputBox({
      title: "Project Arch: Source Task ID",
      prompt: "Discovered tasks require a source task id (e.g. 001)",
      placeHolder: "001",
      ignoreFocusOut: true,
      validateInput: (value) => {
        const normalized = value.trim();
        if (normalized.length === 0) {
          return "Source task id is required for discovered tasks.";
        }

        if (!/^\d{3}$/.test(normalized)) {
          return "Use a 3-digit task id (e.g. 001).";
        }

        return undefined;
      },
    });

    if (!discoveredFrom) {
      return undefined;
    }

    return discoveredFrom.trim();
  }

  private async promptSlugBase(): Promise<string | undefined> {
    const slugBase = await this.api.window.showInputBox({
      title: "Project Arch: Task Slug",
      prompt: "Provide the task slug text (e.g. add-command-catalog-actions)",
      placeHolder: "add-command-catalog-actions",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (value.trim().length === 0) {
          return "Slug cannot be empty.";
        }
        return undefined;
      },
    });

    if (!slugBase) {
      return undefined;
    }

    return slugBase.trim();
  }

  private async createLaneTask(message: {
    phaseId?: string;
    milestoneId?: string;
    lane?: string;
    withSlug?: boolean;
  }): Promise<void> {
    const phaseId = typeof message.phaseId === "string" ? message.phaseId.trim() : "";
    const milestoneId = typeof message.milestoneId === "string" ? message.milestoneId.trim() : "";
    const lane =
      message.lane === "planned" || message.lane === "discovered" || message.lane === "backlog"
        ? message.lane
        : undefined;

    if (!phaseId || !milestoneId || !lane) {
      return;
    }

    let discoveredFromTask: string | null = null;
    if (lane === "discovered") {
      const discoveredFrom = await this.promptDiscoveredFromTaskId();
      if (!discoveredFrom) {
        return;
      }

      discoveredFromTask = discoveredFrom;
    }

    let slugBase: string | undefined;
    if (message.withSlug) {
      const slugInput = await this.promptSlugBase();
      if (!slugInput) {
        return;
      }
      slugBase = slugInput;
    }

    const result = await tasks.taskCreateInLane({
      phaseId,
      milestoneId,
      lane: lane as TaskLane,
      discoveredFromTask,
      slugBase,
      cwd: this.workspaceRoot,
    });

    if (!result.success || !result.data?.path) {
      await this.api.window.showWarningMessage(
        `Project Arch: Failed to create task. ${result.errors?.join("; ") ?? "Unknown error."}`,
      );
      return;
    }

    const createdRelativePath = path
      .relative(this.workspaceRoot, result.data.path)
      .split("\\")
      .join("/");
    await this.api.window.showInformationMessage(
      `Project Arch: Created task '${createdRelativePath}'.`,
    );

    await this.api.commands.executeCommand("vscode.open", this.api.Uri.file(result.data.path), {
      preview: false,
      preserveFocus: false,
    });

    await this.refresh();
  }

  private async createDiscoveredTaskFromSelectedTask(message: {
    phaseId?: string;
    milestoneId?: string;
    fromTaskId?: string;
  }): Promise<void> {
    const phaseId = typeof message.phaseId === "string" ? message.phaseId.trim() : "";
    const milestoneId = typeof message.milestoneId === "string" ? message.milestoneId.trim() : "";
    const fromTaskId = typeof message.fromTaskId === "string" ? message.fromTaskId.trim() : "";

    if (!phaseId || !milestoneId || !/^\d{3}$/.test(fromTaskId)) {
      return;
    }

    const result = await tasks.taskCreateInLane({
      phaseId,
      milestoneId,
      lane: "discovered",
      discoveredFromTask: fromTaskId,
      cwd: this.workspaceRoot,
    });

    if (!result.success || !result.data?.path) {
      await this.api.window.showWarningMessage(
        `Project Arch: Failed to create discovered task. ${result.errors?.join("; ") ?? "Unknown error."}`,
      );
      return;
    }

    const createdRelativePath = path
      .relative(this.workspaceRoot, result.data.path)
      .split("\\")
      .join("/");
    await this.api.window.showInformationMessage(
      `Project Arch: Created discovered task '${createdRelativePath}' from '${fromTaskId}'.`,
    );

    await this.api.commands.executeCommand("vscode.open", this.api.Uri.file(result.data.path), {
      preview: false,
      preserveFocus: false,
    });

    await this.refresh();
  }

  private async updateWorkflowChecklistItem(message: {
    relativePath?: string;
    stageId?: string;
    itemId?: string;
    status?: string;
  }): Promise<void> {
    const relativePath =
      typeof message.relativePath === "string" ? message.relativePath.trim() : "";
    const stageId = typeof message.stageId === "string" ? message.stageId.trim() : "";
    const itemId = typeof message.itemId === "string" ? message.itemId.trim() : "";
    const status =
      message.status === "planned" ||
      message.status === "in_progress" ||
      message.status === "done" ||
      message.status === "blocked" ||
      message.status === "skipped"
        ? message.status
        : undefined;

    if (!relativePath || !stageId || !itemId || !status) {
      return;
    }

    const absolutePath = this.resolveWorkspaceFilePath(relativePath);
    if (!absolutePath) {
      await this.api.window.showWarningMessage(
        "Project Arch: Refused checklist update outside workspace root.",
      );
      return;
    }

    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      await this.api.window.showWarningMessage(
        `Project Arch: Could not read '${relativePath}' for workflow update.`,
      );
      return;
    }

    const parsed = taskWorkflowMetadataBoundary.parseTaskWorkflowMetadata({
      content,
      absolutePath,
      workspaceRoot: this.workspaceRoot,
    });

    if (!parsed.taskWorkflow) {
      await this.api.window.showWarningMessage(
        `Project Arch: '${relativePath}' does not expose a parseable workflow yet.`,
      );
      return;
    }

    const updatedWorkflow = withUpdatedWorkflowItemStatus({
      workflow: parsed.taskWorkflow,
      stageId,
      itemId,
      status,
    });

    if (!updatedWorkflow) {
      await this.api.window.showWarningMessage(
        `Project Arch: Could not locate workflow item '${itemId}' in stage '${stageId}'.`,
      );
      return;
    }

    const updatedContent = renderTaskDocumentWithUpdatedWorkflow(content, updatedWorkflow);
    if (!updatedContent) {
      await this.api.window.showWarningMessage(
        `Project Arch: '${relativePath}' has malformed frontmatter fences and could not be updated.`,
      );
      return;
    }

    try {
      await fs.writeFile(absolutePath, updatedContent, "utf8");
    } catch {
      await this.api.window.showWarningMessage(
        `Project Arch: Failed to write workflow update to '${relativePath}'.`,
      );
      return;
    }

    await this.api.window.showInformationMessage(
      `Project Arch: Updated checklist item '${itemId}' to '${status}' in '${relativePath}'.`,
    );

    await this.refresh();
  }

  private async runCommandInTerminal(command: string, execute: boolean): Promise<void> {
    const hydratedCommand = await this.hydrateAgentCommandTemplate(command);
    const terminal = this.api.window.createTerminal({
      name: "Project Arch Actions",
      cwd: this.workspaceRoot,
    });

    terminal.show();
    terminal.sendText(hydratedCommand, execute);

    if (!execute) {
      await this.api.window.showInformationMessage(
        `Project Arch: Staged '${hydratedCommand}' in terminal. Edit placeholders, then press Enter.`,
      );
    }
  }

  private async loadModel(): Promise<ArtifactBrowserModel> {
    this.model = await buildArtifactBrowserModel(this.workspaceRoot);
    return this.model;
  }

  private async loadExperimentalShellData(): Promise<
    ExperimentalArtifactBrowserBootstrap["shellData"]
  > {
    const withTimeout = async <T>(promise: Promise<T>): Promise<T | undefined> => {
      return await Promise.race([
        promise,
        new Promise<undefined>((resolve) => {
          setTimeout(() => resolve(undefined), SHELL_SNAPSHOT_TIMEOUT_MS);
        }),
      ]);
    };

    const [runs, runtimes, lifecycle, commands] = await Promise.all([
      buildRunsPanelModel({
        workspaceRoot: this.workspaceRoot,
      }).catch(() => undefined),
      loadRuntimesPanelModelSnapshot({
        workspaceRoot: this.workspaceRoot,
        dependencies: {
          boundary: this.dependencies?.boundary,
        },
      }).catch(() => undefined),
      withTimeout(
        loadLifecycleShellModelSnapshot({
          workspaceRoot: this.workspaceRoot,
        }).catch(() => undefined),
      ),
      withTimeout(
        buildCommandCatalogModel({
          workspaceRoot: this.workspaceRoot,
        }).catch(() => undefined),
      ),
    ]);

    if (!runs && !runtimes && !lifecycle && !commands) {
      return undefined;
    }

    return {
      runs,
      runtimes,
      lifecycle,
      commands,
    };
  }

  public async refresh(): Promise<void> {
    await this.loadModel();
    await this.render();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options =
      this.options.renderMode === "experimental"
        ? {
            enableScripts: true,
            localResourceRoots: [
              this.api.Uri.file(
                path.join(this.options.extensionRoot ?? this.workspaceRoot, "dist"),
              ),
            ],
          }
        : {
            enableScripts: true,
          };

    webviewView.webview.onDidReceiveMessage(
      // Message type: WebviewToHostMessage — see artifactBrowserMessageContracts.ts
      async (message: Record<string, unknown>) => {
        if (!message) {
          return;
        }

        if (!isWebviewToHostMessage(message)) {
          return;
        }

        if (message.type === "updateWorkflowChecklistItem") {
          await this.updateWorkflowChecklistItem(message);
          return;
        }

        if (message.type === "createDiscoveredFromSelectedTask") {
          await this.createDiscoveredTaskFromSelectedTask(message);
          return;
        }

        if (message.type === "createLaneTask") {
          await this.createLaneTask(message);
          return;
        }

        if (
          message.type === "refreshRunsShellData" ||
          message.type === "refreshRuntimesShellData" ||
          message.type === "refreshLifecycleShellData" ||
          message.type === "refreshCommandCatalogShellData"
        ) {
          await this.refresh();
          return;
        }

        if (message.type === "runtimeProfileMutation") {
          await this.handleRuntimeProfileMutation(message);
          return;
        }

        if (message.type === "lifecycleStageRemove") {
          await runLifecycleRemoveFlow({ windowApi: this.api.window });
          await this.refresh();
          return;
        }

        if (message.type === "commandCatalogStageCommand") {
          await this.handleCommandCatalogStageCommand(message);
          return;
        }

        if (message.type === "openArtifactInspector") {
          if (
            typeof message.relativePath !== "string" ||
            message.relativePath.trim().length === 0
          ) {
            return;
          }

          const relativePath = message.relativePath.trim();
          const kind =
            message.kind === "task" ||
            message.kind === "run" ||
            message.kind === "audit" ||
            message.kind === "diff"
              ? message.kind
              : inferArtifactInspectorKind(relativePath);
          const label =
            typeof message.label === "string" && message.label.trim().length > 0
              ? message.label.trim()
              : path.basename(relativePath);

          await this.api.commands.executeCommand(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID, {
            kind,
            relativePath,
            label,
          });
          return;
        }

        if (message.type === "runCommand") {
          if (typeof message.command !== "string" || message.command.trim().length === 0) {
            return;
          }

          const command = message.command.trim();
          const execute = message.execute !== false;
          const relativePath =
            typeof message.relativePath === "string" ? message.relativePath.trim() : undefined;

          await this.runCommandInTerminal(command, execute);
          if (execute && /^pa\s+agent\s+(run|orchestrate)\b/i.test(command)) {
            await this.maybeWarnRoutingDrift({ relativePath, command });
          }
          await this.maybeOfferCommandDrivenChecklistUpdate({ command, execute, relativePath });
          return;
        }

        if (message.type === "launchTask") {
          if (typeof message.taskRef !== "string" || message.taskRef.trim().length === 0) {
            return;
          }

          const relativePath =
            typeof message.relativePath === "string" ? message.relativePath.trim() : undefined;
          await this.launchTask(message.taskRef.trim(), relativePath);
          return;
        }

        if (message.type === "stageChatCommand") {
          if (typeof message.command !== "string" || message.command.trim().length === 0) {
            return;
          }

          const commandId = message.command.trim();
          if (
            commandId !== OPEN_STAGE_CHAT_COMMAND_ID &&
            commandId !== RESET_STAGE_CHAT_COMMAND_ID &&
            commandId !== DISCARD_STAGE_CHAT_COMMAND_ID &&
            commandId !== RETURN_TO_WORKFLOW_VIEW_COMMAND_ID
          ) {
            return;
          }

          const relativePath =
            typeof message.relativePath === "string" ? message.relativePath.trim() : "";
          const stageId = typeof message.stageId === "string" ? message.stageId.trim() : "";
          const stageTitle =
            typeof message.stageTitle === "string" ? message.stageTitle.trim() : "";
          const action = typeof message.action === "string" ? message.action.trim() : "";

          if (!relativePath || !stageId) {
            return;
          }

          if (this.options.renderMode === "experimental") {
            await this.handleExperimentalStageChatLifecycle({
              relativePath,
              stageId,
              stageTitle,
              runtime:
                typeof message.runtime === "string" && message.runtime.trim().length > 0
                  ? message.runtime.trim()
                  : undefined,
              action,
            });
            return;
          }

          await this.api.commands.executeCommand(commandId, {
            relativePath,
            stageId,
            stageTitle,
            runtime:
              typeof message.runtime === "string" && message.runtime.trim().length > 0
                ? message.runtime.trim()
                : undefined,
            action,
            source: this.sourceViewId,
          });
          return;
        }

        if (message.type === "stageChatSendIntent") {
          const relativePath =
            typeof message.relativePath === "string" ? message.relativePath.trim() : "";
          const stageId = typeof message.stageId === "string" ? message.stageId.trim() : "";
          const stageTitle =
            typeof message.stageTitle === "string" ? message.stageTitle.trim() : "";
          const runtime = typeof message.runtime === "string" ? message.runtime.trim() : "";
          const messageText =
            typeof message.messageText === "string" ? message.messageText.trim() : "";

          if (!relativePath || !stageId || !messageText) {
            return;
          }

          await this.handleStageChatSendIntent({
            relativePath,
            stageId,
            stageTitle,
            runtime: runtime || undefined,
            messageText,
          });
          return;
        }

        if (message.type === "stageChatStopResponse") {
          const relativePath =
            typeof message.relativePath === "string" ? message.relativePath.trim() : "";
          const stageId = typeof message.stageId === "string" ? message.stageId.trim() : "";
          const stageTitle =
            typeof message.stageTitle === "string" ? message.stageTitle.trim() : "";

          if (!relativePath || !stageId) {
            return;
          }

          await this.handleStageChatStopResponse({
            relativePath,
            stageId,
            stageTitle,
          });
          return;
        }

        if (typeof message.relativePath !== "string") {
          return;
        }

        const absolutePath = path.join(this.workspaceRoot, message.relativePath);

        if (message.type === "openEdit") {
          await this.api.commands.executeCommand("vscode.open", this.api.Uri.file(absolutePath), {
            preview: false,
            preserveFocus: false,
          });
          return;
        }

        if (message.type === "openPreview") {
          await this.api.commands.executeCommand(
            "markdown.showPreviewToSide",
            this.api.Uri.file(absolutePath),
          );
          return;
        }

        if (message.type === "revealInExplorer") {
          await this.api.commands.executeCommand(
            "revealInExplorer",
            this.api.Uri.file(absolutePath),
          );
          return;
        }

        if (message.type === "copyPath") {
          await this.api.env.clipboard.writeText(message.relativePath);
          await this.api.window.showInformationMessage(
            `Project Arch: Copied path '${message.relativePath}'.`,
          );
          return;
        }

        if (message.type === "deleteFile" || message.type === "deleteDirectory") {
          const targetPath = path.resolve(this.workspaceRoot, message.relativePath);
          const workspaceRootPath = path.resolve(this.workspaceRoot);
          const normalizedWorkspaceRoot = workspaceRootPath.endsWith(path.sep)
            ? workspaceRootPath
            : `${workspaceRootPath}${path.sep}`;

          if (targetPath !== workspaceRootPath && !targetPath.startsWith(normalizedWorkspaceRoot)) {
            return;
          }

          const targetLabel = message.type === "deleteDirectory" ? "directory" : "file";
          const choice = await this.api.window.showWarningMessage(
            `Delete ${targetLabel} '${message.relativePath}'? This action cannot be undone.`,
            { modal: true },
            "Delete",
          );

          if (choice !== "Delete") {
            return;
          }

          await fs.rm(targetPath, {
            recursive: message.type === "deleteDirectory",
            force: false,
          });

          void this.api.window.showInformationMessage(
            `Project Arch: Deleted ${targetLabel} '${message.relativePath}'.`,
          );
          await this.refresh();
          return;
        }
      },
    );

    await this.render();
  }

  private async handleRuntimeProfileMutation(
    message: RuntimeProfileMutationMessage,
  ): Promise<void> {
    const result = await runRuntimeProfileMutationFlow({
      request: {
        kind: message.kind,
        profileId: message.profileId,
        currentModel: message.currentModel,
        runtime: message.runtime,
        suggestedModel: message.suggestedModel,
      },
      windowApi: this.api.window,
      stageCommand: (command) => {
        void this.runCommandInTerminal(command, false);
      },
    });

    if (result !== "staged") {
      return;
    }

    const choice = await this.api.window.showInformationMessage(
      "Command staged in terminal. Run it to apply the change, then refresh the shell.",
      "Refresh Shell",
    );

    if (choice === "Refresh Shell") {
      await this.refresh();
    }
  }

  private async handleCommandCatalogStageCommand(
    message: CommandCatalogStageCommandMessage,
  ): Promise<void> {
    if (typeof message.command !== "string" || message.command.trim().length === 0) {
      return;
    }

    const command = message.command.trim();
    if (message.target === "new") {
      await this.api.commands.executeCommand(STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID, command);
      return;
    }

    await this.api.commands.executeCommand(STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID, command);
  }

  private async render(): Promise<void> {
    if (!this.view) {
      return;
    }

    const model = this.model ?? (await this.loadModel());
    if (this.options.renderMode === "experimental") {
      const assets = await this.resolveBundledAssetUris();
      const bootstrap: ExperimentalArtifactBrowserBootstrap = {
        schemaVersion: EXPERIMENTAL_ARTIFACT_BROWSER_BOOTSTRAP_SCHEMA_VERSION,
        model,
        shellData: await this.loadExperimentalShellData(),
        stageChat: this.buildExperimentalStageChatSnapshot(model),
      };
      this.view.webview.html = renderExperimentalBrowserHtml({
        bootstrap,
        clientEntrypointUri: assets.clientEntrypointUri,
        clientStylesheetUris: assets.clientStylesheetUris,
        cspSource: this.view.webview.cspSource ?? "'self'",
      });
      return;
    }

    this.view.webview.html = renderBrowserHtml(model);
  }
}

export function registerArtifactNavigationViews(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "window" | "workspace" | "commands" | "Uri" | "env">,
  dependencies?: ArtifactNavigationDependencies,
): void {
  const workspaceRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  registerArtifactInspectorPanel(context, api, workspaceRoot);
  const extensionRoot =
    (context as Partial<vscode.ExtensionContext>).extensionPath ?? workspaceRoot;

  const maybeStateStore = (context as Partial<vscode.ExtensionContext>).globalState;
  const driftStateStore = maybeStateStore ?? createInMemoryDriftStateStore();
  const workspaceState = (context as Partial<vscode.ExtensionContext>).workspaceState;

  for (const surface of ARTIFACT_NAVIGATION_SURFACES) {
    const provider = new ArtifactNavigationBrowserProvider(
      surface.viewId,
      workspaceRoot,
      api,
      driftStateStore,
      dependencies,
      surface.viewId === EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID
        ? {
            renderMode: "experimental",
            extensionRoot,
            workspaceState,
          }
        : {
            renderMode: "baseline",
            workspaceState,
          },
    );
    const viewRegistration = api.window.registerWebviewViewProvider(surface.viewId, provider);

    const refreshCommand = api.commands.registerCommand(surface.refreshCommandId, async () => {
      await provider.refresh();
    });

    context.subscriptions.push(viewRegistration);
    context.subscriptions.push(refreshCommand);
  }
}
