import type * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs";
import type { ProjectArchCliExecutor } from "../integration/projectArchBoundary";
import { defaultProjectArchCliExecutor } from "../integration/projectArchBoundary";
import {
  LIFECYCLE_SHELL_PANE_ID,
  LIFECYCLE_SHELL_SURFACE_ID,
  RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH,
} from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";

export const LIFECYCLE_VIEW_ID = "projectArch.lifecycle" as const;
export const REFRESH_LIFECYCLE_COMMAND_ID = "projectArch.refreshLifecycle" as const;
export const INIT_PROJECT_COMMAND_ID = "projectArch.initProject" as const;
export const REMOVE_PROJECT_COMMAND_ID = "projectArch.removeProject" as const;

export type PresenceState = "cli-missing" | "not-initialized" | "initialized";

export interface ProjectArchPresenceStatus {
  state: PresenceState;
  cliAvailable: boolean;
  initialized: boolean;
  detectedAt: string;
}

export interface InitVariant {
  id: string;
  label: string;
  command: string;
  description: string;
  details: string[];
  execute: boolean;
}

export interface LifecycleShellModel {
  status: ProjectArchPresenceStatus;
  initVariants: InitVariant[];
}

export const INIT_VARIANTS: InitVariant[] = [
  {
    id: "default",
    label: "Default",
    command: "pa init",
    description:
      "Standard project-arch scaffold: roadmap, architecture, agent skills, and runtime directories.",
    details: [
      "roadmap/ — phases, milestones, and task lanes",
      "architecture/ — specs, standards, governance, templates",
      "arch-domains/ — domain-level architecture surfaces",
      ".project-arch/ — tool state, configs, and runtime",
      ".arch/ — agent skill registry and user skills",
    ],
    execute: true,
  },
  {
    id: "with-ai",
    label: "Default + AI Integration",
    command: "pa init --with-ai",
    description:
      "Default scaffold with AI integration setup included—useful when using AI agents with this repository immediately.",
    details: ["Everything in the default scaffold", "AI integration setup surface included"],
    execute: true,
  },
  {
    id: "with-workflows",
    label: "Default + Workflows",
    command: "pa init --with-workflows",
    description:
      "Default scaffold with first-pass project-arch workflow documents materialized at .project-arch/workflows/*.workflow.md.",
    details: [
      "Everything in the default scaffold",
      "project-arch-owned workflow-document surface: .project-arch/workflows/*.workflow.md",
      "Legacy .github/workflows/*.md remains non-canonical compatibility context",
      "Reduces the number of follow-up commands needed after init",
    ],
    execute: true,
  },
  {
    id: "with-ai-workflows",
    label: "Default + AI + Workflows",
    command: "pa init --with-ai --with-workflows",
    description:
      "Default scaffold with AI integration setup and project-arch workflow documents materialized at .project-arch/workflows/*.workflow.md.",
    details: [
      "Everything in the default scaffold",
      "AI integration setup included",
      "project-arch-owned workflow-document surface: .project-arch/workflows/*.workflow.md",
      "Legacy .github/workflows/*.md remains non-canonical compatibility context",
      "Reduces the number of follow-up commands needed after init",
    ],
    execute: true,
  },
  {
    id: "force-reinit",
    label: "Reinitialize (Force Overwrite)",
    command: "pa init --force",
    description: "Re-runs init and overwrites managed project-arch files when conflicts exist.",
    details: [
      "Useful for repairing a drifted scaffold",
      "Overwrites managed files instead of skipping conflicts",
    ],
    execute: true,
  },
  {
    id: "force-with-ai-workflows",
    label: "Force Reinit + AI + Workflows",
    command: "pa init --force --with-ai --with-workflows",
    description:
      "Most aggressive repair path: overwrite managed scaffold files and include AI integration plus canonical workflow-document surfaces.",
    details: [
      "Everything in the default scaffold",
      "Force overwrite managed files",
      "AI integration setup included",
      "project-arch-owned workflow-document surface: .project-arch/workflows/*.workflow.md",
      "Legacy .github/workflows/*.md remains non-canonical compatibility context",
      "Use only when intentional overwrite is required",
    ],
    execute: true,
  },
];

export async function detectProjectArchPresence(input: {
  workspaceRoot: string;
  cliCommand?: string;
  cliExecutor?: ProjectArchCliExecutor;
  now?: () => string;
}): Promise<ProjectArchPresenceStatus> {
  const now = input.now ?? (() => new Date().toISOString());
  const executor = input.cliExecutor ?? defaultProjectArchCliExecutor;
  const cliCommand = input.cliCommand ?? "pa";

  // Any one of these directories being present indicates a project-arch scaffold exists.
  // .project-arch/ is the canonical signal; roadmap/ and architecture/ are created by every
  // init variant and serve as reliable fallback indicators.
  const scaffoldSignals = [
    path.join(input.workspaceRoot, ".project-arch"),
    path.join(input.workspaceRoot, "roadmap"),
    path.join(input.workspaceRoot, "architecture"),
  ];

  let cliAvailable: boolean;
  try {
    const result = await executor({
      command: cliCommand,
      args: ["doctor", "health", "--json"],
      cwd: input.workspaceRoot,
    });
    cliAvailable = result.exitCode === 0 || result.exitCode === 1;
  } catch {
    cliAvailable = false;
  }

  let initialized: boolean;
  try {
    initialized = scaffoldSignals.some((dir) => fs.existsSync(dir));
  } catch {
    initialized = false;
  }

  let state: PresenceState;
  if (!cliAvailable) {
    state = "cli-missing";
  } else if (!initialized) {
    state = "not-initialized";
  } else {
    state = "initialized";
  }

  return {
    state,
    cliAvailable,
    initialized,
    detectedAt: now(),
  };
}

export async function loadLifecycleShellModelSnapshot(input: {
  workspaceRoot: string;
  dependencies?: {
    cliCommand?: string;
    cliExecutor?: ProjectArchCliExecutor;
    now?: () => string;
  };
}): Promise<LifecycleShellModel> {
  return {
    status: await detectProjectArchPresence({
      workspaceRoot: input.workspaceRoot,
      cliCommand: input.dependencies?.cliCommand,
      cliExecutor: input.dependencies?.cliExecutor,
      now: input.dependencies?.now,
    }),
    initVariants: INIT_VARIANTS,
  };
}

export async function runLifecycleCommandInTerminalFlow(input: {
  windowApi: typeof vscode.window;
  command: string;
  execute: boolean;
}): Promise<void> {
  const terminal =
    input.windowApi.terminals.length > 0
      ? input.windowApi.terminals[0]
      : input.windowApi.createTerminal("Project Arch CLI");

  if (!terminal) {
    return;
  }

  terminal.show(true);
  terminal.sendText(input.command, input.execute);

  if (!input.execute) {
    await input.windowApi.showInformationMessage(
      `Project Arch: Staged '${input.command}' in terminal. Edit any placeholders, then press Enter.`,
    );
  }
}

export async function runLifecycleRemoveFlow(input: {
  windowApi: typeof vscode.window;
}): Promise<void> {
  const confirmed = await input.windowApi.showWarningMessage(
    "Project Arch: This will permanently remove all project-arch scaffold directories from this repository (roadmap/, architecture/, arch-domains/, arch-model/, .project-arch/, .arch/). This cannot be undone — ensure your changes are committed or backed up.",
    { modal: true },
    "Remove project-arch",
  );

  if (confirmed !== "Remove project-arch") {
    return;
  }

  const terminal =
    input.windowApi.terminals.length > 0
      ? input.windowApi.terminals[0]
      : input.windowApi.createTerminal("Project Arch CLI");

  if (!terminal) {
    return;
  }

  terminal.show(true);

  for (const line of REMOVE_COMMANDS) {
    terminal.sendText(line, true);
  }

  await input.windowApi.showInformationMessage(
    "Project Arch: Removal commands executed. Use Refresh to update the lifecycle view.",
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderVariantCard(variant: InitVariant): string {
  const detailList = variant.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");

  return `<article class="card">
    <div class="kind">Init Variant</div>
    <div class="title">${escapeHtml(variant.label)}</div>
    <div class="description">${escapeHtml(variant.description)}</div>
    <ul class="detail-list">${detailList}</ul>
    <div class="path-label">Command</div>
    <div class="path-value">${escapeHtml(variant.command)}</div>
    <div class="actions-section">
      <div class="actions">
        <button class="action-run" data-run="${escapeHtml(variant.command)}" data-execute="true">Run Init</button>
        <button class="action-stage" data-run="${escapeHtml(variant.command)}" data-execute="false">Stage in Terminal</button>
      </div>
    </div>
  </article>`;
}

function renderInitializedCard(): string {
  return `<article class="card card-initialized">
    <div class="kind">Status</div>
    <div class="title">project-arch is initialized</div>
    <div class="description">This repository already has a project-arch scaffold. You can re-run init to regenerate managed files or force-overwrite existing ones.</div>
    <div class="actions-section">
      <div class="actions-subheading">Re-initialize</div>
      <div class="actions">
        <button class="action-run" data-run="pa init" data-execute="true">Re-run Init</button>
        <button class="action-stage" data-run="pa init --force" data-execute="false">Stage Force Init</button>
      </div>
    </div>
  </article>`;
}

function renderRemoveCard(): string {
  return `<article class="card card-remove">
    <div class="kind">Project Lifecycle</div>
    <div class="title">Remove project-arch from this repository</div>
    <div class="description">Permanently removes all project-arch scaffold directories. A confirmation dialog will appear first — after confirming, the removal commands are executed in your terminal.</div>
    <ul class="detail-list">
      <li>Removes <code>roadmap/</code>, <code>architecture/</code>, <code>arch-domains/</code>, <code>arch-model/</code></li>
      <li>Removes <code>.project-arch/</code> tool state and <code>.arch/</code> agent skills</li>
      <li>Irreversible once executed — ensure changes are committed or backed up first</li>
    </ul>
    <div class="actions-section">
      <div class="actions">
        <button class="action-stage" id="stage-remove-btn">Remove project-arch</button>
      </div>
    </div>
  </article>`;
}

function renderCliMissingHtml(): string {
  return `<div class="status-banner status-missing">
    <strong>pa CLI not found</strong>
    <p>The <code>pa</code> command is not available. Install project-arch to use this extension.</p>
    <div class="install-steps">
      <div class="install-step"><span class="step-label">npm</span><code class="step-code">npm install -g project-arch</code></div>
      <div class="install-step"><span class="step-label">pnpm</span><code class="step-code">pnpm add -g project-arch</code></div>
      <div class="install-step"><span class="step-label">yarn</span><code class="step-code">yarn global add project-arch</code></div>
    </div>
    <p>After installing, click Refresh to re-detect CLI availability.</p>
  </div>`;
}

function renderNotInitializedBanner(): string {
  return `<div class="status-banner status-init">
    <strong>project-arch is not initialized in this repository</strong>
    <p>Choose an init variant below. Each card describes what the scaffold will create and provides a run or stage action.</p>
    <p>When workflow generation is enabled, canonical workflow documents are created at <code>.project-arch/workflows/*.workflow.md</code>. Legacy <code>.github/workflows/*.md</code> markdown guides are compatibility-only and non-canonical.</p>
  </div>`;
}

function renderInitializedBanner(): string {
  return `<div class="status-banner status-ok">
    <strong>project-arch is active in this repository</strong>
    <p>The scaffold is present. Use the cards below to re-initialize or to remove project-arch from this repository.</p>
    <p>Canonical workflow-document ownership remains <code>.project-arch/workflows/*.workflow.md</code>; legacy <code>.github/workflows/*.md</code> markdown guides are non-canonical compatibility context.</p>
  </div>`;
}

export function renderLifecycleHtml(status: ProjectArchPresenceStatus): string {
  const nonce = String(Date.now());

  let pageContent: string;

  if (status.state === "cli-missing") {
    pageContent = renderCliMissingHtml();
  } else if (status.state === "not-initialized") {
    const variantCards = INIT_VARIANTS.map((v) => renderVariantCard(v)).join("\n");
    pageContent = `${renderNotInitializedBanner()}<div class="grid">${variantCards}</div>`;
  } else {
    const variantCards = INIT_VARIANTS.map((v) => renderVariantCard(v)).join("\n");
    pageContent = `${renderInitializedBanner()}<div class="grid">${renderInitializedCard()}${renderRemoveCard()}</div><h2 class="section-heading">Init Variants</h2><div class="grid">${variantCards}</div>`;
  }

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
        .pa-shell-layout { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
        .pa-shell-region { min-width: 0; }
        .pa-shell-region-header { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 8px; background: var(--vscode-editor-background); }
        .pa-shell-region-main { min-width: 0; }
        .pa-shell-surface-pane { min-width: 0; }
        .pa-shell-surface-marker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
        .pa-shell-surface-title { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
        .pa-shell-surface-meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
        .toolbar { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; }
        .button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
        .button.action-navigation { background: color-mix(in srgb, var(--vscode-button-background) 72%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-button-background) 55%, var(--vscode-panel-border)); }
        .status-banner { border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 12px; }
        .status-banner strong { display: block; font-size: 13px; margin-bottom: 4px; }
        .status-banner p { margin: 4px 0; color: var(--vscode-descriptionForeground); }
        .status-banner code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
        .status-missing { border: 1px solid color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 52%, var(--vscode-panel-border)); background: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 12%, var(--vscode-editor-background)); }
        .status-init { border: 1px solid color-mix(in srgb, rebeccapurple 45%, var(--vscode-panel-border)); background: color-mix(in srgb, rebeccapurple 12%, var(--vscode-editor-background)); }
        .status-ok { border: 1px solid color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 45%, var(--vscode-panel-border)); background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 12%, var(--vscode-editor-background)); }
        .install-steps { margin: 8px 0; display: flex; flex-direction: column; gap: 4px; }
        .install-step { display: flex; align-items: center; gap: 8px; font-size: 11px; }
        .step-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); min-width: 36px; }
        .step-code { font-family: var(--vscode-editor-font-family); font-size: 11px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 1px 6px; background: var(--vscode-input-background); }
        .section-heading { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); margin: 14px 0 8px 0; font-weight: 600; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-bottom: 10px; }
        .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; background: var(--vscode-editor-background); }
        .card-remove { border-color: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 45%, var(--vscode-panel-border)); background: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 6%, var(--vscode-editor-background)); }
        .card-initialized { border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 45%, var(--vscode-panel-border)); }
        .kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
        .title { font-size: 12px; font-weight: 600; margin-bottom: 6px; word-break: break-word; }
        .description { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
        .detail-list { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0 0 8px 0; padding-left: 16px; }
        .detail-list li { margin-bottom: 3px; }
        .detail-list code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
        .path-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
        .path-value { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-foreground); margin-bottom: 8px; }
        .actions-section { border-top: 1px solid var(--vscode-panel-border); margin-top: 8px; padding-top: 8px; }
        .actions-subheading { font-size: 10px; color: var(--vscode-descriptionForeground); margin: 6px 0; }
        .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
        .actions button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 6px 8px; font-size: 11px; cursor: pointer; width: 100%; min-height: 30px; text-align: center; }
        .actions button.action-navigation { background: color-mix(in srgb, var(--vscode-button-background) 72%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-button-background) 55%, var(--vscode-panel-border)); }
        .actions button.action-run { background: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 58%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 52%, var(--vscode-panel-border)); }
        .actions button.action-stage { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 58%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 52%, var(--vscode-panel-border)); }
        .actions button:disabled { opacity: 0.7; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <div class="pa-shell-layout" data-pa-shell-surface="${LIFECYCLE_SHELL_SURFACE_ID}">
        <header class="pa-shell-region pa-shell-region-header">
          <div class="pa-shell-surface-marker">Shared Shell Surface</div>
          <div class="pa-shell-surface-title">Lifecycle</div>
          <div class="pa-shell-surface-meta">Lifecycle surface is migrated into shared shell composition through ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}; project initialization and removal authority remains host-routed.</div>
        </header>
        <main class="pa-shell-region pa-shell-region-main">
          <div class="pa-shell-surface-pane" data-pa-shell-pane="${LIFECYCLE_SHELL_PANE_ID}">
            <div class="toolbar">
              <button class="button action-navigation" id="refresh-btn">Refresh</button>
            </div>
            ${pageContent}
          </div>
        </main>
      </div>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        function applyActionGridColumns(container) {
          if (!(container instanceof Element)) {
            return;
          }

          const actionRows = container.querySelectorAll(".actions");
          actionRows.forEach((row) => {
            const buttonCount = row.querySelectorAll("button").length;
            if (buttonCount === 0) {
              return;
            }

            const columnCount = Math.min(3, buttonCount);
            row.style.gridTemplateColumns = "repeat(" + columnCount + ", minmax(0, 1fr))";
          });
        }

        applyActionGridColumns(document.body);

        document.querySelectorAll("button[data-run]").forEach((button) => {
          button.addEventListener("click", () => {
            const command = button.getAttribute("data-run");
            const execute = button.getAttribute("data-execute") !== "false";
            vscode.postMessage({ type: "runCommand", command, execute });
          });
        });

        const refreshBtn = document.getElementById("refresh-btn");
        if (refreshBtn) {
          refreshBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "refresh" });
          });
        }

        const stageRemoveBtn = document.getElementById("stage-remove-btn");
        if (stageRemoveBtn) {
          stageRemoveBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "stageRemove" });
          });
        }
      </script>
    </body>
  </html>`;
}

const REMOVE_COMMANDS = [
  "rm -rf roadmap/ architecture/ arch-domains/ arch-model/",
  "rm -rf .project-arch/ .arch/",
];

class LifecycleWebviewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private status: ProjectArchPresenceStatus | undefined;

  public constructor(
    private readonly workspaceRoot: string,
    private readonly api: typeof vscode.window,
    private readonly dependencies?: {
      cliCommand?: string;
      cliExecutor?: ProjectArchCliExecutor;
      now?: () => string;
    },
  ) {}

  private async detect(): Promise<ProjectArchPresenceStatus> {
    this.status = await detectProjectArchPresence({
      workspaceRoot: this.workspaceRoot,
      cliCommand: this.dependencies?.cliCommand,
      cliExecutor: this.dependencies?.cliExecutor,
      now: this.dependencies?.now,
    });
    return this.status;
  }

  public async refresh(): Promise<void> {
    await this.detect();
    await this.render();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(
      async (message: { type?: string; command?: string; execute?: boolean }) => {
        if (message.type === "refresh") {
          await this.refresh();
          return;
        }

        if (message.type === "runCommand" && message.command) {
          await this.runCommandInTerminal(message.command, message.execute !== false);
          return;
        }

        if (message.type === "stageRemove") {
          await this.stageRemoveCommands();
        }
      },
    );

    void this.render();
  }

  private async render(): Promise<void> {
    if (!this.view) {
      return;
    }

    const status = this.status ?? (await this.detect());
    this.view.webview.html = renderLifecycleHtml(status);
  }

  private async runCommandInTerminal(command: string, execute: boolean): Promise<void> {
    await runLifecycleCommandInTerminalFlow({
      windowApi: this.api,
      command,
      execute,
    });
  }

  private async stageRemoveCommands(): Promise<void> {
    await runLifecycleRemoveFlow({
      windowApi: this.api,
    });
  }
}

export function registerLifecycleView(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "commands" | "window" | "workspace">,
  dependencies?: {
    cliCommand?: string;
    cliExecutor?: ProjectArchCliExecutor;
    now?: () => string;
  },
): void {
  const workspaceRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  const provider = new LifecycleWebviewProvider(workspaceRoot, api.window, dependencies);

  const providerRegistration = api.window.registerWebviewViewProvider(LIFECYCLE_VIEW_ID, provider);

  const refreshCommand = api.commands.registerCommand(REFRESH_LIFECYCLE_COMMAND_ID, async () => {
    await provider.refresh();
  });

  context.subscriptions.push(providerRegistration);
  context.subscriptions.push(refreshCommand);
}
