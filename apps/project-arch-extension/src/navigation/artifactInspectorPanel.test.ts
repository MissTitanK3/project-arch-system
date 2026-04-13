import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildArtifactInspectorModelFromFile,
  classifyArtifactSurface,
  OPEN_ARTIFACT_FILE_COMMAND_ID,
  OPEN_ARTIFACT_INSPECTOR_COMMAND_ID,
  registerArtifactInspectorPanel,
  renderArtifactInspectorHtml,
} from "./artifactInspectorPanel";

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-inspector-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
}

describe("artifactInspectorPanel", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const target = tempRoots.pop();
      if (!target) {
        continue;
      }

      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it("classifies canonical artifact surfaces from repository-backed paths", () => {
    expect(
      classifyArtifactSurface("/.project-arch/agent-runtime/contracts/run-1.json", "run"),
    ).toBe("contract");
    expect(classifyArtifactSurface("/.project-arch/agent-runtime/results/run-1.json", "run")).toBe(
      "result",
    );
    expect(classifyArtifactSurface("/.project-arch/reconcile/001-2026-04-02.md", "diff")).toBe(
      "reconcile-report",
    );
    expect(classifyArtifactSurface("/feedback/phases/x/tasks/planned/001-task.md", "task")).toBe(
      "task-doc",
    );
  });

  it("builds a file-backed inspector model from canonical artifact files", async () => {
    const root = await createTempWorkspace();
    const relativePath = ".project-arch/agent-runtime/prompts/run-2026-04-02-100000.md";
    await writeFile(root, relativePath, "# Prompt\n\nInspect this artifact.");

    const model = await buildArtifactInspectorModelFromFile({
      workspaceRoot: root,
      entry: {
        kind: "run",
        relativePath,
        label: "run-2026-04-02-100000",
      },
    });

    expect(model.surface).toBe("prompt");
    expect(model.isMarkdown).toBe(true);
    expect(model.relativePath).toBe(relativePath);
    expect(model.content).toContain("Inspect this artifact");
    expect(model.sizeBytes).toBeGreaterThan(0);
  });

  it("renders tabbed inspector HTML with file-backed metadata", async () => {
    const root = await createTempWorkspace();
    const relativePath = ".project-arch/agent-runtime/runs/run-2026-04-02-100500.json";
    await writeFile(root, relativePath, '{"status":"validation-passed"}');

    const model = await buildArtifactInspectorModelFromFile({
      workspaceRoot: root,
      entry: {
        kind: "run",
        relativePath,
        label: "run-2026-04-02-100500",
      },
    });
    const html = renderArtifactInspectorHtml(model);

    expect(html).toContain("Overview");
    expect(html).toContain("Content");
    expect(html).toContain("Related");
    expect(html).toContain(relativePath);
    expect(html).toContain("validation-passed");
  });

  it("resolves canonical linked artifacts across task, run, reconcile, and audit files", async () => {
    const root = await createTempWorkspace();
    const taskPath = "feedback/phases/p/milestones/m/tasks/planned/001-first-task.md";
    const runPath = ".project-arch/agent-runtime/runs/run-2026-04-02-120000.json";
    const resultPath = ".project-arch/agent-runtime/results/run-2026-04-02-120000.json";
    const reportPath = ".project-arch/reconcile/001-2026-04-02.json";
    const auditPath = ".project-arch/agent-runtime/logs/execution.jsonl";

    await writeFile(
      root,
      taskPath,
      ["---", 'id: "001"', 'title: "First task"', "---", "", "Task body"].join("\n"),
    );
    await writeFile(
      root,
      runPath,
      JSON.stringify(
        {
          schemaVersion: "2.0",
          runId: "run-2026-04-02-120000",
          taskId: "001",
          resultPath,
          contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
          reconciliationReportPath: reportPath,
        },
        null,
        2,
      ),
    );
    await writeFile(root, resultPath, JSON.stringify({ runId: "run-2026-04-02-120000" }, null, 2));
    await writeFile(
      root,
      ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
      JSON.stringify({ runId: "run-2026-04-02-120000" }, null, 2),
    );
    await writeFile(
      root,
      ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
      "# Prompt",
    );
    await writeFile(
      root,
      reportPath,
      JSON.stringify({ runId: "run-2026-04-02-120000", taskId: "001" }, null, 2),
    );
    await writeFile(
      root,
      auditPath,
      JSON.stringify({ runId: "run-2026-04-02-120000", taskId: "001", command: "validate" }) + "\n",
    );

    const model = await buildArtifactInspectorModelFromFile({
      workspaceRoot: root,
      entry: {
        kind: "task",
        relativePath: taskPath,
        label: "001 First task",
      },
    });

    expect(model.linkedArtifacts.some((artifact) => artifact.relativePath === runPath)).toBe(true);
    expect(model.linkedArtifacts.some((artifact) => artifact.relativePath === reportPath)).toBe(
      true,
    );
    expect(model.linkedArtifacts.some((artifact) => artifact.relativePath === auditPath)).toBe(
      true,
    );
  });

  it("opens artifact files through a predictable file-backed command path", async () => {
    const root = await createTempWorkspace();
    const relativePath = ".project-arch/agent-runtime/results/run-2026-04-02-130000.json";
    await writeFile(root, relativePath, '{"ok":true}');

    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    const executeCommand = vi.fn(async () => undefined);
    const api = {
      commands: {
        registerCommand: vi.fn(
          (id: string, handler: (...args: unknown[]) => Promise<void> | void) => {
            handlers.set(id, handler);
            return { dispose: vi.fn() };
          },
        ),
        executeCommand,
      },
      Uri: {
        file: (value: string) => ({ fsPath: value }),
      },
      window: {
        showWarningMessage: vi.fn(async () => undefined),
        createWebviewPanel: vi.fn(),
        activeTextEditor: undefined,
      },
    };
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };

    registerArtifactInspectorPanel(context as never, api as never, root);
    const openFile = handlers.get(OPEN_ARTIFACT_FILE_COMMAND_ID);
    if (!openFile) {
      throw new Error("Expected open artifact file command to be registered");
    }

    await openFile({ kind: "run", relativePath, label: "run-2026-04-02-130000" });

    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      { fsPath: path.join(root, relativePath) },
      expect.objectContaining({
        preview: false,
        preserveFocus: false,
      }),
    );
  });

  it("warns when opening inspector for a missing artifact path", async () => {
    const root = await createTempWorkspace();
    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    const showWarningMessage = vi.fn(async () => undefined);

    const api = {
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
      window: {
        showWarningMessage,
        createWebviewPanel: vi.fn(),
        activeTextEditor: undefined,
      },
    };
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };

    registerArtifactInspectorPanel(context as never, api as never, root);
    const openInspector = handlers.get(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID);
    if (!openInspector) {
      throw new Error("Expected open artifact inspector command to be registered");
    }

    await openInspector({
      kind: "task",
      relativePath: "feedback/phases/p/milestones/m/tasks/planned/001-missing-task.md",
      label: "001 Missing task",
    });

    expect(showWarningMessage).toHaveBeenCalledWith(
      "Project Arch: Artifact file is missing: feedback/phases/p/milestones/m/tasks/planned/001-missing-task.md",
    );
  });

  it("supports opening inspector from command palette when no entry argument is provided", async () => {
    const root = await createTempWorkspace();
    const relativePath = "feedback/phases/p/milestones/m/tasks/planned/001-picked-task.md";
    await writeFile(
      root,
      relativePath,
      ["---", 'id: "001"', 'title: "Picked task"', "---", "", "Body"].join("\n"),
    );

    const handlers = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    const showWarningMessage = vi.fn(async () => undefined);
    const panel = {
      title: "",
      webview: {
        html: "",
        onDidReceiveMessage: vi.fn(),
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
    };

    const api = {
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
      window: {
        showWarningMessage,
        showQuickPick: vi.fn(async (items: Array<{ entry: unknown }>) => items[0]),
        createWebviewPanel: vi.fn(() => panel),
        activeTextEditor: undefined,
      },
    };
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };

    registerArtifactInspectorPanel(context as never, api as never, root);
    const openInspector = handlers.get(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID);
    if (!openInspector) {
      throw new Error("Expected open artifact inspector command to be registered");
    }

    await openInspector();

    expect(api.window.showQuickPick).toHaveBeenCalled();
    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(api.window.createWebviewPanel).toHaveBeenCalled();
  });
});
