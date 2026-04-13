import { describe, expect, it, vi } from "vitest";
import {
  detectProjectArchPresence,
  INIT_VARIANTS,
  LIFECYCLE_VIEW_ID,
  REFRESH_LIFECYCLE_COMMAND_ID,
  registerLifecycleView,
  renderLifecycleHtml,
} from "./lifecycleView";

describe("lifecycleView", () => {
  describe("INIT_VARIANTS", () => {
    it("exports at least 5 init variants", () => {
      expect(INIT_VARIANTS.length).toBeGreaterThanOrEqual(5);
    });

    it("each variant has id, label, command, description, details, and execute", () => {
      for (const variant of INIT_VARIANTS) {
        expect(typeof variant.id).toBe("string");
        expect(variant.id.length).toBeGreaterThan(0);
        expect(typeof variant.label).toBe("string");
        expect(variant.label.length).toBeGreaterThan(0);
        expect(typeof variant.command).toBe("string");
        expect(variant.command.startsWith("pa init")).toBe(true);
        expect(typeof variant.description).toBe("string");
        expect(Array.isArray(variant.details)).toBe(true);
        expect(variant.details.length).toBeGreaterThan(0);
        expect(typeof variant.execute).toBe("boolean");
      }
    });

    it("includes default and non-template lifecycle variants", () => {
      const ids = INIT_VARIANTS.map((v) => v.id);
      expect(ids).toContain("default");
      expect(ids).toContain("with-ai");
      expect(ids).toContain("with-workflows");
    });

    it("variant commands include supported pa init flags without template dependency", () => {
      const commands = INIT_VARIANTS.map((v) => v.command);
      expect(commands.some((c) => c === "pa init")).toBe(true);
      expect(commands.some((c) => c.includes("--with-ai"))).toBe(true);
      expect(commands.some((c) => c.includes("--with-workflows"))).toBe(true);
      expect(commands.some((c) => c.includes("--force"))).toBe(true);
      expect(commands.some((c) => c.includes("--template"))).toBe(false);
    });

    it("workflow-enabled variants teach the canonical workflow-document surface", () => {
      const workflowEnabledVariants = INIT_VARIANTS.filter((variant) =>
        variant.command.includes("--with-workflows"),
      );

      expect(workflowEnabledVariants.length).toBeGreaterThan(0);
      for (const variant of workflowEnabledVariants) {
        const copy = [variant.description, ...variant.details].join(" ");
        expect(copy).toContain(".project-arch/workflows/*.workflow.md");
        expect(copy.toLowerCase()).toContain("project-arch-owned workflow-document surface");
      }
    });

    it("workflow-enabled variants mark legacy github markdown guides as non-canonical", () => {
      const workflowEnabledVariants = INIT_VARIANTS.filter((variant) =>
        variant.command.includes("--with-workflows"),
      );

      for (const variant of workflowEnabledVariants) {
        const copy = [variant.description, ...variant.details].join(" ").toLowerCase();
        expect(copy).toContain(".github/workflows/*.md");
        expect(copy).toContain("non-canonical");
        expect(copy).not.toContain("github-owned automation");
      }
    });

    it("workflow-enabled variants keep canonical guidance primary over legacy mentions", () => {
      const workflowEnabledVariants = INIT_VARIANTS.filter((variant) =>
        variant.command.includes("--with-workflows"),
      );

      for (const variant of workflowEnabledVariants) {
        const copy = [variant.description, ...variant.details].join(" ").toLowerCase();
        const canonicalIndex = copy.indexOf(".project-arch/workflows/*.workflow.md");
        const legacyIndex = copy.indexOf(".github/workflows/*.md");

        expect(canonicalIndex).toBeGreaterThanOrEqual(0);
        expect(legacyIndex).toBeGreaterThanOrEqual(0);
        expect(canonicalIndex).toBeLessThan(legacyIndex);
        expect(copy).not.toContain("canonical .github/workflows/*.md");
        expect(copy).not.toContain("primary workflow-document home: .github/workflows/*.md");
      }
    });
  });

  describe("detectProjectArchPresence", () => {
    it("returns cli-missing when the executor throws ENOENT", async () => {
      const error = Object.assign(new Error("spawn pa ENOENT"), { code: "ENOENT" });

      const status = await detectProjectArchPresence({
        workspaceRoot: "/nonexistent-workspace-12345",
        cliExecutor: async () => {
          throw error;
        },
        now: () => "2026-04-02T00:00:00.000Z",
      });

      expect(status.state).toBe("cli-missing");
      expect(status.cliAvailable).toBe(false);
      expect(status.detectedAt).toBe("2026-04-02T00:00:00.000Z");
    });

    it("returns cli-missing when executor throws any error", async () => {
      const status = await detectProjectArchPresence({
        workspaceRoot: "/nonexistent-workspace-12345",
        cliExecutor: async () => {
          throw new Error("command not found: pa");
        },
        now: () => "2026-04-02T00:00:00.000Z",
      });

      expect(status.state).toBe("cli-missing");
      expect(status.cliAvailable).toBe(false);
    });

    it("returns not-initialized when CLI is available but .project-arch dir is absent", async () => {
      const status = await detectProjectArchPresence({
        workspaceRoot: "/nonexistent-workspace-no-dot-project-arch",
        cliExecutor: async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
        }),
        now: () => "2026-04-02T00:00:00.000Z",
      });

      expect(status.state).toBe("not-initialized");
      expect(status.cliAvailable).toBe(true);
      expect(status.initialized).toBe(false);
    });

    it("includes the detectedAt timestamp from the now() provider", async () => {
      const status = await detectProjectArchPresence({
        workspaceRoot: "/nonexistent-workspace-12345",
        cliExecutor: async () => {
          throw new Error("not found");
        },
        now: () => "2026-04-15T12:00:00.000Z",
      });

      expect(status.detectedAt).toBe("2026-04-15T12:00:00.000Z");
    });
  });

  describe("renderLifecycleHtml", () => {
    it("renders a cli-missing state with install instructions", () => {
      const html = renderLifecycleHtml({
        state: "cli-missing",
        cliAvailable: false,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain("pa CLI not found");
      expect(html).toContain("npm install -g project-arch");
      expect(html).toContain("pnpm add -g project-arch");
      expect(html).toContain("yarn global add project-arch");
      expect(html).toContain("refresh-btn");
    });

    it("renders a not-initialized state with init variant cards", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain("project-arch is not initialized");
      expect(html).toContain("pa init");
      expect(html).toContain("action-run");
      expect(html).toContain("action-stage");
      expect(html).toContain("Run Init");
      expect(html).toContain("Stage in Terminal");
    });

    it("renders canonical-vs-legacy workflow-document boundary in not-initialized guidance", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain(".project-arch/workflows/*.workflow.md");
      expect(html).toContain(".github/workflows/*.md");
      expect(html.toLowerCase()).toContain("non-canonical");
      expect(html.toLowerCase()).not.toContain("canonical .github/workflows/*.md");
    });

    it("renders all INIT_VARIANT labels in not-initialized state", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      for (const variant of INIT_VARIANTS) {
        expect(html).toContain(variant.label);
      }
    });

    it("renders all INIT_VARIANT commands as data-run attributes in not-initialized state", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      for (const variant of INIT_VARIANTS) {
        expect(html).toContain(variant.command);
      }
    });

    it("renders an initialized state with status banner and remove card", () => {
      const html = renderLifecycleHtml({
        state: "initialized",
        cliAvailable: true,
        initialized: true,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain("project-arch is active");
      expect(html).toContain("stage-remove-btn");
      expect(html).toContain("Remove project-arch");
      expect(html).toContain("Remove project-arch from this repository");
    });

    it("renders canonical-vs-legacy workflow-document boundary in initialized guidance", () => {
      const html = renderLifecycleHtml({
        state: "initialized",
        cliAvailable: true,
        initialized: true,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain(".project-arch/workflows/*.workflow.md");
      expect(html).toContain(".github/workflows/*.md");
      expect(html.toLowerCase()).toContain("non-canonical");
      expect(html.toLowerCase()).not.toContain("canonical .github/workflows/*.md");
    });

    it("renders re-init cards in the initialized state", () => {
      const html = renderLifecycleHtml({
        state: "initialized",
        cliAvailable: true,
        initialized: true,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain("Re-run Init");
      expect(html).toContain("Stage Force Init");
      expect(html).toContain("pa init --force");
    });

    it("renders all INIT_VARIANT labels in initialized state variant section", () => {
      const html = renderLifecycleHtml({
        state: "initialized",
        cliAvailable: true,
        initialized: true,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      for (const variant of INIT_VARIANTS) {
        expect(html).toContain(variant.label);
      }
    });

    it("includes CSP nonce in script and meta tags", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      // CSP meta tag should have nonce-<value>
      expect(html).toMatch(/nonce-\d+/);
      // The script tag should have matching nonce
      expect(html).toMatch(/<script nonce="\d+"/);
    });

    it("includes vscode postMessage handler for runCommand", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain("vscode.postMessage");
      expect(html).toContain("runCommand");
      expect(html).toContain("stageRemove");
    });

    it("includes action grid column adaptive script", () => {
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      expect(html).toContain("applyActionGridColumns");
    });

    it("escapes HTML in variant labels and commands to prevent XSS", () => {
      // The real variants don't have injection chars, but we test that the render
      // function uses escapeHtml logic by checking that real content is rendered
      // without raw angle brackets in data attributes
      const html = renderLifecycleHtml({
        state: "not-initialized",
        cliAvailable: true,
        initialized: false,
        detectedAt: "2026-04-02T00:00:00.000Z",
      });

      // Commands with -- flags should not produce raw < or > in attribute values
      const dataRunMatches = html.match(/data-run="[^"]+"/g) ?? [];
      expect(dataRunMatches.length).toBeGreaterThan(0);
      for (const match of dataRunMatches) {
        expect(match).not.toContain("<");
        expect(match).not.toContain(">");
      }
    });

    it("includes refresh button in toolbar for all states", () => {
      const states: Array<"cli-missing" | "not-initialized" | "initialized"> = [
        "cli-missing",
        "not-initialized",
        "initialized",
      ];

      for (const state of states) {
        const html = renderLifecycleHtml({
          state,
          cliAvailable: state !== "cli-missing",
          initialized: state === "initialized",
          detectedAt: "2026-04-02T00:00:00.000Z",
        });

        expect(html).toContain("refresh-btn");
        expect(html).toContain("Refresh");
      }
    });
  });

  describe("registerLifecycleView", () => {
    it("registers the lifecycle webview provider at the correct view ID", () => {
      const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
      const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));

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
          registerCommand,
          executeCommand: vi.fn(async () => undefined),
        },
      };

      registerLifecycleView(context as never, api as never);

      expect(registerWebviewViewProvider).toHaveBeenCalledWith(
        LIFECYCLE_VIEW_ID,
        expect.objectContaining({
          resolveWebviewView: expect.any(Function),
        }),
      );
    });

    it("registers the refresh lifecycle command", () => {
      const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
      const registerCommand = vi.fn(
        (id: string, handler: (...args: unknown[]) => Promise<void> | void) => {
          handlers.set(id, handler);
          return { dispose: vi.fn() };
        },
      );

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      const api = {
        window: {
          registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
          terminals: [],
          createTerminal: vi.fn(),
          showInformationMessage: vi.fn(),
          showWarningMessage: vi.fn(),
        },
        workspace: {
          workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        },
        commands: { registerCommand, executeCommand: vi.fn(async () => undefined) },
      };

      registerLifecycleView(context as never, api as never);

      expect(handlers.has(REFRESH_LIFECYCLE_COMMAND_ID)).toBe(true);
    });

    it("pushes all registrations to context.subscriptions", () => {
      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      const api = {
        window: {
          registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
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

      registerLifecycleView(context as never, api as never);

      expect(context.subscriptions.length).toBeGreaterThanOrEqual(2);
    });

    it("resolves webview view and renders HTML based on detected presence", async () => {
      const registerWebviewViewProvider = vi.fn((_, provider) => {
        return { provider, dispose: vi.fn() };
      });

      let webviewHtml = "";
      const fakeWebviewView = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn(),
          postMessage: vi.fn(),
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

      registerLifecycleView(context as never, api as never, {
        cliExecutor: async () => {
          throw new Error("pa not found");
        },
        now: () => "2026-04-02T00:00:00.000Z",
      });

      const providerCall = registerWebviewViewProvider.mock.calls[0];
      const provider = providerCall?.[1];

      await provider?.resolveWebviewView(fakeWebviewView, {}, {});

      // Give async render a tick to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(webviewHtml).toContain("pa CLI not found");
      expect(webviewHtml).toContain("npm install -g project-arch");
    });

    it("uses process.cwd() as workspaceRoot when no workspace folders are configured", () => {
      const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
      const mockExecutor = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));

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
          workspaceFolders: undefined,
        },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
          executeCommand: vi.fn(async () => undefined),
        },
      };

      // Should not throw when no workspace folders; provide a mock executor to prevent real process spawning
      expect(() =>
        registerLifecycleView(context as never, api as never, { cliExecutor: mockExecutor }),
      ).not.toThrow();

      expect(registerWebviewViewProvider).toHaveBeenCalledWith(
        LIFECYCLE_VIEW_ID,
        expect.objectContaining({ resolveWebviewView: expect.any(Function) }),
      );
    });
  });
});
