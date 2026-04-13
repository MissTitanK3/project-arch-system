import { describe, expect, it, vi } from "vitest";
import type {
  RuntimeManagementInventoryViewModel,
  RuntimeManagementScanViewModel,
} from "../integration/runtimeManagementBoundary";
import { EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY } from "../integration/runtimeManagementBoundary";
import {
  REFRESH_RUNTIMES_COMMAND_ID,
  RUNTIMES_VIEW_ID,
  buildRuntimesPanelFailedModel,
  buildRuntimesPanelLoadingModel,
  buildRuntimesPanelModel,
  registerRuntimesView,
  renderRuntimesHtml,
} from "./runtimesView";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyInventory: RuntimeManagementInventoryViewModel = {
  source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
  generatedAt: "2026-04-04T00:00:00.000Z",
  runtimes: [],
  profiles: [],
  summary: {
    totalRuntimes: 0,
    availableRuntimes: 0,
    totalProfiles: 0,
    readyProfiles: 0,
    blockedProfiles: 0,
    disabledProfiles: 0,
  },
};

const inventoryWithReadyProfile: RuntimeManagementInventoryViewModel = {
  source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
  generatedAt: "2026-04-04T00:00:00.000Z",
  projectRoot: "/repo",
  defaultProfile: "codex-implementer",
  runtimes: [
    {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      available: true,
      availabilitySource: "adapter-registry",
      linkedProfileCount: 1,
      readyProfileCount: 1,
      profileIds: ["codex-implementer"],
    },
  ],
  profiles: [
    {
      id: "codex-implementer",
      runtime: "codex-cli",
      runtimeDisplayName: "Codex CLI",
      model: "codex-1",
      enabled: true,
      isDefault: true,
      linked: true,
      available: true,
      readiness: "ready",
      status: "active",
      diagnostics: [],
      availabilitySource: "adapter-registry",
      readinessSummary: "Ready to launch.",
      affordances: [
        {
          kind: "inspect",
          command: "pa runtime check codex-implementer --json",
          label: "Inspect readiness",
        },
        {
          kind: "disable",
          command: "pa runtime disable codex-implementer",
          label: "Disable profile",
        },
        { kind: "update", command: "pa runtime update codex-implementer", label: "Update profile" },
        { kind: "unlink", command: "pa runtime unlink codex-implementer", label: "Unlink profile" },
      ],
    },
  ],
  summary: {
    totalRuntimes: 1,
    availableRuntimes: 1,
    totalProfiles: 1,
    readyProfiles: 1,
    blockedProfiles: 0,
    disabledProfiles: 0,
  },
};

const inventoryWithBlockedProfile: RuntimeManagementInventoryViewModel = {
  source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
  generatedAt: "2026-04-04T00:00:00.000Z",
  projectRoot: "/repo",
  runtimes: [
    {
      runtime: "openai",
      displayName: "OpenAI",
      available: true,
      availabilitySource: "adapter-registry",
      linkedProfileCount: 1,
      readyProfileCount: 0,
      profileIds: ["openai-planner"],
    },
  ],
  profiles: [
    {
      id: "openai-planner",
      runtime: "openai",
      runtimeDisplayName: "OpenAI",
      model: "gpt-5",
      enabled: true,
      isDefault: false,
      linked: true,
      available: true,
      readiness: "missing-auth",
      status: "not-ready",
      diagnostics: [
        {
          code: "MISSING_AUTH",
          severity: "error",
          message: "OPENAI_API_KEY is not set.",
          nextStep: "Set the OPENAI_API_KEY environment variable.",
        },
      ],
      availabilitySource: "adapter-registry",
      readinessSummary: "OPENAI_API_KEY is not set.",
      affordances: [
        {
          kind: "inspect",
          command: "pa runtime check openai-planner --json",
          label: "Inspect readiness",
        },
        { kind: "disable", command: "pa runtime disable openai-planner", label: "Disable profile" },
        {
          kind: "set-default",
          command: "pa runtime default openai-planner",
          label: "Set as default",
        },
        { kind: "update", command: "pa runtime update openai-planner", label: "Update profile" },
        { kind: "unlink", command: "pa runtime unlink openai-planner", label: "Unlink profile" },
      ],
    },
  ],
  summary: {
    totalRuntimes: 1,
    availableRuntimes: 1,
    totalProfiles: 1,
    readyProfiles: 0,
    blockedProfiles: 1,
    disabledProfiles: 0,
  },
};

const scanWithCandidates: RuntimeManagementScanViewModel = {
  source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
  scannedAt: "2026-04-04T01:00:00.000Z",
  scanStatus: "success",
  diagnostics: [],
  candidates: [
    {
      runtime: "jan-local",
      displayName: "Jan (local)",
      confidence: "medium",
      source: "config-file",
      suggestedModel: "mistral-7b",
      alreadyLinked: false,
      registerCommand: "pa runtime link jan-local",
      diagnostics: [],
    },
    {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      confidence: "high",
      source: "adapter-registry",
      suggestedModel: "codex-1",
      alreadyLinked: true,
      registerCommand: "pa runtime list --json",
      diagnostics: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Panel model builders
// ---------------------------------------------------------------------------

describe("runtimesView", () => {
  describe("buildRuntimesPanelModel", () => {
    it("produces loaded state when inventory has profiles and runtimes", () => {
      const model = buildRuntimesPanelModel(inventoryWithReadyProfile);
      expect(model.loadState).toBe("loaded");
    });

    it("produces empty-inventory state when inventory has no profiles or runtimes", () => {
      const model = buildRuntimesPanelModel(emptyInventory);
      expect(model.loadState).toBe("empty-inventory");
    });

    it("carries the source authority from the boundary", () => {
      const model = buildRuntimesPanelModel(inventoryWithReadyProfile);
      expect(model.sourceAuthority).toBe(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.authority);
    });

    it("carries runtimes, profiles, and summary from the inventory", () => {
      const model = buildRuntimesPanelModel(inventoryWithReadyProfile);
      expect(model.runtimes).toHaveLength(1);
      expect(model.profiles).toHaveLength(1);
      expect(model.summary.readyProfiles).toBe(1);
    });

    it("carries defaultProfile and projectRoot", () => {
      const model = buildRuntimesPanelModel(inventoryWithReadyProfile);
      expect(model.defaultProfile).toBe("codex-implementer");
      expect(model.projectRoot).toBe("/repo");
    });
  });

  describe("buildRuntimesPanelLoadingModel", () => {
    it("produces loading state with empty runtimes and profiles", () => {
      const model = buildRuntimesPanelLoadingModel();
      expect(model.loadState).toBe("loading");
      expect(model.runtimes).toHaveLength(0);
      expect(model.profiles).toHaveLength(0);
      expect(model.error).toBeUndefined();
    });
  });

  describe("buildRuntimesPanelFailedModel", () => {
    it("produces failed state and carries the error message", () => {
      const model = buildRuntimesPanelFailedModel("CLI command failed with exit code 1.");
      expect(model.loadState).toBe("failed");
      expect(model.error).toBe("CLI command failed with exit code 1.");
    });
  });

  // -------------------------------------------------------------------------
  // HTML rendering
  // -------------------------------------------------------------------------

  describe("renderRuntimesHtml", () => {
    it("renders loading state with placeholder text", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelLoadingModel());
      expect(html).toContain("Loading runtime inventory");
    });

    it("renders empty-inventory state with link and scan guidance", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(emptyInventory));
      expect(html).toContain("No linked runtime profiles");
      expect(html).toContain("pa runtime scan");
      expect(html).toContain("pa runtime link");
    });

    it("renders failed state with error message and retry hint", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelFailedModel("Connection refused."));
      expect(html).toContain("Failed to load runtime inventory");
      expect(html).toContain("Connection refused.");
      expect(html).toContain("pa runtime list --json");
    });

    it("renders a runtime section for each registered runtime", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain("Codex CLI");
      expect(html).toContain('data-runtime="codex-cli"');
    });

    it("renders a profile card for a ready profile with Ready badge", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain("codex-implementer");
      expect(html).toContain("badge-ready");
      expect(html).toContain("Ready");
    });

    it("renders a blocked profile card with Missing Auth badge and diagnostic", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithBlockedProfile));
      expect(html).toContain("openai-planner");
      expect(html).toContain("badge-blocked");
      expect(html).toContain("Missing Auth");
      expect(html).toContain("OPENAI_API_KEY is not set.");
    });

    it("renders next-step diagnostic hint alongside error message", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithBlockedProfile));
      expect(html).toContain("Set the OPENAI_API_KEY environment variable.");
    });

    it("renders Default badge for the default profile", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain("badge-default");
    });

    it("renders default profile section heading when defaultProfile is set", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain("Default Profile");
      expect(html).toContain("codex-implementer");
    });

    it("does not render default profile heading when no defaultProfile is set", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithBlockedProfile));
      expect(html).not.toContain("Default Profile:");
    });

    it("renders summary bar with runtime and profile counts", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain("summary-bar");
      // counts are wrapped in spans so check for the text fragments that are contiguous
      expect(html).toContain("runtimes (");
      expect(html).toContain("profiles");
    });

    it("renders blocked count in summary bar when blocked profiles exist", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithBlockedProfile));
      expect(html).toContain("count-blocked");
      expect(html).toContain("1 blocked");
    });

    it("renders affordance buttons with data-command attributes", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain('data-command="pa runtime check codex-implementer --json"');
      expect(html).toContain('data-command="pa runtime disable codex-implementer"');
    });

    it("renders availability source badge for adapter-registry source", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain("badge-source-adapter");
    });

    it("renders availability source badge for config-file source", () => {
      const configFileInventory: RuntimeManagementInventoryViewModel = {
        ...inventoryWithReadyProfile,
        runtimes: [
          {
            ...inventoryWithReadyProfile.runtimes[0],
            availabilitySource: "config-file",
          },
        ],
      };
      const html = renderRuntimesHtml(buildRuntimesPanelModel(configFileInventory));
      expect(html).toContain("badge-source-config");
    });

    it("escapes special characters in profile id to prevent XSS", () => {
      const xssInventory: RuntimeManagementInventoryViewModel = {
        ...inventoryWithReadyProfile,
        profiles: [
          {
            ...inventoryWithReadyProfile.profiles[0],
            id: '<script>alert("xss")</script>',
            runtimeDisplayName: "Codex CLI",
          },
        ],
        runtimes: [
          {
            ...inventoryWithReadyProfile.runtimes[0],
            profileIds: ['<script>alert("xss")</script>'],
          },
        ],
      };
      const html = renderRuntimesHtml(buildRuntimesPanelModel(xssInventory));
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain("&lt;script&gt;");
    });

    it("renders empty-profiles message when a runtime has no linked profiles", () => {
      const noProfileInventory: RuntimeManagementInventoryViewModel = {
        ...inventoryWithReadyProfile,
        runtimes: [
          {
            ...inventoryWithReadyProfile.runtimes[0],
            profileIds: [],
            linkedProfileCount: 0,
          },
        ],
        profiles: [],
      };
      const html = renderRuntimesHtml({
        ...buildRuntimesPanelModel(noProfileInventory),
        loadState: "loaded",
      });
      expect(html).toContain("No linked profiles for this runtime");
      expect(html).toContain("pa runtime link codex-cli --profile &lt;id&gt;");
      expect(html).toContain("Stage Link Command");
      expect(html).toContain('data-command="pa runtime link codex-cli --profile &lt;id&gt;"');
    });

    it("includes a refresh button in all states", () => {
      const states = [
        buildRuntimesPanelLoadingModel(),
        buildRuntimesPanelModel(emptyInventory),
        buildRuntimesPanelFailedModel("Error"),
        buildRuntimesPanelModel(inventoryWithReadyProfile),
      ];
      for (const model of states) {
        const html = renderRuntimesHtml(model);
        expect(html).toContain("refresh-btn");
      }
    });

    it("includes a scan runtimes button in all states", () => {
      const states = [
        buildRuntimesPanelLoadingModel(),
        buildRuntimesPanelModel(emptyInventory),
        buildRuntimesPanelFailedModel("Error"),
        buildRuntimesPanelModel(inventoryWithReadyProfile, scanWithCandidates),
      ];
      for (const model of states) {
        const html = renderRuntimesHtml(model);
        expect(html).toContain("scan-runtimes-btn");
        expect(html).toContain("Scan Runtimes");
      }
    });

    it("renders discovered runtime candidates in a distinct scan section", () => {
      const html = renderRuntimesHtml(
        buildRuntimesPanelModel(inventoryWithReadyProfile, scanWithCandidates),
      );
      expect(html).toContain('data-section="scan-candidates"');
      expect(html).toContain("Discovered Runtime Candidates");
      expect(html).toContain("local discovery");
      expect(html).toContain("Jan (local)");
    });

    it("renders unlinked candidate actions as create-candidate mutation handoff", () => {
      const html = renderRuntimesHtml(
        buildRuntimesPanelModel(inventoryWithReadyProfile, scanWithCandidates),
      );
      expect(html).toContain('data-mutation-kind="create-candidate"');
      expect(html).toContain('data-runtime="jan-local"');
      expect(html).toContain('data-suggested-model="mistral-7b"');
    });

    it("renders linked candidate actions with a prefilled setup button for suggested models", () => {
      const html = renderRuntimesHtml(
        buildRuntimesPanelModel(inventoryWithReadyProfile, scanWithCandidates),
      );
      expect(html).toContain("Setup profile for suggested model");
      expect(html).toContain('data-mutation-kind="create-candidate"');
      expect(html).toContain('data-runtime="codex-cli"');
      expect(html).toContain('data-suggested-model="codex-1"');
    });

    it("keeps linked candidate inspect commands available", () => {
      const html = renderRuntimesHtml(
        buildRuntimesPanelModel(inventoryWithReadyProfile, scanWithCandidates),
      );
      expect(html).toContain("Inspect linked profiles");
      expect(html).toContain('data-command="pa runtime list --json"');
    });

    it("renders separate runtime sections that are not mixed into the run-review surface", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      // Runtime management surface should NOT reference run-review concepts
      expect(html).not.toContain("RunReview");
      expect(html).not.toContain("runId");
      expect(html).not.toContain("resultBundle");
    });
  });

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  describe("constants", () => {
    it("exports the correct view ID for panel registration", () => {
      expect(RUNTIMES_VIEW_ID).toBe("projectArch.runtimes");
    });

    it("exports the correct refresh command ID", () => {
      expect(REFRESH_RUNTIMES_COMMAND_ID).toBe("projectArch.refreshRuntimes");
    });
  });

  // -------------------------------------------------------------------------
  // Panel registration
  // -------------------------------------------------------------------------

  describe("registerRuntimesView", () => {
    it("registers the webview provider and refresh command as subscriptions", () => {
      const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      const api = {
        window: {
          registerWebviewViewProvider,
          terminals: [],
          createTerminal: vi.fn(),
          showInformationMessage: vi.fn(),
          showWarningMessage: vi.fn(),
        },
        workspace: {
          workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
          executeCommand: vi.fn(async () => undefined),
        },
      };

      registerRuntimesView(context as never, api as never);

      expect(registerWebviewViewProvider).toHaveBeenCalledWith(
        RUNTIMES_VIEW_ID,
        expect.objectContaining({ resolveWebviewView: expect.any(Function) }),
      );
      expect(api.commands.registerCommand).toHaveBeenCalledWith(
        REFRESH_RUNTIMES_COMMAND_ID,
        expect.any(Function),
      );
      expect(context.subscriptions.length).toBeGreaterThanOrEqual(2);
    });

    it("resolves webview view and renders the panel HTML on load", async () => {
      const registerWebviewViewProvider = vi.fn((_id, provider) => {
        return { provider, dispose: vi.fn() };
      });

      let webviewHtml = "";
      const fakeWebviewView = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn(),
          get html() {
            return webviewHtml;
          },
          set html(v: string) {
            webviewHtml = v;
          },
        },
        onDidDispose: vi.fn(),
        onDidChangeVisibility: vi.fn(),
      };

      const inventoryResult: RuntimeManagementInventoryViewModel = inventoryWithReadyProfile;

      const mockBoundary = {
        transport: "cli-json" as const,
        cliCommand: "pa",
        runCliJson: vi.fn(),
        parseArtifact: vi.fn(),
        parseResultBundle: vi.fn(),
        parseRuntimeInventoryListResult: vi.fn(),
        parseRuntimeReadinessCheckResult: vi.fn(),
        parseRuntimeScanResult: vi.fn(),
        readRuntimeInventoryList: vi.fn(async () => ({
          schemaVersion: "2.0",
          status: "runtime-inventory" as const,
          generatedAt: inventoryResult.generatedAt,
          projectRoot: inventoryResult.projectRoot,
          defaultProfile: inventoryResult.defaultProfile,
          runtimes: [
            {
              runtime: "codex-cli",
              displayName: "Codex CLI",
              available: true,
              availabilitySource: "adapter-registry",
              profiles: ["codex-implementer"],
            },
          ],
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "codex-1",
              enabled: true,
              default: true,
              linked: true,
              available: true,
              readiness: "ready" as const,
              status: "active" as const,
              diagnostics: [],
            },
          ],
          summary: { total: 1, ready: 1, blocked: 0, disabled: 0 },
        })),
        readRuntimeReadinessCheck: vi.fn(),
        readRuntimeScan: vi.fn(),
      };

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      const api = {
        window: {
          registerWebviewViewProvider,
          terminals: [],
          createTerminal: vi.fn(),
          showInformationMessage: vi.fn(),
          showWarningMessage: vi.fn(),
        },
        workspace: {
          workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
          executeCommand: vi.fn(async () => undefined),
        },
      };

      registerRuntimesView(context as never, api as never, { boundary: mockBoundary as never });

      const providerCall = registerWebviewViewProvider.mock.calls[0];
      const provider = providerCall?.[1];

      await provider?.resolveWebviewView(fakeWebviewView, {}, {});

      // Allow async refresh to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(webviewHtml).toContain("Codex CLI");
      expect(webviewHtml).toContain("codex-implementer");
      expect(webviewHtml).toContain("badge-ready");
    });

    it("renders failed state when the inventory load throws", async () => {
      const registerWebviewViewProvider = vi.fn((_id, provider) => {
        return { provider, dispose: vi.fn() };
      });

      let webviewHtml = "";
      const fakeWebviewView = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn(),
          get html() {
            return webviewHtml;
          },
          set html(v: string) {
            webviewHtml = v;
          },
        },
        onDidDispose: vi.fn(),
        onDidChangeVisibility: vi.fn(),
      };

      const mockBoundary = {
        transport: "cli-json" as const,
        cliCommand: "pa",
        runCliJson: vi.fn(),
        parseArtifact: vi.fn(),
        parseResultBundle: vi.fn(),
        parseRuntimeInventoryListResult: vi.fn(),
        parseRuntimeReadinessCheckResult: vi.fn(),
        parseRuntimeScanResult: vi.fn(),
        readRuntimeInventoryList: vi.fn(async () => {
          throw new Error("pa CLI not found");
        }),
        readRuntimeReadinessCheck: vi.fn(),
        readRuntimeScan: vi.fn(),
      };

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      const api = {
        window: {
          registerWebviewViewProvider,
          terminals: [],
          createTerminal: vi.fn(),
          showInformationMessage: vi.fn(),
          showWarningMessage: vi.fn(),
        },
        workspace: {
          workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
          executeCommand: vi.fn(async () => undefined),
        },
      };

      registerRuntimesView(context as never, api as never, { boundary: mockBoundary as never });

      const providerCall = registerWebviewViewProvider.mock.calls[0];
      const provider = providerCall?.[1];

      await provider?.resolveWebviewView(fakeWebviewView, {}, {});
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(webviewHtml).toContain("Failed to load runtime inventory");
      expect(webviewHtml).toContain("pa CLI not found");
    });

    it("uses process.cwd() when no workspace folders are configured", () => {
      const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      const api = {
        window: {
          registerWebviewViewProvider,
          terminals: [],
          createTerminal: vi.fn(),
          showInformationMessage: vi.fn(),
          showWarningMessage: vi.fn(),
        },
        workspace: { workspaceFolders: undefined },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
          executeCommand: vi.fn(async () => undefined),
        },
      };

      expect(() => registerRuntimesView(context as never, api as never)).not.toThrow();
      expect(registerWebviewViewProvider).toHaveBeenCalledWith(
        RUNTIMES_VIEW_ID,
        expect.objectContaining({ resolveWebviewView: expect.any(Function) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Mutation flow HTML surface
  // -------------------------------------------------------------------------

  describe("mutation flow HTML surface", () => {
    it("renders a Link Profile button in the toolbar across all load states", () => {
      const states = [
        buildRuntimesPanelLoadingModel(),
        buildRuntimesPanelModel(emptyInventory),
        buildRuntimesPanelFailedModel("Error"),
        buildRuntimesPanelModel(inventoryWithReadyProfile),
      ];
      for (const model of states) {
        const html = renderRuntimesHtml(model);
        expect(html).toContain("link-profile-btn");
        expect(html).toContain("Link Profile");
      }
    });

    it("renders unlink affordance with data-mutation-kind instead of data-command", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain('data-mutation-kind="unlink"');
      expect(html).not.toContain('data-command="pa runtime unlink codex-implementer"');
    });

    it("renders update affordance with data-mutation-kind instead of data-command", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain('data-mutation-kind="update-model"');
      expect(html).not.toContain('data-command="pa runtime update codex-implementer"');
    });

    it("renders unlink/update buttons with the profile id embedded in data-profile-id", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      const mutationButtonCount = (html.match(/data-profile-id="codex-implementer"/g) ?? []).length;
      expect(mutationButtonCount).toBeGreaterThanOrEqual(2); // unlink + update
    });

    it("renders update button with data-current-model when profile has a model", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithReadyProfile));
      expect(html).toContain('data-current-model="codex-1"');
    });

    it("keeps stage-command buttons for enable, disable, set-default, and inspect affordances", () => {
      const html = renderRuntimesHtml(buildRuntimesPanelModel(inventoryWithBlockedProfile));
      // The blocked profile has inspect, disable, set-default, update, unlink affordances
      expect(html).toContain('data-command="pa runtime check openai-planner --json"');
      expect(html).toContain('data-command="pa runtime disable openai-planner"');
      expect(html).toContain('data-command="pa runtime default openai-planner"');
    });
  });

  // -------------------------------------------------------------------------
  // Mutation flow message handling
  // -------------------------------------------------------------------------

  describe("mutation flow message handling", () => {
    async function setupProviderWithMessageCapture() {
      const registerWebviewViewProvider = vi.fn((_id, provider) => ({
        provider,
        dispose: vi.fn(),
      }));
      let capturedMessageHandler: ((msg: unknown) => Promise<void>) | undefined;

      const fakeWebviewView = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn((handler) => {
            capturedMessageHandler = handler as (msg: unknown) => Promise<void>;
          }),
          get html() {
            return "";
          },
          set html(_v: string) {},
        },
        onDidDispose: vi.fn(),
        onDidChangeVisibility: vi.fn(),
      };

      const showInputBox = vi.fn();
      const showWarningMessage = vi.fn();
      const showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const mockBoundary = {
        transport: "cli-json" as const,
        cliCommand: "pa",
        runCliJson: vi.fn(),
        parseArtifact: vi.fn(),
        parseResultBundle: vi.fn(),
        parseRuntimeInventoryListResult: vi.fn(),
        parseRuntimeReadinessCheckResult: vi.fn(),
        parseRuntimeScanResult: vi.fn(),
        readRuntimeInventoryList: vi.fn(async () => ({
          schemaVersion: "2.0",
          status: "runtime-inventory" as const,
          runtimes: [],
          profiles: [],
          summary: { total: 0, ready: 0, blocked: 0, disabled: 0 },
        })),
        readRuntimeReadinessCheck: vi.fn(),
        readRuntimeScan: vi.fn(async () => ({
          schemaVersion: "2.0",
          status: "runtime-scan" as const,
          scanStatus: "success" as const,
          scannedAt: "2026-04-04T01:00:00.000Z",
          candidates: [],
          diagnostics: [],
        })),
      };

      const terminals: { show: ReturnType<typeof vi.fn>; sendText: ReturnType<typeof vi.fn> }[] =
        [];
      const api = {
        window: {
          registerWebviewViewProvider,
          terminals,
          createTerminal: vi.fn(() => {
            const t = { show: vi.fn(), sendText: vi.fn() };
            terminals.push(t);
            return t;
          }),
          showInputBox,
          showWarningMessage,
          showInformationMessage,
        },
        workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
          executeCommand: vi.fn(async () => undefined),
        },
      };

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerRuntimesView(context as never, api as never, { boundary: mockBoundary as never });

      const providerCall = registerWebviewViewProvider.mock.calls[0];
      await providerCall?.[1]?.resolveWebviewView(fakeWebviewView, {}, {});

      return {
        sendMessage: async (msg: unknown) => {
          if (capturedMessageHandler) await capturedMessageHandler(msg);
        },
        showInputBox,
        showWarningMessage,
        showInformationMessage,
        terminals,
        createTerminal: api.window.createTerminal,
        readRuntimeScan: mockBoundary.readRuntimeScan,
      };
    }

    it("handles scan message by invoking runtime scan through the boundary", async () => {
      const { sendMessage, readRuntimeScan } = await setupProviderWithMessageCapture();
      const callCountBefore = readRuntimeScan.mock.calls.length;

      await sendMessage({ type: "scan" });

      expect(readRuntimeScan.mock.calls.length).toBeGreaterThan(callCountBefore);
    });

    it("handles unlink mutation: stages command when user confirms the warning dialog", async () => {
      const { sendMessage, showWarningMessage, createTerminal } =
        await setupProviderWithMessageCapture();

      showWarningMessage.mockResolvedValueOnce("Unlink Profile");

      await sendMessage({
        type: "mutation",
        kind: "unlink",
        profileId: "codex-implementer",
        currentModel: "",
      });

      expect(showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("codex-implementer"),
        expect.objectContaining({ modal: true }),
        "Unlink Profile",
      );
      expect(createTerminal).toHaveBeenCalled();
      const terminal = (createTerminal as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      expect(terminal?.sendText).toHaveBeenCalledWith("pa runtime unlink codex-implementer", false);
    });

    it("handles unlink mutation: does not stage when user cancels the warning dialog", async () => {
      const { sendMessage, showWarningMessage, createTerminal } =
        await setupProviderWithMessageCapture();

      showWarningMessage.mockResolvedValueOnce(undefined);

      await sendMessage({
        type: "mutation",
        kind: "unlink",
        profileId: "codex-implementer",
        currentModel: "",
      });

      expect(showWarningMessage).toHaveBeenCalled();
      expect(createTerminal).not.toHaveBeenCalled();
    });

    it("handles create mutation: stages link command when all inputs are provided", async () => {
      const { sendMessage, showInputBox, createTerminal } = await setupProviderWithMessageCapture();

      showInputBox
        .mockResolvedValueOnce("codex-cli")
        .mockResolvedValueOnce("my-profile")
        .mockResolvedValueOnce("codex-1");

      await sendMessage({ type: "mutation", kind: "create", profileId: "", currentModel: "" });

      expect(showInputBox).toHaveBeenCalledTimes(3);
      expect(createTerminal).toHaveBeenCalled();
      const terminal = (createTerminal as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      expect(terminal?.sendText).toHaveBeenCalledWith(
        "pa runtime link codex-cli --profile my-profile --model codex-1",
        false,
      );
    });

    it("handles create mutation: does not stage when user cancels runtime prompt", async () => {
      const { sendMessage, showInputBox, createTerminal } = await setupProviderWithMessageCapture();

      showInputBox.mockResolvedValueOnce(undefined);

      await sendMessage({ type: "mutation", kind: "create", profileId: "", currentModel: "" });

      expect(createTerminal).not.toHaveBeenCalled();
    });

    it("handles create-candidate mutation: pre-fills runtime/model and stages link command", async () => {
      const { sendMessage, showInputBox, createTerminal } = await setupProviderWithMessageCapture();

      showInputBox
        .mockResolvedValueOnce("jan-local")
        .mockResolvedValueOnce("jan-profile")
        .mockResolvedValueOnce("mistral-7b");

      await sendMessage({
        type: "mutation",
        kind: "create-candidate",
        runtime: "jan-local",
        suggestedModel: "mistral-7b",
      });

      expect(showInputBox).toHaveBeenCalledWith(expect.objectContaining({ value: "jan-local" }));
      expect(showInputBox).toHaveBeenCalledWith(expect.objectContaining({ value: "mistral-7b" }));
      const terminal = (createTerminal as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      expect(terminal?.sendText).toHaveBeenCalledWith(
        "pa runtime link jan-local --profile jan-profile --model mistral-7b",
        false,
      );
    });

    it("handles update-model mutation: stages update command with new model", async () => {
      const { sendMessage, showInputBox, createTerminal } = await setupProviderWithMessageCapture();

      showInputBox.mockResolvedValueOnce("codex-2");

      await sendMessage({
        type: "mutation",
        kind: "update-model",
        profileId: "codex-implementer",
        currentModel: "codex-1",
      });

      expect(showInputBox).toHaveBeenCalledWith(expect.objectContaining({ value: "codex-1" }));
      const terminal = (createTerminal as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      expect(terminal?.sendText).toHaveBeenCalledWith(
        "pa runtime update codex-implementer --model codex-2",
        false,
      );
    });

    it("shows an information message after a mutation is staged", async () => {
      const { sendMessage, showWarningMessage, showInformationMessage } =
        await setupProviderWithMessageCapture();

      showWarningMessage.mockResolvedValueOnce("Unlink Profile");

      await sendMessage({
        type: "mutation",
        kind: "unlink",
        profileId: "codex-implementer",
        currentModel: "",
      });

      expect(showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("staged in terminal"),
        "Refresh Panel",
      );
    });
  });
});
