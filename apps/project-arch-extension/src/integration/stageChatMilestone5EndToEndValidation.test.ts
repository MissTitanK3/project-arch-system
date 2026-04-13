import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerArtifactNavigationViews } from "../navigation/artifactNavigationTree";

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-stage-chat-m5-e2e-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

function createTaskContent(): string {
  return [
    "---",
    'schemaVersion: "2.0"',
    'id: "001"',
    'title: "Milestone 5 E2E"',
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
  ].join("\n");
}

describe("stageChatMilestone5EndToEndValidation", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const target = tempRoots.pop();
      if (!target) {
        continue;
      }
      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it("covers open->send->assistant-response with default-ready runtime routing", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(root, relativePath, createTaskContent());

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const handlers: Array<
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
          handlers.push(handler);
        },
      ),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn() })),
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
      throw new Error("Expected webview provider registration");
    }

    await provider.resolveWebviewView({ webview });

    const handler = handlers[0];
    if (!handler) {
      throw new Error("Expected webview message handler");
    }

    await handler({
      type: "stageChatCommand",
      relativePath,
      command: "projectArch.openStageChat",
      stageId: "implementation",
      stageTitle: "Implementation",
      action: "open",
    });

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Please summarize next implementation steps.",
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

  it("covers readiness failure with retry metadata for the same stage-chat thread", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(root, relativePath, createTaskContent());

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const handlers: Array<
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
          handlers.push(handler);
        },
      ),
    };

    const api = {
      window: {
        registerWebviewViewProvider: vi.fn((_id: string, value: unknown) => {
          provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
          return { dispose: vi.fn() };
        }),
        createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn() })),
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
      throw new Error("Expected webview provider registration");
    }

    await provider.resolveWebviewView({ webview });

    const handler = handlers[0];
    if (!handler) {
      throw new Error("Expected webview message handler");
    }

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Retry this once runtime is ready.",
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
          payload?.["failedMessage"] === "Retry this once runtime is ready.",
      ),
    ).toBe(true);
  });
});
