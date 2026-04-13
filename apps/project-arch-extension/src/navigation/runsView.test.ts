import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRunsPanelModel,
  REFRESH_RUNS_COMMAND_ID,
  registerRunsView,
  renderRunsHtml,
  RUNS_VIEW_ID,
} from "./runsView";

const {
  lookupRunStatusMock,
  buildRunReviewContextMock,
  buildOrchestrationReviewContextMock,
  lookupRunAuditGroupMock,
} = vi.hoisted(() => ({
  lookupRunStatusMock: vi.fn(),
  buildRunReviewContextMock: vi.fn(),
  buildOrchestrationReviewContextMock: vi.fn(),
  lookupRunAuditGroupMock: vi.fn(),
}));

vi.mock("../integration/runStatusLookup", () => ({
  lookupRunStatus: lookupRunStatusMock,
}));

vi.mock("../review/runReviewContext", () => ({
  buildRunReviewContext: buildRunReviewContextMock,
}));

vi.mock("../review/orchestrationContext", () => ({
  buildOrchestrationReviewContext: buildOrchestrationReviewContextMock,
}));

vi.mock("../review/auditContext", () => ({
  lookupRunAuditGroup: lookupRunAuditGroupMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("runsView", () => {
  it("registers runs webview and refresh command", () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();

    const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => Promise<void>) => {
      handlers.set(id, handler);
      return { dispose: vi.fn() };
    });

    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    const api = {
      window: {
        registerWebviewViewProvider,
        showInformationMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        showErrorMessage: vi.fn(),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
      },
      commands: {
        registerCommand,
        executeCommand: vi.fn(async () => undefined),
      },
    };

    registerRunsView(context as never, api as never, {
      discoverRunIds: async () => [],
      now: () => "2026-04-03T00:00:00.000Z",
    });

    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      RUNS_VIEW_ID,
      expect.objectContaining({
        resolveWebviewView: expect.any(Function),
      }),
    );
    expect(handlers.has(REFRESH_RUNS_COMMAND_ID)).toBe(true);
  });

  it("builds run-first cards with canonical follow-up and artifact links", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runs-view-"));
    const reconcileDir = path.join(workspaceRoot, ".project-arch", "reconcile");
    await fs.mkdir(reconcileDir, { recursive: true });
    await fs.writeFile(
      path.join(reconcileDir, "001-2026-04-03.json"),
      JSON.stringify({ runId: "run-2026-04-03-120500" }),
      "utf8",
    );

    lookupRunStatusMock.mockResolvedValue({
      runId: "run-2026-04-03-120500",
      taskRef: "001",
      phase: "post-launch",
      runRecordExists: true,
      orchestrationRecordExists: true,
      runtime: "codex-cli",
      launchedAt: "2026-04-03T12:05:00.000Z",
      orchestration: {
        status: "completed",
        completedRoles: ["planner", "implementer"],
      },
      artifacts: {
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-03-120500.json",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-03-120500.json",
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-03-120500.json",
      },
    });

    buildRunReviewContextMock.mockReturnValue({
      runId: "run-2026-04-03-120500",
      taskRef: "001",
      outcome: "validation-passed-awaiting-reconcile",
      launchedAt: "2026-04-03T12:05:00.000Z",
      runtime: "codex-cli",
      artifacts: {
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-03-120500.json",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-03-120500.json",
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-03-120500.json",
      },
      followUpActions: [
        {
          id: "reconcile",
          label: "Reconcile Run",
          description: "Run pa agent reconcile.",
          cliArgs: ["agent", "reconcile", "run-2026-04-03-120500"],
        },
      ],
    });

    buildOrchestrationReviewContextMock.mockReturnValue({
      lifecyclePosition: "Orchestration completed.",
      roleProgress: [
        { role: "planner", state: "completed" },
        { role: "implementer", state: "completed" },
        { role: "reviewer", state: "pending" },
      ],
    });

    lookupRunAuditGroupMock.mockResolvedValue({
      runId: "run-2026-04-03-120500",
      hasErrors: true,
      events: [
        {
          command: "agent reconcile",
          status: "failed",
          message: "Scope mismatch",
        },
      ],
      navigation: {
        logPath: ".project-arch/agent-runtime/logs/execution.jsonl",
      },
    });

    const model = await buildRunsPanelModel({
      workspaceRoot,
      dependencies: {
        discoverRunIds: async () => ["run-2026-04-03-120500"],
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
            reason: "Default runtime profile is ready.",
            nextStep: "Launch with the default profile or choose another ready profile.",
          },
        }),
        now: () => "2026-04-03T12:06:00.000Z",
      },
    });

    expect(model.generatedAt).toBe("2026-04-03T12:06:00.000Z");
    expect(model.runCount).toBe(1);
    expect(model.needsAttentionCount).toBe(1);
    expect(model.orchestratedCount).toBe(0);
    expect(model.auditErrorCount).toBe(1);
    expect(model.runtimeProfiles.loadState).toBe("loaded");
    expect(model.runtimeProfiles.readyCount).toBe(1);

    const card = model.cards[0];
    if (!card) {
      throw new Error("Expected run card");
    }

    expect(card.nextStep).toContain("pa agent reconcile run-2026-04-03-120500");
    expect(card.artifacts.some((artifact) => artifact.label === "Reconcile Artifact")).toBe(true);
    expect(card.artifacts.some((artifact) => artifact.label === "Audit Context")).toBe(true);
  });

  it("keeps empty runtime inventory separate from run history state", async () => {
    const model = await buildRunsPanelModel({
      workspaceRoot: process.cwd(),
      dependencies: {
        discoverRunIds: async () => [],
        loadRuntimeProfiles: async () => ({
          source: {
            authority: "project-arch-cli-json",
            inventoryCommand: "pa runtime list --json",
            readinessCommand: "pa runtime check <profileId> --json",
            mode: "bounded-combination",
          },
          defaultProfile: undefined,
          options: [],
          decision: {
            state: "empty-inventory",
            reason: "No linked runtime profiles are available in this repository.",
            nextStep: "Link a runtime profile with pa runtime link and refresh the Runs panel.",
          },
        }),
        now: () => "2026-04-03T12:10:00.000Z",
      },
    });

    expect(model.runCount).toBe(0);
    expect(model.cards).toEqual([]);
    expect(model.runtimeProfiles.loadState).toBe("empty-inventory");
    expect(model.runtimeProfiles.refreshCommand).toBe("pa runtime list --json");
  });

  it("surfaces runtime inventory load failures as diagnosable panel model state", async () => {
    const model = await buildRunsPanelModel({
      workspaceRoot: process.cwd(),
      dependencies: {
        discoverRunIds: async () => [],
        loadRuntimeProfiles: async () => {
          throw new Error("Invalid runtime inventory payload");
        },
        now: () => "2026-04-03T12:11:00.000Z",
      },
    });

    expect(model.runtimeProfiles.loadState).toBe("failed");
    expect(model.runtimeProfiles.error).toContain("Invalid runtime inventory payload");
    expect(model.runtimeProfiles.nextStep).toContain("pa runtime list --json");
    expect(model.cards).toEqual([]);
  });

  it("renders runtime profiles as readiness context above run history", async () => {
    const model = await buildRunsPanelModel({
      workspaceRoot: process.cwd(),
      dependencies: {
        discoverRunIds: async () => [],
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
            {
              id: "claude-reviewer",
              runtime: "claude-cli",
              model: "claude-opus-4",
              isDefault: false,
              enabled: true,
              readiness: "blocked",
              status: "not-ready",
              eligibility: "blocked",
              inlineSummary: "API key is missing.",
              diagnostics: [],
            },
            {
              id: "disabled-planner",
              runtime: "codex-cli",
              model: "gpt-5-mini",
              isDefault: false,
              enabled: false,
              readiness: "disabled",
              status: "disabled",
              eligibility: "disabled",
              inlineSummary: "Profile is disabled in runtime config.",
              diagnostics: [],
            },
          ],
          decision: {
            state: "selected-default-ready",
            reason: "Default runtime profile is ready.",
            nextStep: "Launch with the default profile or choose another ready profile.",
          },
        }),
        now: () => "2026-04-03T12:12:00.000Z",
      },
    });

    const html = renderRunsHtml(model);

    expect(html).toContain("Runtime Profiles");
    expect(html).toContain("Runtime State");
    expect(html).toContain('data-runtime-profile-card="codex-implementer"');
    expect(html).toContain("Model gpt-5.4");
    expect(html).toContain("Default");
    expect(html).toContain("Ready");
    expect(html).toContain("Blocked");
    expect(html).toContain("Disabled");
    expect(html).toContain("API key is missing.");
    expect(html).toContain("Profile is disabled in runtime config.");
    expect(html).not.toContain('data-runtime-panel-action="launchTask"');
    expect(html).toContain("Runs is history and follow-up only");
    expect(html).toContain('data-runtime-panel-action="inspectRuntimeProfile"');
  });

  it("renders empty runtime inventory guidance toward canonical CLI next steps", async () => {
    const model = await buildRunsPanelModel({
      workspaceRoot: process.cwd(),
      dependencies: {
        discoverRunIds: async () => [],
        loadRuntimeProfiles: async () => ({
          source: {
            authority: "project-arch-cli-json",
            inventoryCommand: "pa runtime list --json",
            readinessCommand: "pa runtime check <profileId> --json",
            mode: "bounded-combination",
          },
          defaultProfile: undefined,
          options: [],
          decision: {
            state: "empty-inventory",
            reason: "No linked runtime profiles are available in this repository.",
            nextStep: "Link a runtime profile with pa runtime link and refresh the Runs panel.",
          },
        }),
        now: () => "2026-04-03T12:13:00.000Z",
      },
    });

    const html = renderRunsHtml(model);

    expect(html).toContain("No linked runtime profiles");
    expect(html).toContain("pa runtime link");
    expect(html).toContain("pa runtime list --json");
    expect(html).toContain('data-runtime-panel-action="openRuntimesPanel"');
  });

  it("routes webview actions for run follow-up and artifact opening", async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const onDidReceiveMessageHandlers: Array<
      (message: {
        type?: string;
        runId?: string;
        actionId?: string;
        kind?: string;
        relativePath?: string;
        label?: string;
      }) => Promise<void>
    > = [];

    lookupRunStatusMock.mockResolvedValue({
      runId: "run-2026-04-03-120500",
      taskRef: "001",
      phase: "post-launch",
      runRecordExists: true,
      orchestrationRecordExists: false,
      runtime: "codex-cli",
      launchedAt: "2026-04-03T12:05:00.000Z",
      artifacts: {
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-03-120500.json",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-03-120500.json",
      },
    });

    buildRunReviewContextMock.mockReturnValue({
      runId: "run-2026-04-03-120500",
      taskRef: "001",
      outcome: "post-launch-awaiting-validation",
      launchedAt: "2026-04-03T12:05:00.000Z",
      runtime: "codex-cli",
      artifacts: {
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-03-120500.json",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-03-120500.json",
      },
      followUpActions: [
        {
          id: "validate",
          label: "Validate Run",
          description: "Run pa agent validate.",
          cliArgs: ["agent", "validate", "run-2026-04-03-120500"],
        },
      ],
    });

    lookupRunAuditGroupMock.mockResolvedValue({
      runId: "run-2026-04-03-120500",
      hasErrors: false,
      events: [],
      navigation: {
        logPath: ".project-arch/agent-runtime/logs/execution.jsonl",
      },
    });

    const runCliJson = vi.fn(async () => ({ success: true }));
    const executeCommand = vi.fn(async () => undefined);

    const registerWebviewViewProvider = vi.fn((_id: string, value: unknown) => {
      provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
      return { dispose: vi.fn() };
    });

    const api = {
      window: {
        registerWebviewViewProvider,
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showErrorMessage: vi.fn(async () => undefined),
        showInputBox: vi.fn(async () => "001"),
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

    registerRunsView({ subscriptions: [] } as never, api as never, {
      boundary: {
        runCliJson,
        runCliText: vi.fn(),
        readRuntimeReadinessCheck: vi.fn(async () => ({
          schemaVersion: "2.0",
          status: "runtime-readiness-check",
          checkedAt: "2026-04-03T12:06:00.000Z",
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
        })),
      } as never,
      discoverRunIds: async () => ["run-2026-04-03-120500"],
      now: () => "2026-04-03T12:06:00.000Z",
    });

    if (!provider) {
      throw new Error("Expected runs webview provider");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          onDidReceiveMessageHandlers.push(handler as never);
        }),
      },
    });

    const refresh = handlers.get(REFRESH_RUNS_COMMAND_ID);
    if (!refresh) {
      throw new Error("Expected refresh command registration");
    }
    await refresh();

    const messageHandler = onDidReceiveMessageHandlers[0];
    if (!messageHandler) {
      throw new Error("Expected message handler registration");
    }

    await messageHandler({
      type: "runFollowUp",
      runId: "run-2026-04-03-120500",
      actionId: "validate",
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "validate", "run-2026-04-03-120500"],
      cwd: process.cwd(),
    });

    await messageHandler({
      type: "openArtifact",
      kind: "run",
      relativePath: ".project-arch/agent-runtime/runs/run-2026-04-03-120500.json",
      label: "Run Record",
    });

    expect(executeCommand).toHaveBeenCalled();
  });

  it("stages runtime diagnostics commands for blocked profiles instead of launching", async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const onDidReceiveMessageHandlers: Array<(message: Record<string, unknown>) => Promise<void>> =
      [];

    const registerWebviewViewProvider = vi.fn((_id: string, value: unknown) => {
      provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
      return { dispose: vi.fn() };
    });

    const executeCommand = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider,
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showErrorMessage: vi.fn(async () => undefined),
        showInputBox: vi.fn(async () => "012"),
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

    registerRunsView({ subscriptions: [] } as never, api as never, {
      boundary: {
        runCliJson: vi.fn(),
        runCliText: vi.fn(),
        readRuntimeReadinessCheck: vi.fn(),
      } as never,
      discoverRunIds: async () => [],
      loadRuntimeProfiles: async () => ({
        source: {
          authority: "project-arch-cli-json",
          inventoryCommand: "pa runtime list --json",
          readinessCommand: "pa runtime check <profileId> --json",
          mode: "bounded-combination",
        },
        defaultProfile: "claude-reviewer",
        options: [
          {
            id: "claude-reviewer",
            runtime: "claude-cli",
            model: "claude-opus-4",
            isDefault: true,
            enabled: true,
            readiness: "blocked",
            status: "not-ready",
            eligibility: "blocked",
            inlineSummary: "API key is missing.",
            diagnostics: [],
          },
        ],
        decision: {
          state: "default-blocked-no-ready",
          reason: "Default profile 'claude-reviewer' is not ready and no ready fallback exists.",
          nextStep:
            "Resolve readiness diagnostics with pa runtime check claude-reviewer --json and refresh inventory.",
        },
      }),
      now: () => "2026-04-03T12:18:00.000Z",
    });

    if (!provider) {
      throw new Error("Expected runs webview provider");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          onDidReceiveMessageHandlers.push(handler as never);
        }),
      },
    });

    const refresh = handlers.get(REFRESH_RUNS_COMMAND_ID);
    if (!refresh) {
      throw new Error("Expected refresh command registration");
    }
    await refresh();

    const messageHandler = onDidReceiveMessageHandlers[0];
    if (!messageHandler) {
      throw new Error("Expected runtime profile message handler");
    }

    await messageHandler({
      type: "runtimeProfileAction",
      action: "inspectRuntimeProfile",
      profileId: "claude-reviewer",
    });

    expect(executeCommand).toHaveBeenCalledWith(
      "projectArch.stageCatalogCommandInNewTerminal",
      "pa runtime check claude-reviewer --json",
    );
  });

  it("routes runtime cross-link action to the Runtimes panel focus command", async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    let provider: { resolveWebviewView: (view: unknown) => Promise<void> } | undefined;
    const onDidReceiveMessageHandlers: Array<(message: Record<string, unknown>) => Promise<void>> =
      [];

    const registerWebviewViewProvider = vi.fn((_id: string, value: unknown) => {
      provider = value as { resolveWebviewView: (view: unknown) => Promise<void> };
      return { dispose: vi.fn() };
    });

    const executeCommand = vi.fn(async () => undefined);

    const api = {
      window: {
        registerWebviewViewProvider,
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
        showErrorMessage: vi.fn(async () => undefined),
        showInputBox: vi.fn(async () => undefined),
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

    registerRunsView({ subscriptions: [] } as never, api as never, {
      boundary: {
        runCliJson: vi.fn(),
        runCliText: vi.fn(),
        readRuntimeReadinessCheck: vi.fn(),
      } as never,
      discoverRunIds: async () => [],
      now: () => "2026-04-03T21:30:00.000Z",
    });

    if (!provider) {
      throw new Error("Expected runs webview provider");
    }

    await provider.resolveWebviewView({
      webview: {
        options: {},
        html: "",
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          onDidReceiveMessageHandlers.push(handler as never);
        }),
      },
    });

    const messageHandler = onDidReceiveMessageHandlers[0];
    if (!messageHandler) {
      throw new Error("Expected runtime profile message handler");
    }

    await messageHandler({
      type: "runtimeProfileAction",
      action: "openRuntimesPanel",
    });

    expect(executeCommand).toHaveBeenCalledWith("projectArch.runtimes.focus");
  });
});
