import type { ComponentChildren } from "preact";
import {
  EmptyState,
  Surface,
  SurfaceSection,
  type ShellGuidancePayload,
  type ShellNavigationItem,
  type ShellSurfaceSlot,
} from "../../preact";
import {
  COMMANDS_SHELL_SURFACE_ID,
  LIFECYCLE_SHELL_SURFACE_ID,
  RUNS_SHELL_SURFACE_ID,
  RUNTIMES_SHELL_SURFACE_ID,
  RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH,
} from "./surfaceMigrationBoundary";

export const artifactBrowserShellNavigationItems: ShellNavigationItem[] = [
  {
    id: "artifacts",
    label: "Artifacts",
    description: "Artifact browser surface migrated into the shared shell.",
  },
  {
    id: RUNS_SHELL_SURFACE_ID,
    label: "Runs",
    description: "Runs migration slice anchored to the experimental artifact-browser boundary.",
  },
  {
    id: RUNTIMES_SHELL_SURFACE_ID,
    label: "Runtimes",
    description: "Runtimes migration slice anchored to the experimental artifact-browser boundary.",
  },
  {
    id: LIFECYCLE_SHELL_SURFACE_ID,
    label: "Lifecycle",
    description: "Lifecycle migration slice anchored to the experimental artifact-browser boundary.",
  },
  {
    id: COMMANDS_SHELL_SURFACE_ID,
    label: "Commands",
    description: "Command-catalog migration slice anchored to the experimental artifact-browser boundary.",
  },
];

function renderPendingSurface(title: string, description: string): ComponentChildren {
  return (
    <Surface>
      <SurfaceSection title={title}>
        <EmptyState>{description}</EmptyState>
      </SurfaceSection>
    </Surface>
  );
}

export function createArtifactBrowserSurfaceGuidancePayload(
  activeSurface?: ShellNavigationItem,
): ShellGuidancePayload {
  const guidanceBySurface: Record<string, { title: string; summary: string; items: ShellGuidancePayload["items"] }> = {
    artifacts: {
      title: "Artifacts Guidance",
      summary:
        "Use artifact navigation, file actions, and stage-chat helpers from one shared shell pane.",
      items: [
        {
          id: "artifacts-navigate",
          label: "Navigate Artifacts",
          detail: "Open the left navigation sheet and select Artifacts to inspect repository-backed task/workflow files.",
        },
        {
          id: "artifacts-guidance-buttons",
          label: "Open Contextual Guidance",
          detail: "Use in-surface help actions (Navigation/File Actions/Stage Chat) to load focused guidance payloads in the shared rail.",
        },
      ],
    },
    [RUNS_SHELL_SURFACE_ID]: {
      title: "Runs Guidance",
      summary: `Runs navigation/guidance wiring remains anchored to ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      items: [
        {
          id: "runs-surface-scope",
          label: "Keep Runs Behavior Local",
          detail:
            "Preserve run status/reconcile/orchestration authority in host-side runs boundaries while reusing shared shell navigation state.",
        },
        {
          id: "runs-guidance-contract",
          label: "Use Shared Guidance Contract",
          detail:
            "Surface-specific runs guidance should flow through the same right-rail payload contract without introducing parallel shell pathways.",
        },
      ],
    },
    [RUNTIMES_SHELL_SURFACE_ID]: {
      title: "Runtimes Guidance",
      summary: `Runtime migration and guidance pathways remain anchored to ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      items: [
        {
          id: "runtimes-surface-scope",
          label: "Keep Runtime Authority Host-Routed",
          detail:
            "Retain runtime inventory/readiness/mutation authority in host boundaries while sharing shell navigation and guidance state.",
        },
        {
          id: "runtimes-guidance-contract",
          label: "Use Shared Guidance Rail",
          detail:
            "Render runtimes contextual guidance through the shared right rail instead of a separate runtime-specific shell guidance track.",
        },
      ],
    },
    [LIFECYCLE_SHELL_SURFACE_ID]: {
      title: "Lifecycle Guidance",
      summary: `Lifecycle shell integration remains bounded by ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      items: [
        {
          id: "lifecycle-surface-scope",
          label: "Preserve Init/Remove Authority",
          detail:
            "Keep lifecycle command execution and confirmation flows host-routed while shell navigation and guidance remain shared.",
        },
        {
          id: "lifecycle-guidance-contract",
          label: "Keep Guidance Contract Consistent",
          detail:
            "Lifecycle-specific onboarding/remediation guidance should reuse the common rail payload contract used by all shell surfaces.",
        },
      ],
    },
    [COMMANDS_SHELL_SURFACE_ID]: {
      title: "Commands Guidance",
      summary: `Command-catalog shell integration remains bounded by ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      items: [
        {
          id: "commands-surface-scope",
          label: "Preserve Command Staging Authority",
          detail:
            "Keep terminal selection and command staging host-routed while command discovery/filter interactions remain surface-local.",
        },
        {
          id: "commands-guidance-contract",
          label: "Reuse Shared Guidance Rail",
          detail:
            "Command-surface contextual help should flow through the shared guidance rail rather than introducing shell-fragmenting overlays.",
        },
      ],
    },
  };

  const surfaceId = activeSurface?.id ?? "artifacts";
  const surfaceGuidance = guidanceBySurface[surfaceId] ?? guidanceBySurface["artifacts"];

  return {
    id: `surface-${surfaceId}`,
    title: surfaceGuidance.title,
    summary: surfaceGuidance.summary,
    items: surfaceGuidance.items,
  };
}

export function createArtifactNavigationGuidancePayload(input: {
  activeDirectoryPath: string;
  breadcrumbCount: number;
}): ShellGuidancePayload {
  const activePath = input.activeDirectoryPath || "(repository root)";

  return {
    id: `artifacts-navigation-${activePath}`,
    title: "Artifact Navigation Guidance",
    summary: `Navigation context for ${activePath}.`,
    items: [
      {
        id: "navigation-breadcrumbs",
        label: "Use Breadcrumb Navigation",
        detail: `Current breadcrumb depth is ${input.breadcrumbCount}. Use breadcrumbs to jump quickly between artifact directories.`,
      },
      {
        id: "navigation-directory",
        label: "Directory Selection",
        detail: "Use Roots, Directories, and Files sections to stage file/workflow actions without leaving the shared shell.",
      },
    ],
  };
}

export function createArtifactRootsGuidancePayload(input: {
  rootCount: number;
  activeDirectoryPath: string;
}): ShellGuidancePayload {
  const activePath = input.activeDirectoryPath || "(repository root)";

  return {
    id: `artifacts-roots-${activePath}`,
    title: "Artifact Roots Guidance",
    summary: `Root navigation context for ${activePath}.`,
    items: [
      {
        id: "roots-purpose",
        label: "Use Root Shortcuts",
        detail:
          "Roots provide fast workspace-entry jumps into canonical artifact trees before refining with directory and file navigation.",
      },
      {
        id: "roots-available",
        label: "Available Roots",
        detail: `Current root count: ${input.rootCount}. Use these top-level anchors when switching project/milestone artifact areas.`,
      },
    ],
  };
}

export function createArtifactDirectoriesGuidancePayload(input: {
  directoryCount: number;
  activeDirectoryPath: string;
}): ShellGuidancePayload {
  const activePath = input.activeDirectoryPath || "(repository root)";

  return {
    id: `artifacts-directories-${activePath}`,
    title: "Artifact Directories Guidance",
    summary: `Directory navigation context for ${activePath}.`,
    items: [
      {
        id: "directories-browse",
        label: "Browse Child Directories",
        detail:
          "Use directory cards to move deeper into artifact trees while preserving workflow and file-action context in the same surface. Right-click a directory card for contextual actions like delete.",
      },
      {
        id: "directories-available",
        label: "Available Directories",
        detail: `Current child directory count: ${input.directoryCount}. Use roots and breadcrumbs for larger path jumps when needed.`,
      },
    ],
  };
}

export function createArtifactFilesGuidancePayload(input: {
  fileCount: number;
  activeDirectoryPath: string;
}): ShellGuidancePayload {
  const activePath = input.activeDirectoryPath || "(repository root)";

  return {
    id: `artifacts-files-${activePath}`,
    title: "Artifact Files Guidance",
    summary: `File navigation context for ${activePath}.`,
    items: [
      {
        id: "files-select",
        label: "Select Artifact Files",
        detail:
          "Use file cards to set the active artifact and unlock file-type metadata plus file/workflow/stage-chat actions in this surface. Right-click a file card for contextual actions like delete.",
      },
      {
        id: "files-available",
        label: "Available Files",
        detail: `Current file count: ${input.fileCount}. Use directories, roots, and breadcrumbs to refine scope when a file is not visible.`,
      },
    ],
  };
}

export function createArtifactFileActionsGuidancePayload(input: {
  selectedFilePath?: string;
  hasWorkflowContext: boolean;
  stagedCommandCount: number;
}): ShellGuidancePayload {
  const filePath = input.selectedFilePath ?? "(none)";

  return {
    id: `artifacts-file-actions-${filePath}`,
    title: "Artifact File Actions Guidance",
    summary:
      input.selectedFilePath
        ? `Guidance for file actions on ${input.selectedFilePath}.`
        : "Select a task/workflow artifact to unlock file and workflow-aware actions.",
    items: [
      {
        id: "file-open-preview",
        label: "Open, Preview, and Reveal",
        detail:
          "Use Open/Preview for the selected artifact, and Reveal in Explorer for workspace context when you need the filesystem location.",
      },
      {
        id: "file-related-links",
        label: "Related File Buckets",
        detail:
          "Related files are sourced from codeTargets, publicDocs, decisions, evidence, and traceLinks metadata. Each related file row supports both Open and Preview actions.",
      },
      {
        id: "file-metadata-panel",
        label: "File-Type Metadata",
        detail:
          "Metadata shown in this section is file-type aware (for example, overview files show schemaVersion/updatedAt rather than task workflow fields).",
      },
      {
        id: "workflow-actions",
        label: "Workflow-Aware Actions",
        detail: input.hasWorkflowContext
          ? "Launch/create actions are enabled because the selection resolves to a task workflow context."
          : "Workflow launch/create actions are shown when the selected file is a canonical task artifact.",
      },
      {
        id: "command-staging",
        label: "Command Staging",
        detail: `Current staged command preset count: ${input.stagedCommandCount}. Stage commands here to preserve host-side authority semantics.`,
      },
    ],
  };
}

export function createArtifactWorkflowActionsGuidancePayload(input: {
  selectedFilePath?: string;
  hasWorkflowContext: boolean;
}): ShellGuidancePayload {
  const filePath = input.selectedFilePath ?? "(none)";

  return {
    id: `artifacts-workflow-actions-${filePath}`,
    title: "Artifact Workflow Actions Guidance",
    summary: input.selectedFilePath
      ? `Workflow action context for ${input.selectedFilePath}.`
      : "Select a task artifact to enable workflow-aware actions.",
    items: [
      {
        id: "workflow-launch-run",
        label: "Launch Task Run",
        detail:
          "Use Launch Run to start task-scoped runtime execution from the selected workflow artifact.",
      },
      {
        id: "workflow-create-followups",
        label: "Create Follow-up Tasks",
        detail:
          "Use Create Discovered/Planned/Backlog to produce follow-up tasks in the same phase and milestone context.",
      },
      {
        id: "workflow-availability",
        label: "Action Availability",
        detail: input.hasWorkflowContext
          ? "Workflow-aware actions are enabled because the selected file resolves to a task workflow context."
          : "Workflow-aware actions appear when the selected file is a canonical task artifact.",
      },
    ],
  };
}

export function createArtifactCommandStagingGuidancePayload(input: {
  selectedFilePath?: string;
  stagedCommandCount: number;
}): ShellGuidancePayload {
  const filePath = input.selectedFilePath ?? "(none)";

  return {
    id: `artifacts-command-staging-${filePath}`,
    title: "Artifact Command Staging Guidance",
    summary: input.selectedFilePath
      ? `Command staging context for ${input.selectedFilePath}.`
      : "Select a task artifact to stage task-scoped commands.",
    items: [
      {
        id: "command-staging-presets",
        label: "Use Command Presets",
        detail:
          "Each subsection maps to a command preset and includes editable parameter controls before staging.",
      },
      {
        id: "command-staging-parameters",
        label: "Configure Parameters",
        detail:
          "Use dropdowns and inputs to fill command placeholders, then verify the resolved command preview before staging.",
      },
      {
        id: "command-staging-count",
        label: "Available Presets",
        detail: `Current command preset count: ${input.stagedCommandCount}.`,
      },
      {
        id: "command-agent-orchestrate",
        label: "Agent Orchestrate",
        detail:
          "Execute an agent task with orchestration control. The orchestrate command manages task execution with resource and dependency orchestration, applying intelligent scheduling and context propagation across runtime boundaries.",
      },
      {
        id: "command-agent-run",
        label: "Agent Run",
        detail:
          "Execute an agent task directly on a specified runtime. Use this for simple task execution without orchestration overhead. Specify the runtime (local or cloud) and timeout in milliseconds.",
      },
      {
        id: "command-agent-status",
        label: "Agent Status",
        detail:
          "Query the current status of an agent run using its run ID. Returns comprehensive run state including completion status, result availability, and runtime context.",
      },
      {
        id: "command-agent-validate",
        label: "Agent Validate",
        detail:
          "Validate the results and artifacts produced by an agent run. Checks integrity, schema compliance, and logical consistency of the generated outputs.",
      },
      {
        id: "command-agent-reconcile",
        label: "Agent Reconcile",
        detail:
          "Reconcile differences between expected and actual agent run outcomes. Helps identify drift, missing artifacts, or state inconsistencies for debugging and recovery.",
      },
      {
        id: "command-result-import",
        label: "Result Import",
        detail:
          "Import an external result bundle into the project context. Used to integrate results from external agents, prior runs, or shared results from other team members.",
      },
    ],
  };
}

export function createArtifactWorkflowChecklistGuidancePayload(input: {
  selectedFilePath?: string;
  stageCount: number;
  selectedStageId?: string;
}): ShellGuidancePayload {
  const filePath = input.selectedFilePath ?? "(none)";
  const activeStage = input.selectedStageId ?? "(none)";

  return {
    id: `artifacts-workflow-checklist-${filePath}`,
    title: "Artifact Workflow Checklist Guidance",
    summary: input.selectedFilePath
      ? `Workflow checklist context for ${input.selectedFilePath}.`
      : "Select a task artifact to view and update workflow checklist stages.",
    items: [
      {
        id: "workflow-checklist-stage-map",
        label: "Review Stage Subsections",
        detail:
          "Each stage appears as a subsection, matching command staging layout so stage context and item actions stay easy to scan.",
      },
      {
        id: "workflow-checklist-stage-select",
        label: "Set Active Stage",
        detail: `Use Select Stage to focus stage-scoped actions. Current active stage: ${activeStage}.`,
      },
      {
        id: "workflow-checklist-item-updates",
        label: "Update Checklist Items",
        detail:
          "Use In Progress and Done actions on each item card to update workflow status through host-authoritative checklist mutation flows.",
      },
      {
        id: "workflow-checklist-stage-count",
        label: "Available Stages",
        detail: `Current workflow stage count: ${input.stageCount}.`,
      },
    ],
  };
}

export function createArtifactStageChatGuidancePayload(input: {
  selectedFilePath?: string;
  stageId?: string;
  stageTitle?: string;
}): ShellGuidancePayload {
  const stageLabel = input.stageTitle ?? input.stageId ?? "(no stage selected)";

  return {
    id: `artifacts-stage-chat-${input.stageId ?? "none"}`,
    title: "Artifact Stage Chat Guidance",
    summary: "Use stage-chat actions to hand off workflow-stage context to runtime inference safely.",
    items: [
      {
        id: "stage-selection",
        label: "Select Stage",
        detail: `Current stage context: ${stageLabel}. Select a workflow stage before opening stage chat actions.`,
      },
      {
        id: "stage-chat-open",
        label: "Open Stage Chat",
        detail: input.selectedFilePath
          ? `Stage chat for ${input.selectedFilePath} routes through shared host commands and runtime boundaries.`
          : "Choose a file and stage before opening stage chat so host-side context packaging can resolve correctly.",
      },
    ],
  };
}

export function createArtifactBrowserShellSurfaceSlots(
  input: {
    artifactSurface: ComponentChildren;
    runsSurface?: ComponentChildren;
    runtimesSurface?: ComponentChildren;
    lifecycleSurface?: ComponentChildren;
    commandsSurface?: ComponentChildren;
  },
): readonly ShellSurfaceSlot[] {
  return [
    {
      id: "artifacts",
      render: () => input.artifactSurface,
    },
    {
      id: RUNS_SHELL_SURFACE_ID,
      render: () => input.runsSurface ?? renderPendingSurface(
        "Runs",
        `Runs shell surface data is currently unavailable. Refresh to reload migration content from ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      ),
    },
    {
      id: RUNTIMES_SHELL_SURFACE_ID,
      render: () => input.runtimesSurface ?? renderPendingSurface(
        "Runtimes",
        `Runtimes shell surface data is currently unavailable. Refresh to reload migration content from ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      ),
    },
    {
      id: LIFECYCLE_SHELL_SURFACE_ID,
      render: () => input.lifecycleSurface ?? renderPendingSurface(
        "Lifecycle",
        `Lifecycle shell surface data is currently unavailable. Refresh to reload migration content from ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      ),
    },
    {
      id: COMMANDS_SHELL_SURFACE_ID,
      render: () => input.commandsSurface ?? renderPendingSurface(
        "Commands",
        `Command shell surface data is currently unavailable. Refresh to reload migration content from ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}.`,
      ),
    },
  ];
}
