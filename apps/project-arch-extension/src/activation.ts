import type * as vscode from "vscode";
import path from "node:path";
import {
  LocalTaskWorkflowError,
  runLocalTaskWorkflow,
  type LocalTaskWorkflowState,
  type LocalTaskWorkflowAction,
} from "./workflows/localTaskWorkflow";
import { buildDiffFirstReviewModel } from "./review/localDiffReview";
import {
  LOCAL_WORKFLOW_STATUS_KEY,
  buildCompletedStatus,
  buildFailureStatus,
  buildStatusFromStep,
  formatStatusSummary,
} from "./workflows/localWorkflowStatus";
import { registerArtifactNavigationViews } from "./navigation/artifactNavigationBrowser";
import { OPEN_ARTIFACT_INSPECTOR_COMMAND_ID } from "./navigation/artifactInspectorPanel";
import { registerCommandCatalogView } from "./navigation/commandCatalogView";
import { registerLifecycleView } from "./navigation/lifecycleView";
import { registerRunsView } from "./navigation/runsView";
import { registerRuntimesView } from "./navigation/runtimesView";
import {
  DISCARD_STAGE_CHAT_COMMAND_ID,
  OPEN_STAGE_CHAT_COMMAND_ID,
  RESET_STAGE_CHAT_COMMAND_ID,
  RETURN_TO_WORKFLOW_VIEW_COMMAND_ID,
} from "./navigation/stageChatWorkflowView";

export const INITIAL_COMMAND_ID = "projectArch.implementTask" as const;
export const GENERATE_PLAN_COMMAND_ID = "projectArch.generateTaskPlan" as const;
export const EXPLAIN_TASK_COMMAND_ID = "projectArch.explainTask" as const;
export const REVIEW_LOCAL_RESULT_COMMAND_ID = "projectArch.reviewLocalResult" as const;
export const VIEW_LOCAL_WORKFLOW_STATUS_COMMAND_ID = "projectArch.viewLocalWorkflowStatus" as const;
export const LOCAL_WORKFLOW_STATE_KEY = "projectArch.localWorkflow.latest" as const;

export type TaskActionKind = LocalTaskWorkflowAction;

const taskActionLabelByKind: Record<TaskActionKind, string> = {
  implement: "Implement Task",
  plan: "Generate Task Plan",
  explain: "Explain Task",
};

function normalizeTaskRef(value: string): string {
  return value.trim();
}

export async function promptForTaskRef(
  api: Pick<typeof vscode, "window">,
): Promise<string | undefined> {
  const taskRef = await api.window.showInputBox({
    prompt: "Enter a 3-digit task ref (example: 001)",
    placeHolder: "001",
    ignoreFocusOut: true,
    validateInput: (value) => {
      const normalized = normalizeTaskRef(value);
      if (normalized.length === 0) {
        return "Task ref is required.";
      }
      if (!/^\d{3}$/.test(normalized)) {
        return "Task ref must be exactly 3 digits.";
      }
      return undefined;
    },
  });

  if (!taskRef) {
    return undefined;
  }

  return normalizeTaskRef(taskRef);
}

export async function runTaskAction(
  kind: TaskActionKind,
  context: Pick<vscode.ExtensionContext, "workspaceState">,
  api: Pick<typeof vscode, "window" | "commands">,
): Promise<void> {
  const taskRef = await promptForTaskRef(api);

  if (!taskRef) {
    return;
  }

  const resultBundlePath =
    kind === "implement"
      ? await api.window.showInputBox({
          prompt:
            "Enter the local result bundle path produced by runtime work (example: ./bundle.json)",
          placeHolder: "./bundle.json",
          ignoreFocusOut: true,
          validateInput: (value) => {
            const normalized = value.trim();
            if (normalized.length === 0) {
              return "Result bundle path is required.";
            }
            return undefined;
          },
        })
      : undefined;

  if (kind === "implement" && !resultBundlePath) {
    return;
  }

  try {
    const workflow = await runLocalTaskWorkflow({
      action: kind,
      taskRef,
      resultBundlePath,
      onStep: async (event) => {
        const status = buildStatusFromStep(event);
        await context.workspaceState.update(LOCAL_WORKFLOW_STATUS_KEY, status);
      },
    });

    await context.workspaceState.update(LOCAL_WORKFLOW_STATE_KEY, workflow);
    await context.workspaceState.update(
      LOCAL_WORKFLOW_STATUS_KEY,
      buildCompletedStatus(workflow, new Date().toISOString()),
    );
    const action = await api.window.showInformationMessage(
      buildTaskActionMessage(workflow),
      ...(kind === "implement" ? ["Review Diffs"] : []),
    );

    if (kind === "implement" && action === "Review Diffs") {
      await api.commands.executeCommand(REVIEW_LOCAL_RESULT_COMMAND_ID);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const phase = error instanceof LocalTaskWorkflowError ? error.phase : "prepare";
    const status = buildFailureStatus({
      action: kind,
      taskRef,
      phase,
      message,
      at: new Date().toISOString(),
    });
    await context.workspaceState.update(LOCAL_WORKFLOW_STATUS_KEY, status);
    await api.window.showErrorMessage(
      `Project Arch: ${taskActionLabelByKind[kind]} failed for task ${taskRef}. ${status.message}${status.nextStep ? ` Next: ${status.nextStep}` : ""}`,
    );
  }
}

export async function runDiffFirstReview(
  context: Pick<vscode.ExtensionContext, "workspaceState">,
  api: Pick<typeof vscode, "window" | "commands" | "Uri" | "workspace">,
): Promise<void> {
  const workflow = context.workspaceState.get<LocalTaskWorkflowState>(LOCAL_WORKFLOW_STATE_KEY);
  const baseTaskRef = workflow?.taskRef ?? "unknown";
  const baseRunId = workflow?.runId;

  await context.workspaceState.update(LOCAL_WORKFLOW_STATUS_KEY, {
    action: workflow?.action ?? "implement",
    taskRef: baseTaskRef,
    runId: baseRunId,
    phase: "review",
    state: "in-progress",
    canonicalOutcome: "review-running",
    message: `Diff-first review started for task ${baseTaskRef}${baseRunId ? ` (${baseRunId})` : ""}.`,
    updatedAt: new Date().toISOString(),
  });

  try {
    const model = await buildDiffFirstReviewModel({
      context,
    });

    if (model.changedFiles.length === 0) {
      await api.window.showWarningMessage(
        `Project Arch: No changed files found for run ${model.runId}.`,
      );
      return;
    }

    const workspaceRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const resolveRepoPath = (value: string): string => path.resolve(workspaceRoot, value);

    const firstFile = resolveRepoPath(model.changedFiles[0]);
    await api.commands.executeCommand("git.openChange", api.Uri.file(firstFile));

    const reviewAction = await api.window.showInformationMessage(
      `Project Arch: Diff-first review opened for ${model.taskRef} (${model.runId}).`,
      "Open Reconcile Report",
      "Open Run Record",
    );

    if (reviewAction === "Open Reconcile Report" && model.reportMarkdownPath) {
      await api.commands.executeCommand(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID, {
        kind: "diff",
        relativePath: model.reportMarkdownPath,
        label: path.basename(model.reportMarkdownPath),
        description: "Reconcile report",
      });
    }

    if (reviewAction === "Open Run Record" && model.runRecordPath) {
      await api.commands.executeCommand(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID, {
        kind: "run",
        relativePath: model.runRecordPath,
        label: path.basename(model.runRecordPath, ".json"),
        description: "Run record",
      });
    }

    await context.workspaceState.update(LOCAL_WORKFLOW_STATUS_KEY, {
      action: workflow?.action ?? "implement",
      taskRef: model.taskRef,
      runId: model.runId,
      phase: "review",
      state: "completed",
      canonicalOutcome: "review-completed",
      message: `Diff-first review is available for task ${model.taskRef} (${model.runId}).`,
      nextStep: "Inspect diffs and reconcile artifacts before accepting repository changes.",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await context.workspaceState.update(
      LOCAL_WORKFLOW_STATUS_KEY,
      buildFailureStatus({
        action: workflow?.action ?? "implement",
        taskRef: baseTaskRef,
        runId: baseRunId,
        phase: "review",
        message,
        at: new Date().toISOString(),
      }),
    );
    await api.window.showErrorMessage(`Project Arch: Diff-first review failed. ${message}`);
  }
}

export async function viewLocalWorkflowStatus(
  context: Pick<vscode.ExtensionContext, "workspaceState">,
  api: Pick<typeof vscode, "window">,
): Promise<void> {
  const status =
    context.workspaceState.get<ReturnType<typeof buildCompletedStatus>>(LOCAL_WORKFLOW_STATUS_KEY);

  if (!status) {
    await api.window.showWarningMessage(
      "Project Arch: No local workflow status is available yet. Run a task action first.",
    );
    return;
  }

  const summary = formatStatusSummary(status);
  if (status.state === "failed") {
    await api.window.showErrorMessage(summary);
    return;
  }

  await api.window.showInformationMessage(summary);
}

function buildTaskActionMessage(workflow: LocalTaskWorkflowState): string {
  if (workflow.action === "implement") {
    return `Project Arch: Implement Task completed for ${workflow.taskRef} (${workflow.runId}). Artifacts: ${workflow.artifacts.resultPath ?? "result"}, ${workflow.artifacts.runRecordPath ?? "run"}, ${workflow.artifacts.reportPath ?? "report"}. Transport: ${workflow.transport}.`;
  }

  if (workflow.action === "explain") {
    return `Project Arch: Explain Task prepared prompt context for ${workflow.taskRef} (${workflow.runId}). Transport: ${workflow.transport}.`;
  }

  return `Project Arch: Generate Task Plan prepared local workflow context for ${workflow.taskRef} (${workflow.runId}). Contract: ${workflow.artifacts.contractPath}. Prompt: ${workflow.artifacts.promptPath}. Transport: ${workflow.transport}.`;
}

export async function registerInitialCommands(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "commands" | "window" | "Uri" | "workspace">,
): Promise<void> {
  const command = api.commands.registerCommand(INITIAL_COMMAND_ID, async () => {
    await runTaskAction("implement", context, api);
  });

  const generatePlan = api.commands.registerCommand(GENERATE_PLAN_COMMAND_ID, async () => {
    await runTaskAction("plan", context, api);
  });

  const explainTask = api.commands.registerCommand(EXPLAIN_TASK_COMMAND_ID, async () => {
    await runTaskAction("explain", context, api);
  });

  const reviewLocalResult = api.commands.registerCommand(
    REVIEW_LOCAL_RESULT_COMMAND_ID,
    async () => {
      await runDiffFirstReview(context, api);
    },
  );

  const viewLocalWorkflowStatusCommand = api.commands.registerCommand(
    VIEW_LOCAL_WORKFLOW_STATUS_COMMAND_ID,
    async () => {
      await viewLocalWorkflowStatus(context, api);
    },
  );

  const openStageChatCommand = api.commands.registerCommand(
    OPEN_STAGE_CHAT_COMMAND_ID,
    async (input?: {
      relativePath?: string;
      stageId?: string;
      stageTitle?: string;
      action?: string;
      messageText?: string;
    }) => {
      const stageId = typeof input?.stageId === "string" ? input.stageId.trim() : "";
      const stageTitle =
        typeof input?.stageTitle === "string" && input.stageTitle.trim().length > 0
          ? input.stageTitle.trim()
          : stageId;
      const relativePath = typeof input?.relativePath === "string" ? input.relativePath.trim() : "";
      const action = typeof input?.action === "string" ? input.action.trim().toLowerCase() : "open";
      const messageText = typeof input?.messageText === "string" ? input.messageText.trim() : "";
      const actionLabel =
        action === "resume"
          ? "Resume Stage Chat"
          : action === "send"
            ? "Stage Chat message send"
            : "Open Stage Chat";

      const prompt = [
        `Stage chat mode for '${stageTitle || "selected stage"}'.`,
        stageId ? `Stage ID: ${stageId}.` : undefined,
        relativePath ? `Task path: ${relativePath}.` : undefined,
        messageText ? `User message: ${messageText}` : undefined,
        "Discuss this stage and propose next steps without mutating artifacts until explicit acceptance.",
      ]
        .filter(Boolean)
        .join("\n");

      const chatCommandCandidates = [
        "workbench.action.chat.open",
        "workbench.action.chat.openInChatView",
        "chat.open",
        "vscode.chat.open",
        "workbench.action.quickchat.open",
        "workbench.action.quickchat.toggle",
      ] as const;

      const maybeGetCommands = (
        api.commands as typeof api.commands & {
          getCommands?: (filterInternal?: boolean) => Thenable<string[]>;
        }
      ).getCommands;

      let availableCommands: ReadonlySet<string> | undefined;
      if (typeof maybeGetCommands === "function") {
        try {
          const commandList = await maybeGetCommands(true);
          availableCommands = new Set(commandList);
        } catch {
          availableCommands = undefined;
        }
      }

      const candidateCommands =
        availableCommands && availableCommands.size > 0
          ? chatCommandCandidates.filter((commandId) => availableCommands?.has(commandId))
          : [...chatCommandCandidates];

      if (candidateCommands.length === 0) {
        await api.window.showWarningMessage(
          "Project Arch: Stage chat could not open because no VS Code chat command is available. Verify that Chat/Copilot chat is enabled in this VS Code environment.",
        );
        return;
      }

      await api.window.showInformationMessage(
        `Project Arch: ${actionLabel} requested for '${stageTitle || "selected stage"}'.`,
      );

      let opened = false;
      for (const commandId of candidateCommands) {
        try {
          await api.commands.executeCommand(commandId, prompt);
          opened = true;
          break;
        } catch {
          try {
            await api.commands.executeCommand(commandId);
            opened = true;
            break;
          } catch {
            continue;
          }
        }
      }

      if (!opened) {
        await api.window.showWarningMessage(
          "Project Arch: Stage chat command executed, but the chat interface did not open. Try 'Chat: Open' from the Command Palette and confirm chat providers are enabled.",
        );
      }
    },
  );

  const resetStageChatCommand = api.commands.registerCommand(
    RESET_STAGE_CHAT_COMMAND_ID,
    async (input?: { stageTitle?: string; stageId?: string }) => {
      const label =
        typeof input?.stageTitle === "string" && input.stageTitle.trim().length > 0
          ? input.stageTitle.trim()
          : typeof input?.stageId === "string" && input.stageId.trim().length > 0
            ? input.stageId.trim()
            : "selected stage";
      await api.window.showInformationMessage(
        `Project Arch: Reset Stage Chat requested for '${label}'.`,
      );
    },
  );

  const discardStageChatCommand = api.commands.registerCommand(
    DISCARD_STAGE_CHAT_COMMAND_ID,
    async (input?: { stageTitle?: string; stageId?: string }) => {
      const label =
        typeof input?.stageTitle === "string" && input.stageTitle.trim().length > 0
          ? input.stageTitle.trim()
          : typeof input?.stageId === "string" && input.stageId.trim().length > 0
            ? input.stageId.trim()
            : "selected stage";
      await api.window.showInformationMessage(
        `Project Arch: Discard Stage Chat requested for '${label}'.`,
      );
    },
  );

  const returnToWorkflowViewCommand = api.commands.registerCommand(
    RETURN_TO_WORKFLOW_VIEW_COMMAND_ID,
    async (input?: { stageTitle?: string; stageId?: string }) => {
      const label =
        typeof input?.stageTitle === "string" && input.stageTitle.trim().length > 0
          ? input.stageTitle.trim()
          : typeof input?.stageId === "string" && input.stageId.trim().length > 0
            ? input.stageId.trim()
            : "workflow";
      await api.window.showInformationMessage(
        `Project Arch: Returned to workflow from '${label}' stage chat.`,
      );
    },
  );

  context.subscriptions.push(command);
  context.subscriptions.push(generatePlan);
  context.subscriptions.push(explainTask);
  context.subscriptions.push(reviewLocalResult);
  context.subscriptions.push(viewLocalWorkflowStatusCommand);
  context.subscriptions.push(openStageChatCommand);
  context.subscriptions.push(resetStageChatCommand);
  context.subscriptions.push(discardStageChatCommand);
  context.subscriptions.push(returnToWorkflowViewCommand);
}

export async function activateExtension(
  context: vscode.ExtensionContext,
  api: Pick<
    typeof vscode,
    | "commands"
    | "window"
    | "Uri"
    | "workspace"
    | "EventEmitter"
    | "ThemeIcon"
    | "TreeItem"
    | "TreeItemCollapsibleState"
    | "env"
  >,
): Promise<void> {
  await registerInitialCommands(context, api);
  registerArtifactNavigationViews(context, api);
  registerRunsView(context, api);
  registerCommandCatalogView(context, api);
  registerLifecycleView(context, api);
  registerRuntimesView(context, api);
}
