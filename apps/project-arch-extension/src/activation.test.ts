import { beforeEach, describe, expect, it, vi } from "vitest";
import { runLocalTaskWorkflow } from "./workflows/localTaskWorkflow";
import * as localDiffReview from "./review/localDiffReview";
import {
  activateExtension,
  EXPLAIN_TASK_COMMAND_ID,
  GENERATE_PLAN_COMMAND_ID,
  INITIAL_COMMAND_ID,
  LOCAL_WORKFLOW_STATE_KEY,
  REVIEW_LOCAL_RESULT_COMMAND_ID,
  VIEW_LOCAL_WORKFLOW_STATUS_COMMAND_ID,
  promptForTaskRef,
  registerInitialCommands,
  runDiffFirstReview,
  runTaskAction,
} from "./activation";
import {
  ARTIFACT_TREE_VIEW_ID,
  EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID,
  REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID,
  REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID,
} from "./navigation/artifactNavigationBrowser";
import {
  COMMAND_CATALOG_VIEW_ID,
  REFRESH_COMMAND_CATALOG_COMMAND_ID,
} from "./navigation/commandCatalogView";
import { OPEN_ARTIFACT_INSPECTOR_COMMAND_ID } from "./navigation/artifactInspectorPanel";
import { LIFECYCLE_VIEW_ID, REFRESH_LIFECYCLE_COMMAND_ID } from "./navigation/lifecycleView";
import { REFRESH_RUNTIMES_COMMAND_ID, RUNTIMES_VIEW_ID } from "./navigation/runtimesView";
import {
  DISCARD_STAGE_CHAT_COMMAND_ID,
  OPEN_STAGE_CHAT_COMMAND_ID,
  RESET_STAGE_CHAT_COMMAND_ID,
  RETURN_TO_WORKFLOW_VIEW_COMMAND_ID,
} from "./navigation/stageChatWorkflowView";
import { REFRESH_RUNS_COMMAND_ID, RUNS_VIEW_ID } from "./navigation/runsView";

vi.mock("./workflows/localTaskWorkflow", async () => {
  const actual = await vi.importActual<typeof import("./workflows/localTaskWorkflow")>(
    "./workflows/localTaskWorkflow",
  );

  return {
    ...actual,
    runLocalTaskWorkflow: vi.fn(),
  };
});

const runLocalTaskWorkflowMock = vi.mocked(runLocalTaskWorkflow);

function createMockApi() {
  const handlers = new Map<string, () => Promise<void> | void>();

  class MockThemeIcon {
    public constructor(public readonly id: string) {}
  }

  class MockTreeItem {
    public description?: string;
    public resourceUri?: { fsPath: string };
    public iconPath?: MockThemeIcon;
    public tooltip?: string;
    public contextValue?: string;
    public command?: { command: string; title: string; arguments?: unknown[] };

    public constructor(
      public readonly label: string,
      public readonly collapsibleState: number,
    ) {}
  }

  class MockEventEmitter<T> {
    public readonly event = vi.fn();
    public readonly fire = vi.fn((value?: T) => value);
    public readonly dispose = vi.fn();
  }

  const registerCommand = vi.fn((commandId: string, handler: () => Promise<void> | void) => {
    handlers.set(commandId, handler);
    return {
      dispose: vi.fn(),
    };
  });

  const showInformationMessage = vi.fn(async (message: string) => {
    void message;
    return undefined;
  });
  const showErrorMessage = vi.fn(async (message: string) => {
    void message;
    return undefined;
  });
  const showInputBox = vi.fn(
    async (options: { validateInput?: (value: string) => string | undefined }) => {
      void options;
      return "001";
    },
  );
  const registerTreeDataProvider = vi.fn((viewId: string) => {
    void viewId;
    return {
      dispose: vi.fn(),
    };
  });
  const registerWebviewViewProvider = vi.fn((viewId: string) => {
    void viewId;
    return {
      dispose: vi.fn(),
    };
  });
  const workspaceState = {
    get: vi.fn(),
    update: vi.fn(async (key: string, value: unknown) => {
      void key;
      void value;
      return undefined;
    }),
  };

  return {
    api: {
      EventEmitter: MockEventEmitter,
      ThemeIcon: MockThemeIcon,
      TreeItem: MockTreeItem,
      TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
      },
      commands: {
        registerCommand,
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
      },
      window: {
        registerTreeDataProvider,
        registerWebviewViewProvider,
        showInformationMessage,
        showErrorMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showInputBox,
        terminals: [],
        createTerminal: vi.fn(),
        showQuickPick: vi.fn(),
      },
    },
    context: {
      subscriptions: [],
      workspaceState,
    },
    handlers,
    registerCommand,
    registerTreeDataProvider,
    registerWebviewViewProvider,
    showInformationMessage,
    showErrorMessage,
    showInputBox,
    workspaceState,
  };
}

describe("activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers explicit task-action commands", async () => {
    const { api, handlers, context, registerTreeDataProvider, registerWebviewViewProvider } =
      createMockApi();

    await registerInitialCommands(context as never, api as never);

    expect(handlers.has(INITIAL_COMMAND_ID)).toBe(true);
    expect(handlers.has(GENERATE_PLAN_COMMAND_ID)).toBe(true);
    expect(handlers.has(EXPLAIN_TASK_COMMAND_ID)).toBe(true);
    expect(handlers.has(REVIEW_LOCAL_RESULT_COMMAND_ID)).toBe(true);
    expect(handlers.has(VIEW_LOCAL_WORKFLOW_STATUS_COMMAND_ID)).toBe(true);
    expect(handlers.has(OPEN_STAGE_CHAT_COMMAND_ID)).toBe(true);
    expect(handlers.has(RESET_STAGE_CHAT_COMMAND_ID)).toBe(true);
    expect(handlers.has(DISCARD_STAGE_CHAT_COMMAND_ID)).toBe(true);
    expect(handlers.has(RETURN_TO_WORKFLOW_VIEW_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID)).toBe(false);
    expect(registerTreeDataProvider).not.toHaveBeenCalled();
    expect(registerWebviewViewProvider).not.toHaveBeenCalled();
    expect(context.subscriptions).toHaveLength(9);
  });

  it("registers artifact navigation tree view and refresh command", async () => {
    const { api, handlers, context, registerWebviewViewProvider } = createMockApi();

    await activateExtension(context as never, api as never);

    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      ARTIFACT_TREE_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(
      registerWebviewViewProvider.mock.calls.filter((call) => call[0] === ARTIFACT_TREE_VIEW_ID),
    ).toHaveLength(1);
    expect(
      registerWebviewViewProvider.mock.calls.filter(
        (call) => call[0] === EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID,
      ),
    ).toHaveLength(1);
    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      RUNS_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      COMMAND_CATALOG_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      LIFECYCLE_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      RUNTIMES_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(handlers.has(REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_RUNS_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_COMMAND_CATALOG_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_LIFECYCLE_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_RUNTIMES_COMMAND_ID)).toBe(true);
  });

  it("prompts for a strict 3-digit task ref", async () => {
    const { api, showInputBox } = createMockApi();

    const taskRef = await promptForTaskRef(api as never);

    expect(taskRef).toBe("001");
    const options = showInputBox.mock.calls[0]?.[0];
    if (!options || !options.validateInput) {
      throw new Error("Expected prompt options with validateInput");
    }
    expect(options.validateInput("12")).toContain("3 digits");
    expect(options.validateInput("001")).toBeUndefined();
  });

  it("runs task action with explicit control-plane boundary messaging", async () => {
    const { api, context, showInformationMessage, showInputBox, workspaceState } = createMockApi();

    showInputBox.mockResolvedValueOnce("001");
    showInputBox.mockResolvedValueOnce("./bundle.json");
    runLocalTaskWorkflowMock.mockResolvedValueOnce({
      action: "implement",
      taskRef: "001",
      transport: "cli-json",
      runId: "run-2026-04-02-120500",
      startedAt: "2026-04-02T12:05:00.000Z",
      completedAt: "2026-04-02T12:06:00.000Z",
      prepare: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-120000",
        taskRef: "001",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
      },
      imported: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-120500",
        taskRef: "001",
        status: "imported",
        resultPath: ".project-arch/agent-runtime/results/run-2026-04-02-120500.json",
      },
      validated: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-120500",
        taskRef: "001",
        status: "validation-passed",
        ok: true,
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
      },
      reconciled: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-120500",
        taskRef: "001",
        status: "reconciled",
        reportPath: ".project-arch/reconcile/001-2026-04-02.json",
        reportMarkdownPath: ".project-arch/reconcile/001-2026-04-02.md",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
        escalationDraftPaths: [],
      },
      artifacts: {
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
        resultPath: ".project-arch/agent-runtime/results/run-2026-04-02-120500.json",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
        reportPath: ".project-arch/reconcile/001-2026-04-02.json",
        reportMarkdownPath: ".project-arch/reconcile/001-2026-04-02.md",
      },
    });

    await runTaskAction("implement", context as never, api as never);

    const message = String(showInformationMessage.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("Implement Task completed");
    expect(message).toContain("001");
    expect(message).toContain("cli-json");
    expect(workspaceState.update).toHaveBeenCalledWith(
      LOCAL_WORKFLOW_STATE_KEY,
      expect.objectContaining({ runId: "run-2026-04-02-120500" }),
    );
  });

  it("shows a task-action error when orchestration fails", async () => {
    const { api, context, showErrorMessage, showInputBox } = createMockApi();

    showInputBox.mockResolvedValueOnce("001");
    showInputBox.mockResolvedValueOnce("./bundle.json");
    runLocalTaskWorkflowMock.mockRejectedValueOnce(new Error("Project Arch CLI command failed."));

    await runTaskAction("implement", context as never, api as never);

    expect(String(showErrorMessage.mock.calls[0]?.[0] ?? "")).toContain("Implement Task failed");
  });

  it("opens canonical run and reconcile artifacts via inspector from diff-first review actions", async () => {
    const { api, context } = createMockApi();
    context.workspaceState.get.mockReturnValue({
      action: "implement",
      taskRef: "001",
      runId: "run-2026-04-02-120500",
    });

    vi.spyOn(localDiffReview, "buildDiffFirstReviewModel").mockResolvedValue({
      taskRef: "001",
      runId: "run-2026-04-02-120500",
      changedFiles: ["apps/project-arch-extension/src/activation.ts"],
      reportMarkdownPath: ".project-arch/reconcile/001-2026-04-02.md",
      runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
    } as never);

    api.window.showInformationMessage = vi
      .fn()
      .mockResolvedValueOnce("Open Reconcile Report")
      .mockResolvedValueOnce("Open Run Record");

    await runDiffFirstReview(context as never, api as never);
    await runDiffFirstReview(context as never, api as never);

    expect(api.commands.executeCommand).toHaveBeenCalledWith(
      OPEN_ARTIFACT_INSPECTOR_COMMAND_ID,
      expect.objectContaining({
        kind: "diff",
        relativePath: ".project-arch/reconcile/001-2026-04-02.md",
      }),
    );
    expect(api.commands.executeCommand).toHaveBeenCalledWith(
      OPEN_ARTIFACT_INSPECTOR_COMMAND_ID,
      expect.objectContaining({
        kind: "run",
        relativePath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
      }),
    );
  });
});
