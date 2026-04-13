import { describe, expect, it, vi } from "vitest";
import {
  buildCommandCatalogModel,
  COMMAND_CATALOG_VIEW_ID,
  REFRESH_COMMAND_CATALOG_COMMAND_ID,
  STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID,
  STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID,
  registerCommandCatalogView,
} from "./commandCatalogView";

describe("commandCatalogView", () => {
  it("builds command catalog groups and flag details from canonical pa help commands output", async () => {
    const model = await buildCommandCatalogModel({
      cliExecutor: vi.fn(async () => ({
        stdout: [
          "Task Management:",
          "  pa task new <phase> <milestone>      Create planned task",
          "Agent Runtime MVP (shipped):",
          "  pa agent prepare <taskRef> [--json] [--prompt-only] [--check]",
          "                                       Prepare one run-scoped contract/prompt bundle",
          "    --json: Emits SDK operation envelope",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      })),
      now: () => "2026-04-02T00:00:00.000Z",
    });

    expect(model.source).toBe("pa-help-commands");
    expect(model.generatedAt).toBe("2026-04-02T00:00:00.000Z");

    const extensionEntry = model.groups
      .flatMap((group) => group.entries)
      .find((entry) => entry.command.startsWith("pa agent prepare"));

    expect(extensionEntry).toBeDefined();
    expect(extensionEntry?.details.some((detail) => detail.label === "<taskRef>")).toBe(true);
    expect(extensionEntry?.details.some((detail) => detail.label === "--json")).toBe(true);
  });

  it("registers command catalog webview and related commands", () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();

    const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => void) => {
      handlers.set(id, handler);
      return { dispose: vi.fn() };
    });

    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    const api = {
      window: {
        registerWebviewViewProvider,
        terminals: [],
        createTerminal: vi.fn(),
        showQuickPick: vi.fn(),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
      },
      commands: {
        registerCommand,
        executeCommand: vi.fn(async () => undefined),
      },
    };

    registerCommandCatalogView(context as never, api as never);

    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      COMMAND_CATALOG_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(handlers.has(REFRESH_COMMAND_CATALOG_COMMAND_ID)).toBe(true);
    expect(handlers.has(STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID)).toBe(true);
    expect(handlers.has(STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID)).toBe(true);
  });

  it("stages a selected command into an existing terminal without executing", async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();

    const firstTerminal = {
      name: "Terminal A",
      sendText: vi.fn(),
      show: vi.fn(),
    };
    const secondTerminal = {
      name: "Terminal B",
      sendText: vi.fn(),
      show: vi.fn(),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
        terminals: [firstTerminal, secondTerminal],
        createTerminal: vi.fn(),
        showQuickPick: vi.fn(async () => ({ label: "Terminal B", terminal: secondTerminal })),
        showWarningMessage: vi.fn(async () => undefined),
        showInformationMessage: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
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
    };

    registerCommandCatalogView({ subscriptions: [] } as never, api as never);

    const stage = handlers.get(STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID);
    if (!stage) {
      throw new Error("Expected stage-in-existing-terminal command to be registered");
    }

    await stage("pa agent prepare <taskRef> [--json]");

    expect(secondTerminal.show).toHaveBeenCalled();
    expect(secondTerminal.sendText).toHaveBeenCalledWith(
      "pa agent prepare <taskRef> [--json]",
      false,
    );
  });

  it("stages a selected command into a new terminal without executing", async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();

    const createdTerminal = {
      name: "Project Arch CLI",
      sendText: vi.fn(),
      show: vi.fn(),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
        terminals: [],
        createTerminal: vi.fn(() => createdTerminal),
        showQuickPick: vi.fn(),
        showWarningMessage: vi.fn(async () => undefined),
        showInformationMessage: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
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
    };

    registerCommandCatalogView({ subscriptions: [] } as never, api as never);

    const stage = handlers.get(STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID);
    if (!stage) {
      throw new Error("Expected stage-in-new-terminal command to be registered");
    }

    await stage({
      nodeType: "entry",
      entry: {
        command: "pa task new <phase> <milestone>",
        description: "Create planned task",
        details: [],
        section: "Task Management",
        surfacedInExtension: false,
      },
    });

    expect(api.window.createTerminal).toHaveBeenCalledWith("Project Arch CLI");
    expect(createdTerminal.show).toHaveBeenCalled();
    expect(createdTerminal.sendText).toHaveBeenCalledWith("pa task new <phase> <milestone>", false);
  });

  it("routes webview card button clicks to staging commands", async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;

    const executeCommand = vi.fn(async () => undefined);
    const onDidReceiveMessageHandlers: Array<
      (message: { action?: string; command?: string }) => void
    > = [];

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        terminals: [],
        createTerminal: vi.fn(),
        showQuickPick: vi.fn(),
        showWarningMessage: vi.fn(async () => undefined),
        showInformationMessage: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
      },
      commands: {
        registerCommand: vi.fn(
          (id: string, handler: (...args: unknown[]) => Promise<void> | void) => {
            handlers.set(id, handler);
            return { dispose: vi.fn() };
          },
        ),
        executeCommand,
      },
    };

    registerCommandCatalogView({ subscriptions: [] } as never, api as never);

    if (!provider) {
      throw new Error("Expected webview provider registration");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn(
          (handler: (message: { action?: string; command?: string }) => void) => {
            onDidReceiveMessageHandlers.push(handler);
          },
        ),
      },
    });

    const handler = onDidReceiveMessageHandlers[0];
    if (!handler) {
      throw new Error("Expected webview message handler");
    }

    handler({ action: "new", command: "pa context --json" });
    expect(executeCommand).toHaveBeenCalledWith(
      STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID,
      "pa context --json",
    );
  });
});
