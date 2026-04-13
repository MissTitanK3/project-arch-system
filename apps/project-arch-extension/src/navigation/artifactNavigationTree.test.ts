import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tasks } from "project-arch";
import { createProjectArchBoundary } from "../integration/projectArchBoundary";
import type { RuntimeProfileLaunchBoundaryModel } from "../integration/runtimeProfileLaunchBoundary";
import {
  ARTIFACT_TREE_VIEW_ID,
  EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID,
  REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID,
  REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID,
  registerArtifactNavigationViews,
} from "./artifactNavigationTree";

vi.mock("project-arch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("project-arch")>();
  return {
    ...actual,
    tasks: {
      ...actual.tasks,
      taskCreateInLane: vi.fn(),
    },
  };
});

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-artifact-browser-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

describe("artifactNavigationTree (webview browser)", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const target = tempRoots.pop();
      if (!target) {
        continue;
      }
      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it("registers baseline and experimental artifact browser webviews and refresh commands", () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const registerCommand = vi.fn(
      (id: string, handler: (...args: unknown[]) => Promise<void> | void) => {
        handlers.set(id, handler);
        return { dispose: vi.fn() };
      },
    );

    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    const api = {
      window: {
        registerWebviewViewProvider,
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
      },
      commands: {
        registerCommand,
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews(context as never, api as never);

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
    expect(handlers.has(REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID)).toBe(true);
    expect(handlers.has(REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID)).toBe(true);
  });

  it("keeps baseline and experimental providers distinct while sharing model refresh behavior", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/phase-a/overview.md", "# phase");

    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    const providers = new Map<string, { resolveWebviewView: (view: unknown) => Promise<void> }>();

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((id: string, value: unknown) => {
          providers.set(id, value as { resolveWebviewView: (view: unknown) => Promise<void> });
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(
          (id: string, handler: (...args: unknown[]) => Promise<void> | void) => {
            handlers.set(id, handler);
            return { dispose: vi.fn() };
          },
        ),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    const baselineProvider = providers.get(ARTIFACT_TREE_VIEW_ID);
    const experimentalProvider = providers.get(EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID);
    if (!baselineProvider || !experimentalProvider) {
      throw new Error("Expected both baseline and experimental providers");
    }

    const baselineWebview = {
      options: {},
      html: "",
      onDidReceiveMessage: vi.fn(),
    };
    const experimentalWebview = {
      options: {},
      html: "",
      onDidReceiveMessage: vi.fn(),
    };

    await baselineProvider.resolveWebviewView({ webview: baselineWebview });
    await experimentalProvider.resolveWebviewView({ webview: experimentalWebview });

    expect(baselineWebview.html).toContain("Create Task with Slug");
    expect(baselineWebview.html).not.toContain("project-arch-experimental-artifact-browser-root");
    expect(experimentalWebview.html).toContain("project-arch-experimental-artifact-browser-root");
    expect(experimentalWebview.html).toContain("project-arch-experimental-artifact-browser-model");
    expect(experimentalWebview.html).toContain("webviews/experimental-artifact-browser/client.js");
    expect(experimentalWebview.html).toContain("Content-Security-Policy");
    expect(experimentalWebview.html).not.toContain(
      "__PROJECT_ARCH_EXPERIMENTAL_ARTIFACT_BROWSER_MODEL__",
    );
    expect(experimentalWebview.html).not.toContain("Create Task with Slug");

    await writeFile(root, "feedback/newly-added-after-resolve.md", "# new");

    const baselineRefresh = handlers.get(REFRESH_ARTIFACT_NAVIGATION_COMMAND_ID);
    const experimentalRefresh = handlers.get(REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID);
    if (!baselineRefresh || !experimentalRefresh) {
      throw new Error("Expected both refresh handlers");
    }

    await experimentalRefresh();
    expect(experimentalWebview.html).toContain("newly-added-after-resolve.md");

    await baselineRefresh();
    expect(baselineWebview.html).toContain("newly-added-after-resolve.md");
  });

  it("routes shared file action workflows through both baseline and experimental providers", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/phase-a/overview.md", "# phase");
    await writeFile(root, "feedback/phases/phase-a/delete-me.md", "# delete me");
    await writeFile(root, "feedback/to-delete/sub.md", "# delete dir");

    const providers = new Map<string, { resolveWebviewView: (view: unknown) => Promise<void> }>();
    const executeCommand = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn(async () => undefined);
    const showWarningMessage = vi.fn(async () => "Delete");

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((id: string, value: unknown) => {
          providers.set(id, value as { resolveWebviewView: (view: unknown) => Promise<void> });
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage,
        showWarningMessage,
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText,
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    const baselineProvider = providers.get(ARTIFACT_TREE_VIEW_ID);
    const experimentalProvider = providers.get(EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID);
    if (!baselineProvider || !experimentalProvider) {
      throw new Error("Expected both baseline and experimental providers");
    }

    const baselineHandlers: Array<(message: unknown) => Promise<void>> = [];
    const experimentalHandlers: Array<(message: unknown) => Promise<void>> = [];

    await baselineProvider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          baselineHandlers.push(handler);
        }),
      },
    });

    await experimentalProvider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          experimentalHandlers.push(handler);
        }),
      },
    });

    const baselineHandler = baselineHandlers[0];
    const experimentalHandler = experimentalHandlers[0];
    if (!baselineHandler || !experimentalHandler) {
      throw new Error("Expected both message handlers");
    }

    const relativePath = "feedback/phases/phase-a/overview.md";

    await baselineHandler({ type: "openEdit", relativePath });
    await baselineHandler({ type: "openPreview", relativePath });
    await baselineHandler({ type: "revealInExplorer", relativePath });
    await baselineHandler({ type: "copyPath", relativePath });
    await baselineHandler({
      type: "deleteFile",
      relativePath: "feedback/phases/phase-a/delete-me.md",
    });

    await experimentalHandler({ type: "openEdit", relativePath });
    await experimentalHandler({ type: "openPreview", relativePath });
    await experimentalHandler({ type: "revealInExplorer", relativePath });
    await experimentalHandler({ type: "copyPath", relativePath });
    await experimentalHandler({ type: "deleteDirectory", relativePath: "feedback/to-delete" });

    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      { fsPath: path.join(root, relativePath) },
      expect.objectContaining({ preview: false }),
    );
    expect(executeCommand).toHaveBeenCalledWith("markdown.showPreviewToSide", {
      fsPath: path.join(root, relativePath),
    });
    expect(executeCommand).toHaveBeenCalledWith("revealInExplorer", {
      fsPath: path.join(root, relativePath),
    });
    const executeCalls = executeCommand.mock.calls as unknown as Array<unknown[]>;
    expect(executeCalls.filter((call) => call[0] === "vscode.open")).toHaveLength(2);
    expect(executeCalls.filter((call) => call[0] === "markdown.showPreviewToSide")).toHaveLength(2);
    expect(executeCalls.filter((call) => call[0] === "revealInExplorer")).toHaveLength(2);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenCalledWith(relativePath);
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Delete file 'feedback/phases/phase-a/delete-me.md'? This action cannot be undone.",
      expect.objectContaining({ modal: true }),
      "Delete",
    );
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Delete directory 'feedback/to-delete'? This action cannot be undone.",
      expect.objectContaining({ modal: true }),
      "Delete",
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Copied path 'feedback/phases/phase-a/overview.md'.",
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Deleted file 'feedback/phases/phase-a/delete-me.md'.",
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Deleted directory 'feedback/to-delete'.",
    );
    await expect(
      fs.access(path.join(root, "feedback/phases/phase-a/delete-me.md")),
    ).rejects.toThrow();
    await expect(fs.access(path.join(root, "feedback/to-delete"))).rejects.toThrow();
  });

  it("routes shared inspector and command-staging semantics through both providers", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(root, relativePath, "# task");

    const providers = new Map<string, { resolveWebviewView: (view: unknown) => Promise<void> }>();
    const executeCommand = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn(async () => undefined);
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((id: string, value: unknown) => {
          providers.set(id, value as { resolveWebviewView: (view: unknown) => Promise<void> });
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => terminal),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    const baselineProvider = providers.get(ARTIFACT_TREE_VIEW_ID);
    const experimentalProvider = providers.get(EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID);
    if (!baselineProvider || !experimentalProvider) {
      throw new Error("Expected both baseline and experimental providers");
    }

    const baselineHandlers: Array<(message: unknown) => Promise<void>> = [];
    const experimentalHandlers: Array<(message: unknown) => Promise<void>> = [];

    await baselineProvider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        postMessage: vi.fn(async () => true),
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          baselineHandlers.push(handler);
        }),
      },
    });

    await experimentalProvider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        postMessage: vi.fn(async () => true),
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          experimentalHandlers.push(handler);
        }),
      },
    });

    const baselineHandler = baselineHandlers[0];
    const experimentalHandler = experimentalHandlers[0];
    if (!baselineHandler || !experimentalHandler) {
      throw new Error("Expected both message handlers");
    }

    await baselineHandler({
      type: "openArtifactInspector",
      relativePath,
      label: "001-task.md",
    });
    await experimentalHandler({
      type: "openArtifactInspector",
      relativePath,
      label: "001-task.md",
    });

    await baselineHandler({
      type: "runCommand",
      command: "pa agent run phase-a/m/001 --runtime <runtime> --json",
      execute: false,
      relativePath,
    });
    await experimentalHandler({
      type: "runCommand",
      command: "pa agent run phase-a/m/001 --runtime <runtime> --json",
      execute: false,
      relativePath,
    });

    const executeCalls = executeCommand.mock.calls as unknown as Array<unknown[]>;
    expect(
      executeCalls.filter(
        (call) =>
          call[0] === "projectArch.openArtifactInspector" &&
          typeof call[1] === "object" &&
          call[1] !== null &&
          (call[1] as { relativePath?: string }).relativePath === relativePath,
      ),
    ).toHaveLength(2);
    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa agent run phase-a/m/001 --runtime <runtime> --json",
      false,
    );
    expect((terminal.sendText.mock.calls as unknown as Array<unknown[]>).length).toBe(2);
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Staged 'pa agent run phase-a/m/001 --runtime <runtime> --json' in terminal. Edit placeholders, then press Enter.",
    );
  });

  it("renders the experimental client entrypoint shell and handles shared contract actions", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/phase-a/overview.md", "# phase");

    const providers = new Map<string, { resolveWebviewView: (view: unknown) => Promise<void> }>();
    const messageHandlers: Array<(message: unknown) => Promise<void>> = [];
    const writeText = vi.fn(async () => undefined);
    const executeCommand = vi.fn(async () => undefined);
    const boundary = {
      readRuntimeReadinessCheck: vi.fn(async () => ({
        profiles: [
          {
            id: "local-ready",
            readiness: "ready",
            runtime: "local",
            model: "mock-model",
          },
        ],
      })),
      invokeStageChatInference: vi.fn(
        async (input: { onPartialResponse?: (chunk: string) => void }) => {
          input.onPartialResponse?.("partial ");
          input.onPartialResponse?.("response");
          return {
            responseText: "partial response",
          };
        },
      ),
    };
    const loadRuntimeProfiles = vi.fn(
      async () =>
        ({
          options: [
            {
              id: "local-ready",
              runtime: "local",
              model: "mock-model",
              enabled: true,
              eligibility: "ready",
              inlineSummary: "Mock ready profile",
            },
          ],
          decision: {
            selectedProfileId: "local-ready",
          },
          defaultProfile: "local-ready",
        }) as RuntimeProfileLaunchBoundaryModel,
    );
    const showInformationMessage = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((id: string, value: unknown) => {
          providers.set(id, value as { resolveWebviewView: (view: unknown) => Promise<void> });
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText,
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: boundary as never,
      loadRuntimeProfiles,
    });

    const experimentalProvider = providers.get(EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID);
    if (!experimentalProvider) {
      throw new Error("Expected experimental webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
        messageHandlers.push(handler);
      }),
    };

    await experimentalProvider.resolveWebviewView({ webview });

    expect(webview.html).toContain("project-arch-experimental-artifact-browser-root");
    expect(webview.html).toContain("project-arch-experimental-artifact-browser-model");
    expect(webview.html).toContain("webviews/experimental-artifact-browser/client.js");
    expect(webview.html).toContain("schemaVersion");
    expect(webview.html).not.toContain("__PROJECT_ARCH_EXPERIMENTAL_ARTIFACT_BROWSER_MODEL__");
    expect(webview.html).toContain("feedback");
    expect(webview.html).not.toContain("Create Task with Slug");

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected experimental message handler registration");
    }

    await handler({ type: "copyPath", relativePath: "feedback/phases/phase-a/overview.md" });
    expect(writeText).toHaveBeenCalledWith("feedback/phases/phase-a/overview.md");
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Copied path 'feedback/phases/phase-a/overview.md'.",
    );

    const executeCallsBeforeUnknownMessage = executeCommand.mock.calls.length;
    await handler({
      type: "notAContractMessage",
      relativePath: "feedback/phases/phase-a/overview.md",
    });
    expect(executeCommand).toHaveBeenCalledTimes(executeCallsBeforeUnknownMessage);
  });

  it("renders roadmap and other project-arch directory roots in browser model", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/phase-a/overview.md", "# phase");
    await writeFile(root, "roadmap/phases/phase-b/overview.md", "# phase");
    await writeFile(root, "architecture/overview.md", "# architecture");
    await writeFile(root, ".project-arch/agent-runtime/runs/run-1.json", "{}");
    await writeFile(root, ".project-arch/workflows/before-coding.workflow.md", "# canonical");
    await writeFile(root, ".github/workflows/legacy-guide.md", "# legacy");

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      onDidReceiveMessage: vi.fn(),
    };

    await provider.resolveWebviewView({ webview });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(webview.html).toContain("feedback");
    expect(webview.html).toContain("roadmap");
    expect(webview.html).toContain("architecture");
    expect(webview.html).toContain(".project-arch");
    expect(webview.html).toContain(".project-arch/workflows (canonical workflow documents)");
    expect(webview.html).toContain(".github/workflows (legacy compatibility)");
    expect(webview.html).not.toContain(".github/workflows (canonical workflow documents)");
    expect(webview.html).toContain('id="context-chip"');
    expect(webview.html).toContain('id="context-chip-clear"');
    expect(webview.html).toContain('task-metadata-chip" title="');
    expect(webview.html).toContain("Created ");
    expect(webview.html).toContain("Updated ");
    expect(webview.html).toContain("Actions");
    expect(webview.html).toContain("Run pa doctor health");
    expect(webview.html).toContain("Stage pa doctor (full sweep)");
    expect(webview.html).toContain("Select a file to stage check template");
    expect(webview.html).toContain("Create Placeholder Task");
    expect(webview.html).toContain("Create Task with Slug");
  });

  it("opens files, copies path, and runs contextual commands from browser actions", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/phase-a/overview.md", "# phase");

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        command?: string;
        execute?: boolean;
      }) => Promise<void>
    > = [];
    const executeCommand = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn(async () => undefined);
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };
    const createTerminal = vi.fn(() => terminal);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal,
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText,
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              relativePath?: string;
              command?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({ type: "openEdit", relativePath: "feedback/phases/phase-a/overview.md" });
    await handler({ type: "openPreview", relativePath: "feedback/phases/phase-a/overview.md" });
    await handler({ type: "copyPath", relativePath: "feedback/phases/phase-a/overview.md" });
    await handler({ type: "runCommand", command: "pa doctor" });
    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/m/001 --runtime <runtime> --json",
      execute: false,
    });

    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      { fsPath: path.join(root, "feedback/phases/phase-a/overview.md") },
      expect.objectContaining({ preview: false }),
    );
    expect(executeCommand).toHaveBeenCalledWith("markdown.showPreviewToSide", {
      fsPath: path.join(root, "feedback/phases/phase-a/overview.md"),
    });
    expect(writeText).toHaveBeenCalledWith("feedback/phases/phase-a/overview.md");
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Copied path 'feedback/phases/phase-a/overview.md'.",
    );
    expect(createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Project Arch Actions", cwd: root }),
    );
    expect(terminal.show).toHaveBeenCalled();
    expect(terminal.sendText).toHaveBeenCalledWith("pa doctor", true);
    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa agent run phase-a/m/001 --runtime <runtime> --json",
      false,
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Staged 'pa agent run phase-a/m/001 --runtime <runtime> --json' in terminal. Edit placeholders, then press Enter.",
    );
  });

  it("autofills runtime and timeout defaults for staged agent task commands", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/phase-a/overview.md", "# phase");

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: { type?: string; command?: string; execute?: boolean }) => Promise<void>
    > = [];

    const showInformationMessage = vi.fn(async () => undefined);
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };
    const createTerminal = vi.fn(() => terminal);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal,
        showQuickPick: vi.fn(async () => undefined),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showInputBox: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "codex-implementer",
        options: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "codex-implementer",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              command?: string;
              execute?: boolean;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/m/001 --runtime <runtime> --json --timeout-ms <ms>",
      execute: false,
    });

    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa agent run phase-a/m/001 --runtime codex-cli --json --timeout-ms 30000",
      false,
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Staged 'pa agent run phase-a/m/001 --runtime codex-cli --json --timeout-ms 30000' in terminal. Edit placeholders, then press Enter.",
    );
  });

  it("includes task metadata fields in browser payload for high-level file understanding", async () => {
    const root = await createTempWorkspace();
    await writeFile(
      root,
      "feedback/phases/p/milestones/m/tasks/planned/001-task.md",
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow card summary"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "tags:",
        "  - extension",
        "  - ui",
        "dependsOn:",
        "  - 000",
        "blocks:",
        "  - 101",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: context-readiness",
        "      title: Context and Readiness",
        "      runtimePreference: local",
        "      items:",
        "        - id: review-scope",
        "          label: Review scope",
        "          status: done",
        "        - id: inspect-context",
        "          label: Inspect context",
        "          status: in_progress",
        "    - id: implementation",
        "      title: Implementation",
        "      runtimePreference: cloud",
        "      items:",
        "        - id: implement-slice",
        "          label: Implement slice",
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      onDidReceiveMessage: vi.fn(),
    };

    await provider.resolveWebviewView({ webview });

    expect(webview.html).toContain('"status":"planned"');
    expect(webview.html).toContain('"tags":["extension","ui"]');
    expect(webview.html).toContain('"dependsOn":["000"]');
    expect(webview.html).toContain('"blocks":["101"]');
    expect(webview.html).toContain(
      '"workflowSummary":{"completedChecklistItems":1,"totalChecklistItems":3',
    );
    expect(webview.html).toContain(
      '"workflowDetail":{"overallState":"in_progress","stages":[{"id":"context-readiness"',
    );
    expect(webview.html).toContain("Checklist: ");
    expect(webview.html).toContain("Stages: ");
    expect(webview.html).toContain("Workflow State: ");
    expect(webview.html).toContain("Current Stage: ");
    expect(webview.html).toContain("Open Workflow");
    expect(webview.html).toContain("Task Workflow");
    expect(webview.html).toContain("Back to Lane");
    expect(webview.html).toContain("Guided workflow detail view for the selected task.");
    expect(webview.html).toContain("Run task status");
    expect(webview.html).toContain("Run task lanes");
    expect(webview.html).toContain("Run learn on task path");
    expect(webview.html).toContain("Run check on task file");
    expect(webview.html).toContain("Launch Run");
    expect(webview.html).toContain("Run agent prepare");
    expect(webview.html).toContain("Run Now");
    expect(webview.html).toContain("Stage Template");
    expect(webview.html).toContain("Stage agent orchestrate");
    expect(webview.html).toContain("Stage agent run");
    expect(webview.html).toContain("Stage agent status");
    expect(webview.html).toContain("Stage agent validate");
    expect(webview.html).toContain("Stage agent reconcile");
    expect(webview.html).toContain("Stage result import");
    expect(webview.html).toContain("Create Discovered (from selected task)");
  });

  it("creates planned lane task from skeleton action with slug input", async () => {
    const root = await createTempWorkspace();

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        command?: string;
        phaseId?: string;
        milestoneId?: string;
        lane?: string;
        withSlug?: boolean;
      }) => Promise<void>
    > = [];

    const executeCommand = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn(async () => undefined);
    const showInputBox = vi.fn(async () => "my-new-task");
    const taskCreateInLane = vi.mocked(tasks.taskCreateInLane);
    taskCreateInLane.mockResolvedValue({
      success: true,
      data: {
        path: path.join(
          root,
          "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-my-new-task.md",
        ),
      },
    });

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInputBox,
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              relativePath?: string;
              command?: string;
              phaseId?: string;
              milestoneId?: string;
              lane?: string;
              withSlug?: boolean;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "createLaneTask",
      phaseId: "phase-a",
      milestoneId: "milestone-a",
      lane: "planned",
      withSlug: true,
    });

    expect(showInputBox).toHaveBeenCalled();
    expect(taskCreateInLane).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseId: "phase-a",
        milestoneId: "milestone-a",
        lane: "planned",
        discoveredFromTask: null,
        slugBase: "my-new-task",
        cwd: root,
      }),
    );
    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      {
        fsPath: path.join(
          root,
          "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-my-new-task.md",
        ),
      },
      expect.objectContaining({ preview: false }),
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Created task 'feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-my-new-task.md'.",
    );
  });

  it("creates discovered task from selected task card action", async () => {
    const root = await createTempWorkspace();

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        command?: string;
        phaseId?: string;
        milestoneId?: string;
        lane?: string;
        withSlug?: boolean;
        fromTaskId?: string;
      }) => Promise<void>
    > = [];

    const executeCommand = vi.fn(async () => undefined);
    const showInformationMessage = vi.fn(async () => undefined);
    const taskCreateInLane = vi.mocked(tasks.taskCreateInLane);
    taskCreateInLane.mockResolvedValue({
      success: true,
      data: {
        path: path.join(
          root,
          "feedback/phases/phase-a/milestones/milestone-a/tasks/discovered/101-follow-up.md",
        ),
      },
    });

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInputBox: vi.fn(async () => undefined),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              relativePath?: string;
              command?: string;
              phaseId?: string;
              milestoneId?: string;
              lane?: string;
              withSlug?: boolean;
              fromTaskId?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "createDiscoveredFromSelectedTask",
      phaseId: "phase-a",
      milestoneId: "milestone-a",
      fromTaskId: "001",
    });

    expect(taskCreateInLane).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseId: "phase-a",
        milestoneId: "milestone-a",
        lane: "discovered",
        discoveredFromTask: "001",
        cwd: root,
      }),
    );
    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      {
        fsPath: path.join(
          root,
          "feedback/phases/phase-a/milestones/milestone-a/tasks/discovered/101-follow-up.md",
        ),
      },
      expect.objectContaining({ preview: false }),
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Project Arch: Created discovered task 'feedback/phases/phase-a/milestones/milestone-a/tasks/discovered/101-follow-up.md' from '001'.",
    );
  });

  it("launches a task artifact with a ready runtime profile", async () => {
    const root = await createTempWorkspace();
    await writeFile(
      root,
      "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md",
      "# Task",
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<(message: { type?: string; taskRef?: string }) => Promise<void>> =
      [];

    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };
    const createTerminal = vi.fn(() => terminal);
    const showQuickPick = vi.fn(
      async (items: Array<{ label: string; option: unknown }>) => items[0],
    );
    const readRuntimeReadinessCheck = vi.fn(async () => ({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-06T17:00:00.000Z",
      profileId: "codex-implementer",
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
          enabled: true,
          default: true,
          linked: true,
          available: true,
          readiness: "ready",
          status: "ready",
          diagnostics: [],
        },
      ],
    }));

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal,
        showQuickPick,
        showInputBox: vi.fn(async () => undefined),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: {
        readRuntimeReadinessCheck,
      } as never,
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "codex-implementer",
        options: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "codex-implementer",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (handler: (message: { type?: string; taskRef?: string }) => Promise<void>) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "launchTask",
      taskRef: "phase-a/milestone-a/001",
    });

    expect(readRuntimeReadinessCheck).toHaveBeenCalledWith({
      cwd: root,
      profileId: "codex-implementer",
    });
    expect(createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Project Arch Actions", cwd: root }),
    );
    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa runtime check codex-implementer --json && pa agent run phase-a/milestone-a/001 --runtime codex-cli --json",
      true,
    );
  });

  it("offers checklist update prompts for materially advancing run commands", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow prompt mapping"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: validation",
        '      title: "Validation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: run-checks",
        '          label: "Run relevant checks"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        command?: string;
        execute?: boolean;
        relativePath?: string;
      }) => Promise<void>
    > = [];

    const showInformationMessage = vi.fn(async (_message: string, ...actions: string[]) =>
      actions.includes("Set status to 'done'") ? "Set status to 'done'" : undefined,
    );

    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => terminal),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              command?: string;
              execute?: boolean;
              relativePath?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "runCommand",
      command: `pa check --file ${relativePath}`,
      execute: true,
      relativePath,
    });

    const updated = await fs.readFile(path.join(root, relativePath), "utf8");
    expect(terminal.sendText).toHaveBeenCalledWith(`pa check --file ${relativePath}`, true);
    expect(updated).toContain("status: done");
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Set status to 'done'"),
      "Set status to 'done'",
      "Not now",
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      `Project Arch: Updated checklist item 'run-checks' to 'done' in '${relativePath}'.`,
    );
  });

  it("suppresses repeated command-driven checklist prompts for the same task transition", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow prompt suppression"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: validation",
        '      title: "Validation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: run-checks",
        '          label: "Run relevant checks"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        command?: string;
        execute?: boolean;
        relativePath?: string;
      }) => Promise<void>
    > = [];

    const showInformationMessage = vi.fn(async (_message: string, ...actions: string[]) =>
      actions.includes("Set status to 'done'") ? "Not now" : undefined,
    );

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              command?: string;
              execute?: boolean;
              relativePath?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "runCommand",
      command: `pa check --file ${relativePath}`,
      execute: true,
      relativePath,
    });

    await handler({
      type: "runCommand",
      command: `pa check --file ${relativePath}`,
      execute: true,
      relativePath,
    });

    const promptCalls = showInformationMessage.mock.calls.filter((call) =>
      (call as unknown[]).slice(1).includes("Set status to 'done'"),
    );
    const updated = await fs.readFile(path.join(root, relativePath), "utf8");
    expect(promptCalls).toHaveLength(1);
    expect(updated).toContain("status: planned");
  });

  it("does not offer checklist prompts for staged command templates", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow staged command guardrail"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: validation",
        '      title: "Validation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: run-checks",
        '          label: "Run relevant checks"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        command?: string;
        execute?: boolean;
        relativePath?: string;
      }) => Promise<void>
    > = [];

    const showInformationMessage = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              command?: string;
              execute?: boolean;
              relativePath?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "runCommand",
      command: `pa check --file ${relativePath}`,
      execute: false,
      relativePath,
    });

    const promptCalls = showInformationMessage.mock.calls.filter((call) =>
      (call as unknown[]).slice(1).includes("Set status to 'done'"),
    );
    const updated = await fs.readFile(path.join(root, relativePath), "utf8");
    expect(promptCalls).toHaveLength(0);
    expect(updated).toContain("status: planned");
  });

  it("surfaces degraded fallback suggestion and stages fallback only on explicit selection", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow degraded fallback"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: cloud",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        command?: string;
        execute?: boolean;
        relativePath?: string;
      }) => Promise<void>
    > = [];

    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };

    const showWarningMessage = vi.fn(async (_message: string, ...actions: string[]) =>
      actions.includes("Stage fallback run command") ? "Stage fallback run command" : undefined,
    );

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => terminal),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage,
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ready",
        options: [
          {
            id: "local-ready",
            runtime: "local",
            model: "gpt-5.4",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
          {
            id: "cloud-blocked",
            runtime: "cloud",
            model: "gpt-5.4",
            isDefault: false,
            enabled: true,
            readiness: "runtime-unavailable",
            status: "not-ready",
            eligibility: "blocked",
            inlineSummary: "Not ready.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ready",
          reason: "Local runtime is ready.",
          nextStep: "Launch with local runtime.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              command?: string;
              execute?: boolean;
              relativePath?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/milestone-a/001 --runtime cloud --json",
      execute: true,
      relativePath,
    });

    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa agent run phase-a/milestone-a/001 --runtime cloud --json",
      true,
    );
    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa runtime check local-ready --json && pa agent run phase-a/milestone-a/001 --runtime local --json",
      false,
    );
    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("Routing drift detected"),
      "Stage fallback run command",
      "Review fallback guidance",
      "Acknowledge drift",
      "Not now",
    );
  });

  it("does not auto-switch runtime when degraded fallback is suggested but not chosen", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow no auto fallback"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: cloud",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        command?: string;
        execute?: boolean;
        relativePath?: string;
      }) => Promise<void>
    > = [];

    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };

    const showWarningMessage = vi.fn(async (_message: string, ...actions: string[]) =>
      actions.includes("Not now") ? "Not now" : undefined,
    );

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => terminal),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage,
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ready",
        options: [
          {
            id: "local-ready",
            runtime: "local",
            model: "gpt-5.4",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
          {
            id: "cloud-blocked",
            runtime: "cloud",
            model: "gpt-5.4",
            isDefault: false,
            enabled: true,
            readiness: "runtime-unavailable",
            status: "not-ready",
            eligibility: "blocked",
            inlineSummary: "Not ready.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ready",
          reason: "Local runtime is ready.",
          nextStep: "Launch with local runtime.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              command?: string;
              execute?: boolean;
              relativePath?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/milestone-a/001 --runtime cloud --json",
      execute: true,
      relativePath,
    });

    expect(terminal.sendText).toHaveBeenCalledTimes(1);
    expect(terminal.sendText).toHaveBeenCalledWith(
      "pa agent run phase-a/milestone-a/001 --runtime cloud --json",
      true,
    );
  });

  it("validates integrated guided-task flow across lane summary detail mutation and routing states", async () => {
    const root = await createTempWorkspace();

    const compatiblePath =
      "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-compatible.md";
    const degradedPath =
      "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/002-degraded.md";
    const blockedPath =
      "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/003-blocked.md";

    await writeFile(
      root,
      compatiblePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Compatible routing task"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
        "",
        "## Workflow Checklist (Mirrored)",
        "",
        "### Implementation",
        "- [ ] Implement the task slice",
      ].join("\n"),
    );

    await writeFile(
      root,
      degradedPath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "002"',
        'title: "Degraded routing task"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: cloud",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    await writeFile(
      root,
      blockedPath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "003"',
        'title: "Blocked routing task"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: cloud",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
        "",
        "Body",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        itemId?: string;
        status?: string;
        command?: string;
        execute?: boolean;
      }) => Promise<void>
    > = [];

    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };

    const showWarningMessage = vi.fn(async (_message: string, ...actions: string[]) =>
      actions.includes("Not now") ? "Not now" : undefined,
    );

    let routingMode: "compatible" | "degraded" | "blocked" = "compatible";
    const loadRuntimeProfiles = vi.fn(async (): Promise<RuntimeProfileLaunchBoundaryModel> => {
      if (routingMode === "blocked") {
        return {
          source: {
            authority: "project-arch-cli-json",
            inventoryCommand: "pa runtime list --json",
            readinessCommand: "pa runtime check <profileId> --json",
            mode: "bounded-combination",
          },
          defaultProfile: "local-blocked",
          options: [
            {
              id: "local-blocked",
              runtime: "local",
              model: "gpt-5.4",
              isDefault: true,
              enabled: true,
              readiness: "runtime-unavailable",
              status: "not-ready",
              eligibility: "blocked",
              inlineSummary: "Not ready.",
              diagnostics: [],
            },
            {
              id: "cloud-blocked",
              runtime: "cloud",
              model: "gpt-5.4",
              isDefault: false,
              enabled: true,
              readiness: "runtime-unavailable",
              status: "not-ready",
              eligibility: "blocked",
              inlineSummary: "Not ready.",
              diagnostics: [],
            },
          ],
          decision: {
            state: "no-ready-profiles",
            reason: "No ready runtime profile available.",
            nextStep: "Fix runtime readiness.",
          },
        };
      }

      return {
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ready",
        options: [
          {
            id: "local-ready",
            runtime: "local",
            model: "gpt-5.4",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
          {
            id: "cloud-blocked",
            runtime: "cloud",
            model: "gpt-5.4",
            isDefault: false,
            enabled: true,
            readiness: "runtime-unavailable",
            status: "not-ready",
            eligibility: "blocked",
            inlineSummary: "Not ready.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ready",
          reason: "Local runtime is ready.",
          nextStep: "Launch with local runtime.",
        },
      };
    });

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => terminal),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage,
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      loadRuntimeProfiles,
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            itemId?: string;
            status?: string;
            command?: string;
            execute?: boolean;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });
    expect(webview.html).toContain("Checklist:");
    expect(webview.html).toContain("Open Workflow");
    expect(webview.html).toContain("Task Workflow");
    expect(webview.html).toContain("Back to Lane");

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "updateWorkflowChecklistItem",
      relativePath: compatiblePath,
      stageId: "implementation",
      itemId: "implement-slice",
      status: "done",
    });

    const mutated = await fs.readFile(path.join(root, compatiblePath), "utf8");
    expect(mutated).toContain("status: done");
    expect(mutated).toContain("- [x] Implement the task slice");

    routingMode = "compatible";
    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/milestone-a/001 --runtime local --json",
      execute: true,
      relativePath: compatiblePath,
    });

    routingMode = "degraded";
    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/milestone-a/002 --runtime cloud --json",
      execute: true,
      relativePath: degradedPath,
    });

    routingMode = "blocked";
    await handler({
      type: "runCommand",
      command: "pa agent run phase-a/milestone-a/003 --runtime cloud --json",
      execute: true,
      relativePath: blockedPath,
    });

    const driftWarningCalls = showWarningMessage.mock.calls.filter((call) =>
      String(call[0]).includes("Routing drift detected"),
    );

    expect(driftWarningCalls).toHaveLength(2);
    expect(String(driftWarningCalls[0]?.[0])).toContain("002-degraded.md");
    expect(String(driftWarningCalls[1]?.[0])).toContain("003-blocked.md");
    expect(driftWarningCalls[0]).toContain("Review fallback guidance");
    expect(driftWarningCalls[1]).not.toContain("Review fallback guidance");
  });

  it("persists checklist status updates to workflow frontmatter and mirrored checklist", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow mutation"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: context-readiness",
        '      title: "Context and Readiness"',
        "      runtimePreference: local",
        "      items:",
        "        - id: review-scope",
        '          label: "Review scope"',
        "          status: planned",
        "---",
        "",
        "## Workflow Checklist (Mirrored)",
        "",
        "### Context and Readiness",
        "- [ ] Review scope",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        itemId?: string;
        status?: string;
      }) => Promise<void>
    > = [];

    const showInformationMessage = vi.fn(async () => undefined);
    const showWarningMessage = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage,
        showWarningMessage,
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              relativePath?: string;
              stageId?: string;
              itemId?: string;
              status?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "updateWorkflowChecklistItem",
      relativePath,
      stageId: "context-readiness",
      itemId: "review-scope",
      status: "done",
    });

    const updated = await fs.readFile(path.join(root, relativePath), "utf8");
    expect(updated).toContain("status: done");
    expect(updated).toContain("## Workflow Checklist (Mirrored)");
    expect(updated).toContain("- [x] Review scope");
    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      `Project Arch: Updated checklist item 'review-scope' to 'done' in '${relativePath}'.`,
    );
  });

  it("renders stage-chat actions in task workflow and dispatches stage-chat commands", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Task workflow staged command guardrail"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
        "",
        "## Workflow Checklist (Mirrored)",
        "",
        "### Implementation",
        "- [ ] Implement the task slice",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        command?: string;
        stageId?: string;
        stageTitle?: string;
        action?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const executeCommand = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            command?: string;
            stageId?: string;
            stageTitle?: string;
            action?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });

    expect(webview.html).toContain("Open Stage Chat");
    expect(webview.html).toContain("Resume Stage Chat");
    expect(webview.html).toContain("Reset Stage Chat");
    expect(webview.html).toContain("Discard Stage Chat");
    expect(webview.html).toContain("Return to workflow");
    expect(webview.html).toContain("Transcript");
    expect(webview.html).toContain("Message");
    expect(webview.html).toContain("data-stage-chat-input");
    expect(webview.html).toContain("data-stage-chat-send");

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatCommand",
      relativePath,
      command: "projectArch.openStageChat",
      stageId: "implementation",
      stageTitle: "Implementation",
      action: "open",
    });

    expect(executeCommand).toHaveBeenCalledWith(
      "projectArch.openStageChat",
      expect.objectContaining({
        relativePath,
        stageId: "implementation",
        stageTitle: "Implementation",
        action: "open",
        source: expect.stringMatching(/^projectArch\.artifacts(?:\.experimental)?$/),
      }),
    );

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Can you help plan this stage?",
    });

    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" && payload?.["runtimeState"] === "sending",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" && payload?.["role"] === "assistant",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" &&
          (payload?.["runtimeState"] === "success" || payload?.["runtimeState"] === "error"),
      ),
    ).toBe(true);
  });

  it("surfaces runtime readiness guidance and retry metadata when no ready default runtime exists", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Runtime readiness guidance"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        stageTitle?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            stageTitle?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-blocked",
        options: [
          {
            id: "local-blocked",
            runtime: "local",
            model: "nemotron-cascade-2",
            isDefault: true,
            enabled: true,
            readiness: "runtime-unavailable",
            status: "not-ready",
            eligibility: "blocked",
            inlineSummary: "Not ready.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "no-ready-profiles",
          reason: "No ready runtime profile available.",
          nextStep: "Fix runtime readiness.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({ webview });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Can we continue?",
    });

    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" && payload?.["runtimeState"] === "error",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" &&
          payload?.["canRetry"] === true &&
          payload?.["failedMessage"] === "Can we continue?",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" &&
          String(payload?.["content"] || "").includes("No ready default runtime profile"),
      ),
    ).toBe(true);
  });

  it("routes stage-chat send through live runtime boundary inference", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Live runtime boundary"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        stageTitle?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const cliExecutor = vi.fn(async () => ({
      stdout: JSON.stringify({
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-06T00:00:00.000Z",
        profileId: "local-ollama",
        profiles: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        message: {
          content: "  Live response from Ollama runtime.  ",
        },
      }),
    }));

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: createProjectArchBoundary({
        cliExecutor,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ollama",
        options: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ollama",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            stageTitle?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Give concrete next implementation steps.",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" &&
          payload?.["content"] === "Live response from Ollama runtime.",
      ),
    ).toBe(true);
  });

  it("streams incremental assistant chunks into stage-chat transcript updates", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Live runtime streaming"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        stageTitle?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const cliExecutor = vi.fn(async () => ({
      stdout: JSON.stringify({
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-06T00:00:00.000Z",
        profileId: "local-ollama",
        profiles: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }));

    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(JSON.stringify({ message: { content: "Live " }, done: false }) + "\n"),
      encoder.encode(
        JSON.stringify({ message: { content: "response from Ollama runtime." }, done: true }) +
          "\n",
      ),
    ];
    let index = 0;
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      body: {
        getReader: () => ({
          read: async () => {
            if (index >= chunks.length) {
              return { value: undefined, done: true };
            }

            const value = chunks[index];
            index += 1;
            return { value, done: false };
          },
        }),
      },
    }));

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: createProjectArchBoundary({
        cliExecutor,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ollama",
        options: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ollama",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            stageTitle?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Give concrete next implementation steps.",
    });

    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);

    const streamedChunks = postedMessages.filter(
      (payload) =>
        payload?.["type"] === "stageChatRuntimeResponse" &&
        payload?.["append"] === true &&
        payload?.["role"] === "assistant",
    );

    expect(streamedChunks.length).toBeGreaterThan(0);
    expect(streamedChunks.map((payload) => String(payload?.["content"] || "")).join("")).toContain(
      "Live response from Ollama runtime.",
    );
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" && payload?.["runtimeState"] === "success",
      ),
    ).toBe(true);
  });

  it("surfaces actionable guidance when live runtime returns malformed/empty output", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Malformed runtime output"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        stageTitle?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const cliExecutor = vi.fn(async () => ({
      stdout: JSON.stringify({
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-06T00:00:00.000Z",
        profileId: "local-ollama",
        profiles: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
    }));

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: createProjectArchBoundary({
        cliExecutor,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ollama",
        options: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ollama",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            stageTitle?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Give concrete next implementation steps.",
    });

    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" &&
          String(payload?.["content"] || "").includes("invalid or empty Ollama response"),
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" &&
          payload?.["runtimeState"] === "error" &&
          String(payload?.["statusMessage"] || "").includes("Runtime returned invalid output"),
      ),
    ).toBe(true);
  });

  it("surfaces actionable timeout guidance for live inference failures", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Timeout runtime output"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        stageTitle?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const cliExecutor = vi.fn(async () => ({
      stdout: JSON.stringify({
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-06T00:00:00.000Z",
        profileId: "local-ollama",
        profiles: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }));
    const abortError = Object.assign(new Error("Request aborted"), {
      name: "AbortError",
    });
    const fetchImpl = vi.fn(async () => {
      throw abortError;
    });

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: createProjectArchBoundary({
        cliExecutor,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ollama",
        options: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ollama",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            stageTitle?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Give concrete next implementation steps.",
    });

    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" &&
          String(payload?.["content"] || "").includes("runtime timed out"),
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" &&
          payload?.["runtimeState"] === "error" &&
          payload?.["canRetry"] === true &&
          payload?.["failedMessage"] === "Give concrete next implementation steps." &&
          String(payload?.["statusMessage"] || "").includes("timed out"),
      ),
    ).toBe(true);
  });

  it("keeps runtime-state transitions coherent across failure then retry success", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "001"',
        'title: "Retry transitions"',
        "lane: planned",
        "status: planned",
        "taskType: implementation",
        "workflow:",
        '  schemaVersion: "2.0"',
        "  template: default-implementation",
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: implement-slice",
        '          label: "Implement the task slice"',
        "          status: planned",
        "---",
      ].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        stageTitle?: string;
        messageText?: string;
      }) => Promise<void>
    > = [];

    const cliExecutor = vi.fn(async () => ({
      stdout: JSON.stringify({
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-06T00:00:00.000Z",
        profileId: "local-ollama",
        profiles: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }));
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          message: {
            content: "Recovered response.",
          },
        }),
      });

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never, {
      boundary: createProjectArchBoundary({
        cliExecutor,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "local-ollama",
        options: [
          {
            id: "local-ollama",
            runtime: "local",
            model: "llama3.1",
            isDefault: true,
            enabled: true,
            readiness: "ready",
            status: "ready",
            eligibility: "ready",
            inlineSummary: "Ready to launch.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "selected-default-ready",
          selectedProfileId: "local-ollama",
          reason: "Default runtime profile is ready.",
          nextStep: "Launch with the default profile or choose another ready profile.",
        },
      }),
    });

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    const webview = {
      options: {},
      html: "",
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn(
        (
          handler: (message: {
            type?: string;
            relativePath?: string;
            stageId?: string;
            stageTitle?: string;
            messageText?: string;
          }) => Promise<void>,
        ) => {
          messageHandlers.push(handler);
        },
      ),
    };

    await provider.resolveWebviewView({ webview });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Retry me please.",
    });
    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Retry me please.",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);
    const runtimeStateSequence = postedMessages
      .filter((payload) => payload?.["type"] === "stageChatRuntimeState")
      .map((payload) => String(payload?.["runtimeState"] || ""));

    expect(runtimeStateSequence.filter((state) => state === "sending").length).toBeGreaterThan(1);
    expect(runtimeStateSequence).toContain("error");
    expect(runtimeStateSequence).toContain("success");
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" &&
          payload?.["runtimeState"] === "error" &&
          payload?.["canRetry"] === true &&
          payload?.["failedMessage"] === "Retry me please.",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" &&
          payload?.["content"] === "Recovered response.",
      ),
    ).toBe(true);
  });

  it("warns when checklist mutation cannot write malformed frontmatter artifacts", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(
      root,
      relativePath,
      ["# Task without frontmatter fences", "", "## Scope", "- Review scope"].join("\n"),
    );

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const messageHandlers: Array<
      (message: {
        type?: string;
        relativePath?: string;
        stageId?: string;
        itemId?: string;
        status?: string;
      }) => Promise<void>
    > = [];

    const showInformationMessage = vi.fn(async () => undefined);
    const showWarningMessage = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({
          show: vi.fn(),
          sendText: vi.fn(),
        })),
        showInformationMessage,
        showWarningMessage,
        showQuickPick: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: root } }],
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      env: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
    };

    registerArtifactNavigationViews({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider to be registered");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (
            handler: (message: {
              type?: string;
              relativePath?: string;
              stageId?: string;
              itemId?: string;
              status?: string;
            }) => Promise<void>,
          ) => {
            messageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = messageHandlers[0];
    if (!handler) {
      throw new Error("Expected message handler registration");
    }

    await handler({
      type: "updateWorkflowChecklistItem",
      relativePath,
      stageId: "context-readiness",
      itemId: "review-scope",
      status: "done",
    });

    expect(showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("Updated checklist item"),
    );
    expect(showWarningMessage).toHaveBeenCalledTimes(1);
    const warningCalls = showWarningMessage.mock.calls as Array<unknown[]>;
    expect(String(warningCalls[0]?.[0] ?? "")).toMatch(
      /malformed frontmatter fences|Could not locate workflow item/,
    );
  });
});
