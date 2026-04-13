import type * as vscode from "vscode";
import {
  defaultProjectArchCliExecutor,
  type ProjectArchCliExecutor,
} from "../integration/projectArchBoundary";
import {
  COMMANDS_SHELL_PANE_ID,
  COMMANDS_SHELL_SURFACE_ID,
  RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH,
} from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";

export const COMMAND_CATALOG_VIEW_ID = "projectArch.commandCatalog" as const;
export const REFRESH_COMMAND_CATALOG_COMMAND_ID = "projectArch.refreshCommandCatalog" as const;
export const STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID =
  "projectArch.stageCatalogCommandInExistingTerminal" as const;
export const STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID =
  "projectArch.stageCatalogCommandInNewTerminal" as const;

const EXTENSION_SURFACED_COMMANDS = new Set([
  "pa agent prepare",
  "pa result import",
  "pa agent validate",
  "pa agent reconcile",
]);

function isExtensionSurfacedCommand(command: string): boolean {
  for (const prefix of EXTENSION_SURFACED_COMMANDS) {
    if (command.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

export interface CommandCatalogEntry {
  command: string;
  description: string;
  details: Array<{ label: string; description: string }>;
  section: string;
  surfacedInExtension: boolean;
}

export interface CommandCatalogGroup {
  kind: "extension" | "cli";
  label: string;
  entries: CommandCatalogEntry[];
}

export interface CommandCatalogModel {
  generatedAt: string;
  source: "pa-help-commands";
  groups: CommandCatalogGroup[];
}

function stripAnsi(value: string): string {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (current === "\u001B" && next === "[") {
      let cursor = index + 2;
      while (cursor < value.length) {
        const token = value[cursor];
        if (token === "m") {
          index = cursor;
          break;
        }

        if (!token || (!/^[0-9;]$/.test(token) && token !== "?")) {
          output += current;
          break;
        }

        cursor += 1;
      }
      continue;
    }

    output += current;
  }

  return output;
}

function parseCommandLine(line: string): { command?: string; description?: string } {
  const match = line.match(/^\s{2}(pa\s+[^\s].*?)(?:\s{2,}(.+))?$/);
  if (!match) {
    return {};
  }

  return {
    command: match[1]?.trim(),
    description: match[2]?.trim(),
  };
}

function extractInlineArgs(command: string): Array<{ label: string; description: string }> {
  const details: Array<{ label: string; description: string }> = [];
  const requiredMatches = command.match(/<[^>]+>/g) ?? [];

  for (const token of requiredMatches) {
    details.push({
      label: token,
      description: "Required argument",
    });
  }

  const optionalBlocks = command.match(/\[[^\]]+\]/g) ?? [];
  for (const block of optionalBlocks) {
    const optionalFlagMatches = block.match(/--[a-z0-9-]+/gi) ?? [];
    for (const flag of optionalFlagMatches) {
      details.push({
        label: flag,
        description: "Optional flag",
      });
    }
  }

  return details;
}

function parseOptionDetails(line: string): Array<{ label: string; description: string }> {
  const trimmed = line.trim();
  const details: Array<{ label: string; description: string }> = [];

  if (trimmed.startsWith("Options:")) {
    const raw = trimmed.slice("Options:".length).trim();
    const tokens = raw
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.startsWith("--"));

    for (const token of tokens) {
      details.push({
        label: token,
        description: "Option",
      });
    }
  }

  const explicitFlag = trimmed.match(/^(--[a-z0-9-]+)(?::\s*(.+))?$/i);
  if (explicitFlag) {
    details.push({
      label: explicitFlag[1],
      description: explicitFlag[2]?.trim() || "Option",
    });
  }

  return details;
}

function normalizeEntryDetails(
  input: Array<{ label: string; description: string }>,
): Array<{ label: string; description: string }> {
  const seen = new Set<string>();
  const output: Array<{ label: string; description: string }> = [];

  for (const detail of input) {
    const label = detail.label.trim();
    const description = detail.description.trim();
    if (label.length === 0 || description.length === 0) {
      continue;
    }
    const key = `${label.toLowerCase()}|${description.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push({ label, description });
  }

  return output;
}

function parseHelpCommandsOutput(output: string): CommandCatalogEntry[] {
  const lines = stripAnsi(output).split(/\r?\n/);
  const entries: CommandCatalogEntry[] = [];

  let currentSection = "General";

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    const line = rawLine.replace(/\s+$/g, "");

    const sectionMatch = line.match(/^([A-Za-z][A-Za-z0-9&\-\s()]+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1]?.trim() ?? currentSection;
      continue;
    }

    const parsed = parseCommandLine(line);
    if (parsed.command) {
      const details = [...extractInlineArgs(parsed.command)];

      let fallbackDescription: string | undefined;
      let lookahead = lineIndex + 1;
      while (lookahead < lines.length) {
        const nextLineRaw = lines[lookahead] ?? "";
        const nextLine = nextLineRaw.replace(/\s+$/g, "");
        if (nextLine.match(/^([A-Za-z][A-Za-z0-9&\-\s()]+):\s*$/)) {
          break;
        }
        if (parseCommandLine(nextLine).command) {
          break;
        }

        const nextTrimmed = nextLine.trim();
        if (nextTrimmed.length > 0) {
          if (
            !fallbackDescription &&
            !nextTrimmed.startsWith("Options:") &&
            !nextTrimmed.startsWith("Output:")
          ) {
            fallbackDescription = nextTrimmed;
          }
          details.push(...parseOptionDetails(nextTrimmed));
        }
        lookahead += 1;
      }

      if (parsed.description && parsed.description.length > 0) {
        entries.push({
          command: parsed.command,
          description: parsed.description,
          details: normalizeEntryDetails(details),
          section: currentSection,
          surfacedInExtension: isExtensionSurfacedCommand(parsed.command),
        });
      } else {
        entries.push({
          command: parsed.command,
          description: fallbackDescription ?? "No summary available from CLI help output.",
          details: normalizeEntryDetails(details),
          section: currentSection,
          surfacedInExtension: isExtensionSurfacedCommand(parsed.command),
        });
      }
    }
  }

  return entries;
}

function groupEntries(entries: CommandCatalogEntry[]): CommandCatalogGroup[] {
  const extensionEntries = entries
    .filter((entry) => entry.surfacedInExtension)
    .sort((left, right) => left.command.localeCompare(right.command));

  const cliEntries = entries
    .filter((entry) => !entry.surfacedInExtension)
    .sort((left, right) => left.command.localeCompare(right.command));

  const groups: CommandCatalogGroup[] = [
    {
      kind: "extension",
      label: "Directly surfaced in extension workflows",
      entries: extensionEntries,
    },
    {
      kind: "cli",
      label: "Additional CLI capabilities",
      entries: cliEntries,
    },
  ];

  return groups.filter((group) => group.entries.length > 0);
}

export async function buildCommandCatalogModel(input?: {
  workspaceRoot?: string;
  cliCommand?: string;
  cliExecutor?: ProjectArchCliExecutor;
  now?: () => string;
}): Promise<CommandCatalogModel> {
  const executor = input?.cliExecutor ?? defaultProjectArchCliExecutor;
  const cliCommand = input?.cliCommand ?? "pa";
  const now = input?.now ?? (() => new Date().toISOString());

  const result = await executor({
    command: cliCommand,
    args: ["help", "commands"],
    cwd: input?.workspaceRoot,
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    const detail = stderr.length > 0 ? ` ${stderr}` : "";
    throw new Error(`Project Arch CLI command failed with exit code ${result.exitCode}.${detail}`);
  }

  const entries = parseHelpCommandsOutput(result.stdout);
  if (entries.length === 0) {
    throw new Error("Project Arch CLI help output did not include parseable command entries.");
  }

  return {
    generatedAt: now(),
    source: "pa-help-commands",
    groups: groupEntries(entries),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function primaryCommandGroup(command: string): string {
  const tokens = command
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length < 2) {
    return "misc";
  }

  if (tokens[0] !== "pa") {
    return tokens[0]?.toLowerCase() ?? "misc";
  }

  return tokens[1]?.toLowerCase() ?? "misc";
}

function renderCommandCatalogHtml(webview: vscode.Webview, model: CommandCatalogModel): string {
  void webview;
  const nonce = String(Date.now());
  const defaultOpenAccordions = new Set(["agent", "task"]);
  const allEntries = model.groups.flatMap((group) =>
    group.entries.map((entry) => ({
      ...entry,
      scope: group.kind,
    })),
  );

  const entriesByPrimaryCommand = new Map<
    string,
    Array<CommandCatalogEntry & { scope: CommandCatalogGroup["kind"] }>
  >();

  for (const entry of allEntries) {
    const key = primaryCommandGroup(entry.command);
    const current = entriesByPrimaryCommand.get(key) ?? [];
    current.push(entry);
    entriesByPrimaryCommand.set(key, current);
  }

  const sections = [...entriesByPrimaryCommand.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([primary, entries]) => {
      const cards = entries
        .sort((left, right) => left.command.localeCompare(right.command))
        .map((entry) => {
          const detailRows =
            entry.details.length > 0
              ? `<div class="details">${entry.details
                  .map(
                    (detail) =>
                      `<div class="detail-row"><span class="detail-label">${escapeHtml(
                        detail.label,
                      )}</span><span class="detail-description">${escapeHtml(
                        detail.description,
                      )}</span></div>`,
                  )
                  .join("")}</div>`
              : `<div class="details"><div class="detail-row"><span class="detail-label">(none)</span><span class="detail-description">No explicit arguments or flags documented.</span></div></div>`;

          const scopeLabel = entry.scope === "extension" ? "Extension surfaced" : "CLI only";

          return `<article class="card">
            <div class="command">${escapeHtml(entry.command)}</div>
            <div class="meta">${escapeHtml(scopeLabel)} · ${escapeHtml(entry.section)}</div>
            <div class="description">${escapeHtml(entry.description)}</div>
            ${detailRows}
            <div class="actions">
              <button class="action-stage" data-action="existing" data-command="${escapeAttribute(
                entry.command,
              )}">Send to Existing Terminal</button>
              <button class="action-stage" data-action="new" data-command="${escapeAttribute(
                entry.command,
              )}">Send to New Terminal</button>
            </div>
          </article>`;
        })
        .join("");

      return `<details class="accordion" data-primary-group="${escapeAttribute(
        primary,
      )}" ${defaultOpenAccordions.has(primary) ? "open" : ""}><summary>${escapeHtml(
        primary,
      )} <span class="count">(${entries.length})</span></summary><div class="accordion-body">${cards}</div></details>`;
    })
    .join("");

  const primaryGroups = [...entriesByPrimaryCommand.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const groupFilterOptions = primaryGroups
    .map(
      (group) =>
        `<label class="filter-option"><span>${escapeHtml(group)}</span><input class="filter-toggle" type="checkbox" role="switch" aria-label="Toggle ${escapeAttribute(
          group,
        )}" data-filter-checkbox="${escapeAttribute(group)}" checked /></label>`,
    )
    .join("");

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
        .toolbar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; position: relative; }
        .toolbar-button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
        .toolbar-button.action-navigation { background: color-mix(in srgb, var(--vscode-button-background) 72%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-button-background) 55%, var(--vscode-panel-border)); }
        .toolbar-button-label { vertical-align: middle; }
        .toolbar-badge { display: inline-block; margin-left: 6px; min-width: 16px; padding: 0 5px; border-radius: 999px; font-size: 10px; line-height: 16px; text-align: center; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); vertical-align: middle; }
        .filter-popover { position: absolute; top: calc(100% + 4px); left: 0; min-width: 150px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-editor-background); padding: 8px; z-index: 2; }
        .filter-popover[hidden] { display: none; }
        .filter-popover-actions { display: flex; justify-content: flex-end; margin-top: 4px; margin-bottom: 6px; }
        .filter-popover-action { border: 1px solid color-mix(in srgb, rebeccapurple 60%, var(--vscode-panel-border)); background: color-mix(in srgb, rebeccapurple 78%, var(--vscode-editor-background)); color: #ffffff; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 11px; }
        .filter-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; margin-bottom: 6px; text-transform: lowercase; padding: 4px 6px; border-radius: 6px; border: 1px solid transparent; }
        .filter-popover .filter-option:nth-of-type(odd) { background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-input-background)); border-color: color-mix(in srgb, var(--vscode-panel-border) 60%, transparent); }
        .filter-popover .filter-option:nth-of-type(even) { background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-input-background)); border-color: color-mix(in srgb, var(--vscode-panel-border) 45%, transparent); }
        .filter-toggle {
          appearance: none;
          -webkit-appearance: none;
          width: 30px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid var(--vscode-panel-border);
          background: transparent;
          position: relative;
          cursor: pointer;
          outline: none;
          transition: background 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0;
        }
        .filter-toggle::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--vscode-foreground);
          opacity: 0.7;
          transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease;
        }
        .filter-toggle:checked {
          background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 58%, var(--vscode-editor-background));
          border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 52%, var(--vscode-panel-border));
        }
        .filter-toggle:checked::after {
          transform: translateX(12px);
          opacity: 1;
          background: #ffffff;
        }
        .active-filters { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
        .filter-chip { border: 1px solid color-mix(in srgb, rebeccapurple 60%, var(--vscode-panel-border)); background: color-mix(in srgb, rebeccapurple 78%, var(--vscode-editor-background)); color: #ffffff; border-radius: 999px; padding: 2px 8px; cursor: pointer; font-size: 11px; text-transform: lowercase; }
        .filter-chip.is-active { background: rebeccapurple; color: #ffffff; border-color: color-mix(in srgb, rebeccapurple 75%, var(--vscode-panel-border)); }
        .filter-chip-remove { margin-left: 6px; opacity: 0.9; }
        .accordion { margin-bottom: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-editor-background); }
        .accordion summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 700; padding: 8px 10px; text-transform: lowercase; }
        .accordion summary::-webkit-details-marker { display: none; }
        .count { color: var(--vscode-descriptionForeground); font-weight: 500; }
        .accordion-body { padding: 2px 8px 8px 8px; }
        .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin-bottom: 10px; background: var(--vscode-editor-background); }
        .command { font-family: var(--vscode-editor-font-family); font-size: 12px; font-weight: 600; margin-bottom: 6px; }
        .meta { font-size: 11px; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
        .description { font-size: 12px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
        .details { border-top: 1px dashed var(--vscode-panel-border); border-bottom: 1px dashed var(--vscode-panel-border); padding: 8px 0; margin: 8px 0; }
        .detail-row { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px; font-size: 11px; margin-bottom: 4px; }
        .detail-label { font-family: var(--vscode-editor-font-family); color: var(--vscode-symbolIcon-variableForeground); }
        .detail-description { color: var(--vscode-foreground); }
        .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
        .actions button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 6px 8px; font-size: 11px; cursor: pointer; width: 100%; min-height: 30px; text-align: center; }
        .actions button.action-navigation { background: color-mix(in srgb, var(--vscode-button-background) 72%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-button-background) 55%, var(--vscode-panel-border)); }
        .actions button.action-run { background: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 58%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 52%, var(--vscode-panel-border)); }
        .actions button.action-stage { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 58%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 52%, var(--vscode-panel-border)); }
      </style>
    </head>
    <body>
      <div class="pa-shell-layout" data-pa-shell-surface="${COMMANDS_SHELL_SURFACE_ID}">
        <header class="pa-shell-region pa-shell-region-header">
          <div class="pa-shell-surface-marker">Shared Shell Surface</div>
          <div class="pa-shell-surface-title">Commands</div>
          <div class="pa-shell-surface-meta">Command catalog surface is migrated into shared shell composition through ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}; command staging authority remains host-routed.</div>
        </header>
        <main class="pa-shell-region pa-shell-region-main">
          <div class="pa-shell-surface-pane" data-pa-shell-pane="${COMMANDS_SHELL_PANE_ID}">
            <div class="toolbar">
              <button class="toolbar-button action-navigation" data-ui-action="toggle-filters" id="filter-groups-button"><span class="toolbar-button-label">Filter Groups</span><span class="toolbar-badge" id="filter-groups-count">0</span></button>
              <button class="toolbar-button action-navigation" data-ui-action="expand-all">Expand All</button>
              <button class="toolbar-button action-navigation" data-ui-action="collapse-all">Collapse All</button>
              <div class="filter-popover" id="filter-popover" hidden>
                <div class="filter-popover-actions">
                  <button class="filter-popover-action" data-ui-action="add-missing-groups">Add All Missing</button>
                </div>
                ${groupFilterOptions}
              </div>
            </div>
            <div class="active-filters" id="active-filters">
            </div>
            ${sections}
          </div>
        </main>
      </div>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const allAccordions = Array.from(document.querySelectorAll("details.accordion"));
        const filterCheckboxes = Array.from(document.querySelectorAll("input[data-filter-checkbox]"));
        const uiActionButtons = Array.from(document.querySelectorAll("button[data-ui-action]"));
        const filterPopover = document.getElementById("filter-popover");
        const activeFiltersContainer = document.getElementById("active-filters");
        const filterGroupsCount = document.getElementById("filter-groups-count");

        const initialState = vscode.getState() || {};
        const allGroups = allAccordions
          .map((accordion) => accordion.getAttribute("data-primary-group"))
          .filter((value) => typeof value === "string" && value.length > 0);

        let activeGroups = Array.isArray(initialState.activeGroups)
          ? initialState.activeGroups.filter((value) => allGroups.includes(value))
          : [...allGroups];
        if (activeGroups.length === 0) {
          activeGroups = [...allGroups];
        }

        const persistedOpenGroups = Array.isArray(initialState.openGroups)
          ? initialState.openGroups.filter((value) => allGroups.includes(value))
          : null;

        function persistState() {
          const openGroups = allAccordions
            .filter((accordion) => accordion.open)
            .map((accordion) => accordion.getAttribute("data-primary-group"))
            .filter((value) => typeof value === "string" && value.length > 0);

          vscode.setState({
            activeGroups,
            openGroups,
          });
        }

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

        function applyFilterState() {
          allAccordions.forEach((accordion) => {
            const group = accordion.getAttribute("data-primary-group");
            accordion.hidden = !group || !activeGroups.includes(group);
          });

          if (filterGroupsCount) {
            filterGroupsCount.textContent = String(activeGroups.length);
          }

          filterCheckboxes.forEach((checkbox) => {
            const group = checkbox.getAttribute("data-filter-checkbox");
            checkbox.checked = Boolean(group && activeGroups.includes(group));
          });

          if (activeFiltersContainer) {
            activeFiltersContainer.innerHTML = activeGroups
              .slice()
              .sort((left, right) => left.localeCompare(right))
              .map(
                (group) =>
                  '<button class="filter-chip is-active" data-remove-group="' +
                  group +
                  '">' +
                  group +
                  '<span class="filter-chip-remove">×</span></button>',
              )
              .join("");

            Array.from(activeFiltersContainer.querySelectorAll("button[data-remove-group]")).forEach((button) => {
              button.addEventListener("click", () => {
                const group = button.getAttribute("data-remove-group");
                if (!group) {
                  return;
                }

                const next = activeGroups.filter((value) => value !== group);
                activeGroups = next.length > 0 ? next : [group];
                applyFilterState();
                persistState();
              });
            });
          }
        }

        if (persistedOpenGroups) {
          allAccordions.forEach((accordion) => {
            const group = accordion.getAttribute("data-primary-group");
            accordion.open = Boolean(group && persistedOpenGroups.includes(group));
          });
        }

        applyActionGridColumns(document.body);
        applyFilterState();

        allAccordions.forEach((accordion) => {
          accordion.addEventListener("toggle", () => {
            persistState();
          });
        });

        filterCheckboxes.forEach((checkbox) => {
          checkbox.addEventListener("change", () => {
            const group = checkbox.getAttribute("data-filter-checkbox");
            if (!group) {
              return;
            }

            if (checkbox.checked) {
              activeGroups = [...new Set([...activeGroups, group])].sort((left, right) => left.localeCompare(right));
            } else {
              const next = activeGroups.filter((value) => value !== group);
              activeGroups = next.length > 0 ? next : [group];
            }

            applyFilterState();
            persistState();
          });
        });

        document.querySelectorAll("button[data-action]").forEach((element) => {
          element.addEventListener("click", () => {
            const action = element.getAttribute("data-action");
            const command = element.getAttribute("data-command");
            vscode.postMessage({ action, command });
          });
        });

        uiActionButtons.forEach((element) => {
          element.addEventListener("click", () => {
            const action = element.getAttribute("data-ui-action");

            if (action === "toggle-filters") {
              if (filterPopover) {
                filterPopover.hidden = !filterPopover.hidden;
              }
              return;
            }

            if (action === "add-missing-groups") {
              activeGroups = [...allGroups].sort((left, right) => left.localeCompare(right));
              applyFilterState();
              persistState();
              return;
            }

            const accordions = allAccordions.filter((accordion) => !accordion.hidden);

            if (action === "expand-all") {
              accordions.forEach((accordion) => {
                accordion.open = true;
              });
              persistState();
            }

            if (action === "collapse-all") {
              accordions.forEach((accordion) => {
                accordion.open = false;
              });
              persistState();
            }
          });
        });

        document.addEventListener("click", (event) => {
          if (!filterPopover || filterPopover.hidden) {
            return;
          }

          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          const clickedToggle = target.closest('button[data-ui-action="toggle-filters"]');
          const clickedPopover = target.closest('#filter-popover');
          if (!clickedToggle && !clickedPopover) {
            filterPopover.hidden = true;
          }
        });
      </script>
    </body>
  </html>`;
}

class CommandCatalogWebviewProvider implements vscode.WebviewViewProvider {
  private model: CommandCatalogModel | undefined;
  private view: vscode.WebviewView | undefined;

  public constructor(
    private readonly workspaceRoot: string,
    private readonly api: Pick<typeof vscode, "window" | "commands">,
    private readonly dependencies?: {
      cliCommand?: string;
      cliExecutor?: ProjectArchCliExecutor;
      now?: () => string;
    },
  ) {}

  private async loadModel(): Promise<CommandCatalogModel> {
    this.model = await buildCommandCatalogModel({
      workspaceRoot: this.workspaceRoot,
      cliCommand: this.dependencies?.cliCommand,
      cliExecutor: this.dependencies?.cliExecutor,
      now: this.dependencies?.now,
    });
    return this.model;
  }

  public async refresh(): Promise<void> {
    await this.loadModel();
    await this.render();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.onDidReceiveMessage(
      async (message: { action?: string; command?: string }) => {
        if (message.action === "existing") {
          await this.api.commands.executeCommand(
            STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID,
            message.command,
          );
        }

        if (message.action === "new") {
          await this.api.commands.executeCommand(
            STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID,
            message.command,
          );
        }
      },
    );

    void this.render();
  }

  private async render(): Promise<void> {
    if (!this.view) {
      return;
    }

    const model = this.model ?? (await this.loadModel());
    this.view.webview.html = renderCommandCatalogHtml(this.view.webview, model);
  }
}

function toCatalogEntry(value: unknown): CommandCatalogEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as {
    command?: unknown;
    description?: unknown;
    details?: unknown;
    section?: unknown;
    surfacedInExtension?: unknown;
    entry?: unknown;
  };

  if (
    typeof candidate.command === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.section === "string" &&
    typeof candidate.surfacedInExtension === "boolean"
  ) {
    const details = Array.isArray(candidate.details)
      ? candidate.details
          .map((item) => {
            if (!item || typeof item !== "object") {
              return undefined;
            }

            const detail = item as { label?: unknown; description?: unknown };
            if (typeof detail.label !== "string" || typeof detail.description !== "string") {
              return undefined;
            }

            return {
              label: detail.label,
              description: detail.description,
            };
          })
          .filter((item): item is { label: string; description: string } => Boolean(item))
      : [];

    return {
      command: candidate.command,
      description: candidate.description,
      details,
      section: candidate.section,
      surfacedInExtension: candidate.surfacedInExtension,
    };
  }

  if (candidate.entry) {
    return toCatalogEntry(candidate.entry);
  }

  return undefined;
}

function resolveCommandText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const entry = toCatalogEntry(value);
  return entry?.command;
}

function ensureCatalogEntry(
  value: unknown,
  api: Pick<typeof vscode, "window">,
): string | undefined {
  const command = resolveCommandText(value);
  if (command) {
    return command;
  }

  void api.window.showWarningMessage(
    "Project Arch: Select a command catalog entry before sending it to a terminal.",
  );
  return undefined;
}

async function pickExistingTerminal(
  api: Pick<typeof vscode, "window">,
): Promise<vscode.Terminal | undefined> {
  const terminals = api.window.terminals;
  if (terminals.length === 0) {
    await api.window.showWarningMessage(
      "Project Arch: No existing terminal found. Create one or use 'Send to New Terminal'.",
    );
    return undefined;
  }

  if (terminals.length === 1) {
    return terminals[0];
  }

  const selected = await api.window.showQuickPick(
    terminals.map((terminal) => ({
      label: terminal.name,
      terminal,
    })),
    {
      placeHolder: "Select an existing terminal to stage the Project Arch command",
      ignoreFocusOut: true,
    },
  );

  return selected?.terminal;
}

async function stageCommandInTerminal(
  terminal: vscode.Terminal,
  command: string,
  api: Pick<typeof vscode, "window">,
): Promise<void> {
  terminal.show();
  terminal.sendText(command, false);

  await api.window.showInformationMessage(
    `Project Arch: Staged '${command}' in terminal '${terminal.name}'. Edit arguments before pressing Enter.`,
  );
}

export function registerCommandCatalogView(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "window" | "workspace" | "commands">,
): void {
  const workspaceRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const provider = new CommandCatalogWebviewProvider(workspaceRoot, api);
  const viewRegistration = api.window.registerWebviewViewProvider(
    COMMAND_CATALOG_VIEW_ID,
    provider,
  );
  const refreshCommand = api.commands.registerCommand(
    REFRESH_COMMAND_CATALOG_COMMAND_ID,
    async () => {
      await provider.refresh();
    },
  );
  const stageInExistingTerminal = api.commands.registerCommand(
    STAGE_COMMAND_IN_EXISTING_TERMINAL_COMMAND_ID,
    async (value?: unknown) => {
      const command = ensureCatalogEntry(value, api);
      if (!command) {
        return;
      }

      const terminal = await pickExistingTerminal(api);
      if (!terminal) {
        return;
      }

      await stageCommandInTerminal(terminal, command, api);
    },
  );
  const stageInNewTerminal = api.commands.registerCommand(
    STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID,
    async (value?: unknown) => {
      const command = ensureCatalogEntry(value, api);
      if (!command) {
        return;
      }

      const terminal = api.window.createTerminal("Project Arch CLI");
      await stageCommandInTerminal(terminal, command, api);
    },
  );

  context.subscriptions.push(viewRegistration);
  context.subscriptions.push(refreshCommand);
  context.subscriptions.push(stageInExistingTerminal);
  context.subscriptions.push(stageInNewTerminal);
}
