import { promises as fs } from "node:fs";
import path from "node:path";
import type * as vscode from "vscode";
import type { ArtifactKind, ArtifactNavigationEntry } from "./artifactNavigationModel";
import { buildArtifactNavigationModel } from "./artifactNavigationModel";

export const OPEN_ARTIFACT_INSPECTOR_COMMAND_ID = "projectArch.openArtifactInspector" as const;
export const OPEN_ARTIFACT_FILE_COMMAND_ID = "projectArch.openArtifactFile" as const;

export interface OpenArtifactFileOptions {
  preview?: boolean;
  preserveFocus?: boolean;
  viewColumn?: number;
}

export type ArtifactSurface =
  | "task-doc"
  | "contract"
  | "prompt"
  | "result"
  | "run-record"
  | "reconcile-report"
  | "audit-log"
  | "unknown";

export interface LinkedArtifact {
  kind: ArtifactKind;
  relativePath: string;
  label: string;
  reason: string;
}

export interface ArtifactInspectorModel {
  kind: ArtifactKind;
  surface: ArtifactSurface;
  relativePath: string;
  absolutePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  content: string;
  isMarkdown: boolean;
  isJson: boolean;
  linkedArtifacts: LinkedArtifact[];
}

interface RunRecordShape {
  runId?: string;
  taskId?: string;
  resultPath?: string;
  contractPath?: string;
  reconciliationReportPath?: string;
}

interface ReconcileReportShape {
  runId?: string;
  taskId?: string;
}

export function classifyArtifactSurface(relativePath: string, kind: ArtifactKind): ArtifactSurface {
  if (kind === "task") {
    return "task-doc";
  }

  if (relativePath.includes("/.project-arch/agent-runtime/contracts/")) {
    return "contract";
  }

  if (relativePath.includes("/.project-arch/agent-runtime/prompts/")) {
    return "prompt";
  }

  if (relativePath.includes("/.project-arch/agent-runtime/results/")) {
    return "result";
  }

  if (relativePath.includes("/.project-arch/agent-runtime/runs/")) {
    return "run-record";
  }

  if (relativePath.includes("/.project-arch/reconcile/")) {
    return "reconcile-report";
  }

  if (relativePath.includes("/.project-arch/agent-runtime/logs/")) {
    return "audit-log";
  }

  return "unknown";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function extensionKind(relativePath: string): { isMarkdown: boolean; isJson: boolean } {
  const extension = path.extname(relativePath).toLowerCase();
  return {
    isMarkdown: extension === ".md" || extension === ".markdown",
    isJson: extension === ".json" || extension === ".jsonl",
  };
}

function uniqueLinkedArtifacts(input: LinkedArtifact[]): LinkedArtifact[] {
  const seen = new Set<string>();
  const output: LinkedArtifact[] = [];

  for (const link of input) {
    const key = `${link.kind}:${link.relativePath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(link);
  }

  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

function inferKindFromPath(relativePath: string): ArtifactKind {
  if (relativePath.includes("/.project-arch/agent-runtime/logs/")) {
    return "audit";
  }

  if (relativePath.includes("/.project-arch/reconcile/")) {
    return "diff";
  }

  if (relativePath.includes("/tasks/")) {
    return "task";
  }

  return "run";
}

function runIdFromPath(relativePath: string): string | undefined {
  const match = relativePath.match(/(run-\d{4}-\d{2}-\d{2}-\d{6})/);
  return match?.[1];
}

function taskIdFromPath(relativePath: string): string | undefined {
  const fileName = path.basename(relativePath);
  return fileName.match(/^(\d{3})-/)?.[1];
}

function taskIdFromMarkdown(content: string): string | undefined {
  const match = content.match(/^id\s*:\s*"?(\d{3})"?\s*$/m);
  return match?.[1];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(rootDir: string): Promise<string[]> {
  if (!(await pathExists(rootDir))) {
    return [];
  }

  const output: string[] = [];
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        output.push(absolutePath);
      }
    }
  }

  return output;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function asRunRecord(value: Record<string, unknown>): RunRecordShape {
  return {
    runId: typeof value["runId"] === "string" ? value["runId"] : undefined,
    taskId: typeof value["taskId"] === "string" ? value["taskId"] : undefined,
    resultPath: typeof value["resultPath"] === "string" ? value["resultPath"] : undefined,
    contractPath: typeof value["contractPath"] === "string" ? value["contractPath"] : undefined,
    reconciliationReportPath:
      typeof value["reconciliationReportPath"] === "string"
        ? value["reconciliationReportPath"]
        : undefined,
  };
}

function asReconcileReport(value: Record<string, unknown>): ReconcileReportShape {
  return {
    runId: typeof value["runId"] === "string" ? value["runId"] : undefined,
    taskId: typeof value["taskId"] === "string" ? value["taskId"] : undefined,
  };
}

async function findTaskFileById(
  workspaceRoot: string,
  taskId: string,
): Promise<string | undefined> {
  const candidates = [path.join(workspaceRoot, "feedback"), path.join(workspaceRoot, "roadmap")];
  for (const root of candidates) {
    const files = await walkFiles(root);
    for (const absolutePath of files) {
      const relativePath = toRelativePath(workspaceRoot, absolutePath);
      if (!relativePath.endsWith(".md") || !relativePath.includes("/tasks/")) {
        continue;
      }

      if (path.basename(relativePath).startsWith(`${taskId}-`)) {
        return relativePath;
      }

      const content = await fs.readFile(absolutePath, "utf8");
      if (taskIdFromMarkdown(content) === taskId) {
        return relativePath;
      }
    }
  }

  return undefined;
}

async function findRunRecordsByTaskId(
  workspaceRoot: string,
  taskId: string,
): Promise<Array<{ relativePath: string; runId?: string }>> {
  const runsDir = path.join(workspaceRoot, ".project-arch/agent-runtime/runs");
  const files = await walkFiles(runsDir);
  const output: Array<{ relativePath: string; runId?: string }> = [];

  for (const absolutePath of files) {
    if (!absolutePath.endsWith(".json")) {
      continue;
    }
    const data = await readJsonObject(absolutePath);
    if (!data) {
      continue;
    }
    const runRecord = asRunRecord(data);
    if (runRecord.taskId !== taskId) {
      continue;
    }

    output.push({
      relativePath: toRelativePath(workspaceRoot, absolutePath),
      runId: runRecord.runId,
    });
  }

  return output;
}

async function findReconcileReportByRunId(
  workspaceRoot: string,
  runId: string,
): Promise<string | undefined> {
  const reconcileDir = path.join(workspaceRoot, ".project-arch/reconcile");
  const files = await walkFiles(reconcileDir);
  for (const absolutePath of files) {
    if (!absolutePath.endsWith(".json")) {
      continue;
    }

    const payload = await readJsonObject(absolutePath);
    if (!payload) {
      continue;
    }

    const report = asReconcileReport(payload);
    if (report.runId === runId) {
      return toRelativePath(workspaceRoot, absolutePath);
    }
  }

  return undefined;
}

async function buildLinkedArtifacts(input: {
  workspaceRoot: string;
  kind: ArtifactKind;
  relativePath: string;
  content: string;
}): Promise<LinkedArtifact[]> {
  const links: LinkedArtifact[] = [];
  const auditLogPath = ".project-arch/agent-runtime/logs/execution.jsonl";
  const normalizedPath = `/${input.relativePath}`;
  const surface = classifyArtifactSurface(normalizedPath, input.kind);

  const addLink = (relativePath: string, reason: string): void => {
    links.push({
      kind: inferKindFromPath(`/${relativePath}`),
      relativePath,
      label: path.basename(relativePath),
      reason,
    });
  };

  if (surface === "task-doc") {
    const taskId = taskIdFromMarkdown(input.content) ?? taskIdFromPath(input.relativePath);
    if (taskId) {
      const runRecords = await findRunRecordsByTaskId(input.workspaceRoot, taskId);
      for (const runRecord of runRecords) {
        addLink(runRecord.relativePath, `Run record for task ${taskId}`);
        if (runRecord.runId) {
          const reportPath = await findReconcileReportByRunId(input.workspaceRoot, runRecord.runId);
          if (reportPath) {
            addLink(reportPath, `Reconcile report for ${runRecord.runId}`);
          }
        }
      }
      addLink(auditLogPath, `Audit log with entries for task ${taskId}`);
    }
  }

  if (surface === "run-record") {
    const data = await readJsonObject(path.join(input.workspaceRoot, input.relativePath));
    if (data) {
      const runRecord = asRunRecord(data);
      const runId = runRecord.runId ?? runIdFromPath(input.relativePath);
      const taskId = runRecord.taskId;

      if (runRecord.contractPath) {
        addLink(runRecord.contractPath, "Contract artifact for this run");
      }
      if (runRecord.resultPath) {
        addLink(runRecord.resultPath, "Result artifact for this run");
      }
      if (runRecord.reconciliationReportPath) {
        addLink(runRecord.reconciliationReportPath, "Reconcile report from this run");
      }

      if (runId) {
        addLink(`.project-arch/agent-runtime/prompts/${runId}.md`, "Prompt artifact for this run");
      }

      if (taskId) {
        const taskPath = await findTaskFileById(input.workspaceRoot, taskId);
        if (taskPath) {
          addLink(taskPath, `Task source ${taskId}`);
        }
      }

      addLink(auditLogPath, `Audit log with events for ${runId ?? taskId ?? "this run"}`);
    }
  }

  if (surface === "reconcile-report") {
    const taskId = taskIdFromPath(input.relativePath);
    const payload = input.relativePath.endsWith(".json")
      ? await readJsonObject(path.join(input.workspaceRoot, input.relativePath))
      : undefined;
    const runIdFromPayload = payload ? asReconcileReport(payload).runId : undefined;
    const runId = runIdFromPayload ?? runIdFromPath(input.content);

    if (runId) {
      addLink(`.project-arch/agent-runtime/runs/${runId}.json`, `Run record for ${runId}`);
      addLink(`.project-arch/agent-runtime/results/${runId}.json`, `Result artifact for ${runId}`);
      addLink(
        `.project-arch/agent-runtime/contracts/${runId}.json`,
        `Contract artifact for ${runId}`,
      );
    }

    if (taskId) {
      const taskPath = await findTaskFileById(input.workspaceRoot, taskId);
      if (taskPath) {
        addLink(taskPath, `Task source ${taskId}`);
      }
      addLink(auditLogPath, `Audit log with entries for task ${taskId}`);
    }
  }

  if (surface === "audit-log") {
    const runIds = new Set<string>();
    for (const line of input.content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        const runId = typeof event["runId"] === "string" ? event["runId"] : undefined;
        if (runId) {
          runIds.add(runId);
        }
      } catch {
        continue;
      }
    }

    for (const runId of Array.from(runIds).slice(0, 8)) {
      addLink(
        `.project-arch/agent-runtime/runs/${runId}.json`,
        `Run record referenced by audit (${runId})`,
      );
    }
  }

  if (surface === "contract" || surface === "prompt" || surface === "result") {
    const runId = runIdFromPath(input.relativePath);
    if (runId) {
      addLink(`.project-arch/agent-runtime/runs/${runId}.json`, `Run record for ${runId}`);
      addLink(
        `.project-arch/agent-runtime/contracts/${runId}.json`,
        `Contract artifact for ${runId}`,
      );
      addLink(`.project-arch/agent-runtime/prompts/${runId}.md`, `Prompt artifact for ${runId}`);
      addLink(`.project-arch/agent-runtime/results/${runId}.json`, `Result artifact for ${runId}`);

      const reportPath = await findReconcileReportByRunId(input.workspaceRoot, runId);
      if (reportPath) {
        addLink(reportPath, `Reconcile report for ${runId}`);
      }
      addLink(auditLogPath, `Audit log with events for ${runId}`);
    }
  }

  const existingLinks: LinkedArtifact[] = [];
  for (const link of links) {
    const exists = await pathExists(path.join(input.workspaceRoot, link.relativePath));
    if (exists && link.relativePath !== input.relativePath) {
      existingLinks.push(link);
    }
  }

  return uniqueLinkedArtifacts(existingLinks);
}

export async function buildArtifactInspectorModelFromFile(input: {
  workspaceRoot: string;
  entry: ArtifactNavigationEntry;
}): Promise<ArtifactInspectorModel> {
  const absolutePath = path.join(input.workspaceRoot, input.entry.relativePath);
  const [stat, content] = await Promise.all([
    fs.stat(absolutePath),
    fs.readFile(absolutePath, "utf8"),
  ]);
  const extension = extensionKind(input.entry.relativePath);
  const linkedArtifacts = await buildLinkedArtifacts({
    workspaceRoot: input.workspaceRoot,
    kind: input.entry.kind,
    relativePath: input.entry.relativePath,
    content,
  });

  return {
    kind: input.entry.kind,
    surface: classifyArtifactSurface(`/${input.entry.relativePath}`, input.entry.kind),
    relativePath: input.entry.relativePath,
    absolutePath,
    fileName: path.basename(input.entry.relativePath),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content,
    isMarkdown: extension.isMarkdown,
    isJson: extension.isJson,
    linkedArtifacts,
  };
}

export function renderArtifactInspectorHtml(model: ArtifactInspectorModel): string {
  const escapedPath = escapeHtml(model.relativePath);
  const escapedContent = escapeHtml(model.content);
  const escapedSurface = escapeHtml(model.surface);
  const escapedKind = escapeHtml(model.kind);
  const prettySize = escapeHtml(formatBytes(model.sizeBytes));
  const relatedRows =
    model.linkedArtifacts.length === 0
      ? "<p>No canonical linked artifacts detected for this file.</p>"
      : `<ul>${model.linkedArtifacts
          .map(
            (link, index) =>
              `<li><strong>${escapeHtml(link.label)}</strong> <span>(${escapeHtml(link.reason)})</span> <button class="secondary link-open" data-index="${index}">Open</button> <button class="secondary link-open-file" data-index="${index}">Open File</button></li>`,
          )
          .join("")}</ul>`;
  const linkDataJson = JSON.stringify(model.linkedArtifacts);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        margin: 0;
        padding: 12px;
      }
      .toolbar {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      button {
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        border: 1px solid transparent;
        border-radius: 2px;
        padding: 4px 10px;
        cursor: pointer;
      }
      button.secondary {
        color: var(--vscode-foreground);
        background: var(--vscode-editorWidget-background);
        border-color: var(--vscode-editorWidget-border);
      }
      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }
      .tab {
        padding: 6px 10px;
        border: 1px solid var(--vscode-editorWidget-border);
        background: var(--vscode-editorWidget-background);
      }
      .tab.active {
        border-bottom-color: var(--vscode-focusBorder);
      }
      .panel { display: none; }
      .panel.active { display: block; }
      .meta {
        display: grid;
        grid-template-columns: 120px auto;
        gap: 8px 12px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: var(--vscode-textCodeBlock-background);
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 4px;
        padding: 10px;
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button id="openRaw">Open File</button>
      <button class="secondary" id="reveal">Reveal in Explorer</button>
      ${model.isMarkdown ? '<button class="secondary" id="preview">Open Preview</button>' : ""}
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="content">Content</button>
      <button class="tab" data-tab="related">Related</button>
    </div>
    <section class="panel active" data-panel="overview">
      <div class="meta">
        <strong>Path</strong><span>${escapedPath}</span>
        <strong>Kind</strong><span>${escapedKind}</span>
        <strong>Surface</strong><span>${escapedSurface}</span>
        <strong>Size</strong><span>${prettySize}</span>
        <strong>Modified</strong><span>${escapeHtml(model.modifiedAt)}</span>
      </div>
    </section>
    <section class="panel" data-panel="content">
      <pre>${escapedContent}</pre>
    </section>
    <section class="panel" data-panel="related">
      ${relatedRows}
    </section>
    <script>
      const vscode = acquireVsCodeApi();
      const links = ${linkDataJson};

      const tabButtons = [...document.querySelectorAll('.tab')];
      const panels = [...document.querySelectorAll('.panel')];

      for (const button of tabButtons) {
        button.addEventListener('click', () => {
          const target = button.dataset.tab;
          tabButtons.forEach((tab) => tab.classList.toggle('active', tab === button));
          panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === target));
        });
      }

      document.getElementById('openRaw')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openRaw' });
      });

      document.getElementById('reveal')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'reveal' });
      });

      document.getElementById('preview')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'preview' });
      });

      for (const button of document.querySelectorAll('.link-open')) {
        button.addEventListener('click', () => {
          const index = Number(button.getAttribute('data-index'));
          if (Number.isInteger(index) && links[index]) {
            vscode.postMessage({ type: 'openLinkedInspector', link: links[index] });
          }
        });
      }

      for (const button of document.querySelectorAll('.link-open-file')) {
        button.addEventListener('click', () => {
          const index = Number(button.getAttribute('data-index'));
          if (Number.isInteger(index) && links[index]) {
            vscode.postMessage({ type: 'openLinkedFile', link: links[index] });
          }
        });
      }
    </script>
  </body>
</html>`;
}

const inspectorPanelByPath = new Map<string, vscode.WebviewPanel>();

async function resolveEntryFromInput(input: {
  workspaceRoot: string;
  api: Pick<typeof vscode, "window">;
  entry?: ArtifactNavigationEntry;
}): Promise<ArtifactNavigationEntry | undefined> {
  if (input.entry) {
    return input.entry;
  }

  const model = await buildArtifactNavigationModel(input.workspaceRoot);
  const allEntries = model.groups.flatMap((group) => group.entries);
  if (allEntries.length === 0) {
    await input.api.window.showWarningMessage(
      "Project Arch: No canonical artifact files were found in this workspace.",
    );
    return undefined;
  }

  const picked = await input.api.window.showQuickPick(
    allEntries.map((entry) => ({
      label: entry.label,
      description: entry.description,
      detail: entry.relativePath,
      entry,
    })),
    {
      title: "Project Arch Artifacts",
      placeHolder: "Select a canonical artifact to open",
      ignoreFocusOut: true,
    },
  );

  return picked?.entry;
}

export function registerArtifactInspectorPanel(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "window" | "commands" | "Uri">,
  workspaceRoot: string,
): void {
  const openInspector = api.commands.registerCommand(
    OPEN_ARTIFACT_INSPECTOR_COMMAND_ID,
    async (entry?: ArtifactNavigationEntry) => {
      const resolvedEntry = await resolveEntryFromInput({
        workspaceRoot,
        api,
        entry,
      });
      if (!resolvedEntry) {
        return;
      }

      const absolutePath = path.join(workspaceRoot, resolvedEntry.relativePath);
      if (!(await pathExists(absolutePath))) {
        await api.window.showWarningMessage(
          `Project Arch: Artifact file is missing: ${resolvedEntry.relativePath}`,
        );
        return;
      }

      const model = await buildArtifactInspectorModelFromFile({
        workspaceRoot,
        entry: resolvedEntry,
      });

      const existingPanel = inspectorPanelByPath.get(model.absolutePath);
      if (existingPanel) {
        existingPanel.title = `Project Arch Artifact: ${model.fileName}`;
        existingPanel.webview.html = renderArtifactInspectorHtml(model);
        existingPanel.reveal();
        return;
      }

      const panel = api.window.createWebviewPanel(
        "projectArch.artifactInspector",
        `Project Arch Artifact: ${model.fileName}`,
        api.window.activeTextEditor?.viewColumn ?? 1,
        {
          enableScripts: true,
        },
      );

      panel.webview.html = renderArtifactInspectorHtml(model);
      inspectorPanelByPath.set(model.absolutePath, panel);

      panel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
        if (message.type === "openRaw") {
          await api.commands.executeCommand(OPEN_ARTIFACT_FILE_COMMAND_ID, {
            kind: model.kind,
            relativePath: model.relativePath,
            label: model.fileName,
          } as ArtifactNavigationEntry);
          return;
        }

        const fileUri = api.Uri.file(model.absolutePath);

        if (message.type === "reveal") {
          await api.commands.executeCommand("revealInExplorer", fileUri);
          return;
        }

        if (message.type === "preview" && model.isMarkdown) {
          await api.commands.executeCommand("markdown.showPreviewToSide", fileUri);
          return;
        }

        const linked = (message as { link?: LinkedArtifact }).link;
        if (!linked || typeof linked.relativePath !== "string" || typeof linked.kind !== "string") {
          return;
        }

        if (message.type === "openLinkedInspector") {
          await api.commands.executeCommand(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID, {
            kind: linked.kind,
            relativePath: linked.relativePath,
            label: linked.label,
            description: linked.reason,
          } as ArtifactNavigationEntry);
          return;
        }

        if (message.type === "openLinkedFile") {
          await api.commands.executeCommand(OPEN_ARTIFACT_FILE_COMMAND_ID, {
            kind: linked.kind,
            relativePath: linked.relativePath,
            label: linked.label,
            description: linked.reason,
          } as ArtifactNavigationEntry);
        }
      });

      panel.onDidDispose(() => {
        inspectorPanelByPath.delete(model.absolutePath);
      });
    },
  );

  const openFile = api.commands.registerCommand(
    OPEN_ARTIFACT_FILE_COMMAND_ID,
    async (entry?: ArtifactNavigationEntry, options?: OpenArtifactFileOptions) => {
      const resolvedEntry = await resolveEntryFromInput({
        workspaceRoot,
        api,
        entry,
      });
      if (!resolvedEntry) {
        return;
      }

      const absolutePath = path.join(workspaceRoot, resolvedEntry.relativePath);
      if (!(await pathExists(absolutePath))) {
        await api.window.showWarningMessage(
          `Project Arch: Artifact file is missing: ${resolvedEntry.relativePath}`,
        );
        return;
      }

      await api.commands.executeCommand("vscode.open", api.Uri.file(absolutePath), {
        preview: options?.preview ?? false,
        preserveFocus: options?.preserveFocus ?? false,
        viewColumn: options?.viewColumn,
      });
    },
  );

  context.subscriptions.push(openInspector);
  context.subscriptions.push(openFile);
}
