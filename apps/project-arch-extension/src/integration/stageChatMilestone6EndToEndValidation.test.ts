import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectArchBoundary } from "./projectArchBoundary";
import {
  EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY,
  type RuntimeProfileLaunchBoundaryModel,
} from "./runtimeProfileLaunchBoundary";
import { registerArtifactNavigationViews } from "../navigation/artifactNavigationTree";

const tempRoots: string[] = [];

type StageChatMessage = {
  type?: string;
  relativePath?: string;
  command?: string;
  stageId?: string;
  stageTitle?: string;
  action?: string;
  messageText?: string;
};

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-stage-chat-m6-e2e-"));
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
    'title: "Milestone 6 E2E"',
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
  ].join("\n");
}

function createWebview(handlers: Array<(message: StageChatMessage) => Promise<void>>) {
  return {
    options: {},
    html: "",
    postMessage: vi.fn(async () => true),
    onDidReceiveMessage: vi.fn((handler: (message: StageChatMessage) => Promise<void>) => {
      handlers.push(handler);
    }),
  };
}

function createReadyProfiles(): RuntimeProfileLaunchBoundaryModel {
  return {
    source: EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY,
    defaultProfile: "local-ollama",
    options: [
      {
        id: "local-ollama",
        runtime: "ollama" as const,
        model: "llama3.1",
        isDefault: true,
        enabled: true,
        readiness: "ready" as const,
        status: "ready" as const,
        eligibility: "ready" as const,
        inlineSummary: "Ready to launch.",
        diagnostics: [],
      },
    ],
    decision: {
      state: "selected-default-ready" as const,
      selectedProfileId: "local-ollama",
      reason: "Default runtime profile is ready.",
      nextStep: "Launch with the default profile or choose another ready profile.",
    },
  };
}

function createBlockedProfiles(): RuntimeProfileLaunchBoundaryModel {
  return {
    source: EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY,
    defaultProfile: "local-ollama",
    options: [
      {
        id: "local-ollama",
        runtime: "ollama" as const,
        model: "llama3.1",
        isDefault: true,
        enabled: true,
        readiness: "runtime-unavailable" as const,
        status: "not-ready" as const,
        eligibility: "blocked" as const,
        inlineSummary: "Not ready.",
        diagnostics: [],
      },
    ],
    decision: {
      state: "no-ready-profiles" as const,
      reason: "No ready runtime profile available.",
      nextStep: "Fix runtime readiness.",
    },
  };
}

function createReadyCliExecutor() {
  return vi.fn(async () => ({
    stdout: JSON.stringify({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-06T00:00:00.000Z",
      profileId: "local-ollama",
      profiles: [
        {
          id: "local-ollama",
          runtime: "ollama",
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
}

describe("stageChatMilestone6EndToEndValidation", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const target = tempRoots.pop();
      if (!target) {
        continue;
      }
      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it("covers end-to-end live open->send->receive flow through Ollama mapping path", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(root, relativePath, createTaskContent());

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const handlers: Array<(message: StageChatMessage) => Promise<void>> = [];

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        message: {
          content: "Live Ollama response for milestone-6 e2e.",
        },
      }),
    }));

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
      boundary: createProjectArchBoundary({
        cliExecutor: createReadyCliExecutor(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => createReadyProfiles(),
    });

    if (!provider) {
      throw new Error("Expected webview provider registration");
    }

    const webview = createWebview(handlers);
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

    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
          payload?.["type"] === "stageChatRuntimeResponse" &&
          payload?.["role"] === "assistant" &&
          payload?.["content"] === "Live Ollama response for milestone-6 e2e.",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" && payload?.["runtimeState"] === "success",
      ),
    ).toBe(true);
  });

  it("covers readiness failure and live retry recovery path", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(root, relativePath, createTaskContent());

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const handlers: Array<(message: StageChatMessage) => Promise<void>> = [];

    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          message: {
            content: "Recovered live response.",
          },
        }),
      });

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
      boundary: createProjectArchBoundary({
        cliExecutor: createReadyCliExecutor(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      loadRuntimeProfiles: async () => createReadyProfiles(),
    });

    if (!provider) {
      throw new Error("Expected webview provider registration");
    }

    const webview = createWebview(handlers);
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
      messageText: "Retry me after live failure.",
    });

    await handler({
      type: "stageChatSendIntent",
      relativePath,
      stageId: "implementation",
      stageTitle: "Implementation",
      messageText: "Retry me after live failure.",
    });

    const postedMessages = (
      webview.postMessage.mock.calls as unknown as Array<[Record<string, unknown>]>
    ).map((call) => call[0]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" &&
          payload?.["runtimeState"] === "error" &&
          payload?.["canRetry"] === true &&
          payload?.["failedMessage"] === "Retry me after live failure.",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeResponse" &&
          payload?.["content"] === "Recovered live response.",
      ),
    ).toBe(true);
    expect(
      postedMessages.some(
        (payload) =>
          payload?.["type"] === "stageChatRuntimeState" && payload?.["runtimeState"] === "success",
      ),
    ).toBe(true);
  });

  it("covers readiness-blocked failure path before live transport invocation", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/phase-a/milestones/milestone-a/tasks/planned/001-task.md";
    await writeFile(root, relativePath, createTaskContent());

    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const handlers: Array<(message: StageChatMessage) => Promise<void>> = [];

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ message: { content: "Should not be called." } }),
    }));

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
      boundary: createProjectArchBoundary({ fetchImpl: fetchImpl as unknown as typeof fetch }),
      loadRuntimeProfiles: async () => createBlockedProfiles(),
    });

    if (!provider) {
      throw new Error("Expected webview provider registration");
    }

    const webview = createWebview(handlers);
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

    expect(fetchImpl).not.toHaveBeenCalled();
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
