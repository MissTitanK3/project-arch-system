import type * as vscode from "vscode";
import type { ProjectArchBoundary } from "../integration/projectArchBoundary";
import {
  loadRuntimeManagementInventoryViewModel,
  loadRuntimeManagementScanViewModel,
  EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
  type RuntimeManagementInventoryViewModel,
  type RuntimeManagementScanViewModel,
  type RuntimeManagementCandidateViewModel,
  type RuntimeManagementProfileViewModel,
  type RuntimeManagementRuntimeViewModel,
  type RuntimeManagementProfileMutationAffordance,
} from "../integration/runtimeManagementBoundary";
import {
  runCreateProfileFlow,
  runUpdateProfileModelFlow,
  runUnlinkProfileFlow,
  type ProfileMutationFlowResult,
} from "../integration/profileMutationFlows";
import {
  RUNTIMES_SHELL_PANE_ID,
  RUNTIMES_SHELL_SURFACE_ID,
  RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH,
} from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";

export const RUNTIMES_VIEW_ID = "projectArch.runtimes" as const;
export const REFRESH_RUNTIMES_COMMAND_ID = "projectArch.refreshRuntimes" as const;

// ---------------------------------------------------------------------------
// View-state models for panel rendering
// ---------------------------------------------------------------------------

export type RuntimesPanelLoadState = "loading" | "loaded" | "empty-inventory" | "failed";

export interface RuntimesPanelModel {
  loadState: RuntimesPanelLoadState;
  sourceAuthority: string;
  generatedAt?: string;
  scanCheckedAt?: string;
  scanStatus?: RuntimeManagementScanViewModel["scanStatus"];
  projectRoot?: string;
  defaultProfile?: string;
  runtimes: RuntimeManagementRuntimeViewModel[];
  profiles: RuntimeManagementProfileViewModel[];
  scanCandidates: RuntimeManagementCandidateViewModel[];
  scanDiagnostics: RuntimeManagementScanViewModel["diagnostics"];
  scanError?: string;
  summary: RuntimeManagementInventoryViewModel["summary"];
  error?: string;
}

export interface RuntimeProfileMutationRequest {
  kind?: string;
  profileId?: string;
  currentModel?: string;
  runtime?: string;
  suggestedModel?: string;
}

export function buildRuntimesPanelModel(
  inventory: RuntimeManagementInventoryViewModel,
  scan?: RuntimeManagementScanViewModel,
  scanError?: string,
): RuntimesPanelModel {
  const loadState: RuntimesPanelLoadState =
    inventory.profiles.length === 0 && inventory.runtimes.length === 0
      ? "empty-inventory"
      : "loaded";

  return {
    loadState,
    sourceAuthority: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.authority,
    generatedAt: inventory.generatedAt,
    scanCheckedAt: scan?.scannedAt,
    scanStatus: scan?.scanStatus,
    projectRoot: inventory.projectRoot,
    defaultProfile: inventory.defaultProfile,
    runtimes: inventory.runtimes,
    profiles: inventory.profiles,
    scanCandidates: scan?.candidates ?? [],
    scanDiagnostics: scan?.diagnostics ?? [],
    scanError,
    summary: inventory.summary,
  };
}

export function buildRuntimesPanelLoadingModel(): RuntimesPanelModel {
  return {
    loadState: "loading",
    sourceAuthority: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.authority,
    runtimes: [],
    profiles: [],
    scanCandidates: [],
    scanDiagnostics: [],
    summary: {
      totalRuntimes: 0,
      availableRuntimes: 0,
      totalProfiles: 0,
      readyProfiles: 0,
      blockedProfiles: 0,
      disabledProfiles: 0,
    },
  };
}

export function buildRuntimesPanelFailedModel(error: string): RuntimesPanelModel {
  return {
    loadState: "failed",
    sourceAuthority: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.authority,
    runtimes: [],
    profiles: [],
    scanCandidates: [],
    scanDiagnostics: [],
    summary: {
      totalRuntimes: 0,
      availableRuntimes: 0,
      totalProfiles: 0,
      readyProfiles: 0,
      blockedProfiles: 0,
      disabledProfiles: 0,
    },
    error,
  };
}

// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readinessBadgeClass(readiness: RuntimeManagementProfileViewModel["readiness"]): string {
  if (readiness === "ready") {
    return "badge-ready";
  }
  if (readiness === "disabled") {
    return "badge-disabled";
  }
  return "badge-blocked";
}

function readinessBadgeText(readiness: RuntimeManagementProfileViewModel["readiness"]): string {
  if (readiness === "ready") {
    return "Ready";
  }
  if (readiness === "disabled") {
    return "Disabled";
  }
  if (readiness === "missing-auth") {
    return "Missing Auth";
  }
  if (readiness === "missing-model") {
    return "No Model";
  }
  if (readiness === "missing-binary") {
    return "Binary Missing";
  }
  if (readiness === "runtime-unavailable") {
    return "Unavailable";
  }
  if (readiness === "invalid-config") {
    return "Invalid Config";
  }
  if (readiness === "adapter-check-failed") {
    return "Check Failed";
  }
  return "Blocked";
}

function renderAffordanceButton(
  affordance: RuntimeManagementProfileMutationAffordance,
  profileId: string,
  currentModel?: string | null,
): string {
  const cls =
    affordance.kind === "enable" || affordance.kind === "set-default"
      ? "action-promote"
      : affordance.kind === "unlink"
        ? "action-remove"
        : "action-neutral";

  // Unlink and update-model go through extension-level flows (confirmation/prompts).
  if (affordance.kind === "unlink") {
    return `<button class="${escapeHtml(cls)}" data-mutation-kind="unlink" data-profile-id="${escapeHtml(profileId)}">${escapeHtml(affordance.label)}</button>`;
  }
  if (affordance.kind === "update") {
    const modelAttr = currentModel
      ? ` data-current-model="${escapeHtml(String(currentModel))}"`
      : "";
    return `<button class="${escapeHtml(cls)}" data-mutation-kind="update-model" data-profile-id="${escapeHtml(profileId)}"${modelAttr}>${escapeHtml(affordance.label)}</button>`;
  }

  // All other affordances stage the pre-built CLI command in the terminal.
  return `<button class="${escapeHtml(cls)}" data-command="${escapeHtml(affordance.command)}">${escapeHtml(affordance.label)}</button>`;
}

function renderProfileCard(profile: RuntimeManagementProfileViewModel): string {
  const badgeClass = readinessBadgeClass(profile.readiness);
  const badgeText = readinessBadgeText(profile.readiness);
  const defaultBadge = profile.isDefault ? `<span class="badge badge-default">Default</span>` : "";
  const disabledBadge = !profile.enabled
    ? `<span class="badge badge-disabled">Disabled</span>`
    : "";

  const modelLine = profile.model
    ? `<div class="meta-row"><span class="meta-label">Model</span><span class="meta-value">${escapeHtml(String(profile.model))}</span></div>`
    : "";

  const purposeLine = profile.purpose
    ? `<div class="meta-row"><span class="meta-label">Purpose</span><span class="meta-value">${escapeHtml(profile.purpose)}</span></div>`
    : "";

  const diagnosticItems =
    profile.diagnostics.length > 0
      ? `<ul class="diagnostic-list">${profile.diagnostics.map((d) => `<li class="diag-${escapeHtml(d.severity)}">${escapeHtml(d.message)}${d.nextStep ? ` <span class="diag-hint">&mdash; ${escapeHtml(d.nextStep)}</span>` : ""}</li>`).join("")}</ul>`
      : "";

  const affordanceButtons = profile.affordances
    .map((a) => renderAffordanceButton(a, profile.id, profile.model))
    .join("");

  return `<article class="profile-card" data-profile-id="${escapeHtml(profile.id)}" data-readiness="${escapeHtml(profile.readiness)}">
  <div class="profile-header">
    <div class="profile-title">
      <span class="profile-id">${escapeHtml(profile.id)}</span>
      ${defaultBadge}${disabledBadge}<span class="badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeText)}</span>
    </div>
    <div class="profile-runtime-label">${escapeHtml(profile.runtimeDisplayName)}</div>
  </div>
  <div class="profile-meta">
    ${modelLine}${purposeLine}
    <div class="meta-row"><span class="meta-label">Readiness</span><span class="meta-value">${escapeHtml(profile.readinessSummary)}</span></div>
  </div>
  ${diagnosticItems}
  <div class="card-actions">${affordanceButtons}</div>
</article>`;
}

function renderRuntimeSection(
  runtime: RuntimeManagementRuntimeViewModel,
  profiles: RuntimeManagementProfileViewModel[],
): string {
  const runtimeProfiles = profiles.filter((p) => p.runtime === runtime.runtime);
  const availClass = runtime.available ? "runtime-available" : "runtime-unavailable";
  const availBadge = runtime.available
    ? `<span class="badge badge-ready">Available</span>`
    : `<span class="badge badge-blocked">Unavailable</span>`;
  const sourceLabel =
    runtime.availabilitySource === "config-file"
      ? `<span class="badge badge-source-config">config-file</span>`
      : `<span class="badge badge-source-adapter">adapter</span>`;

  const profileCards =
    runtimeProfiles.length > 0
      ? runtimeProfiles.map(renderProfileCard).join("\n")
      : `<div class="empty-profiles">
        <div>No linked profiles for this runtime. Use <code>pa runtime link ${escapeHtml(runtime.runtime)} --profile &lt;id&gt;</code> to add one, or click <strong>Link Profile</strong>.</div>
        <div class="card-actions">
          <button class="action-promote" data-command="pa runtime link ${escapeHtml(runtime.runtime)} --profile &lt;id&gt;">Stage Link Command</button>
        </div>
      </div>`;

  const descLine = runtime.description
    ? `<div class="runtime-description">${escapeHtml(runtime.description)}</div>`
    : "";

  return `<section class="runtime-section ${escapeHtml(availClass)}" data-runtime="${escapeHtml(runtime.runtime)}">
  <div class="runtime-section-header">
    <div class="runtime-section-title">
      <span class="runtime-display-name">${escapeHtml(runtime.displayName)}</span>
      ${availBadge}${sourceLabel}
    </div>
    ${descLine}
    <div class="runtime-stats">
      <span class="stat-item">${runtime.linkedProfileCount} linked</span>
      <span class="stat-sep">&middot;</span>
      <span class="stat-item">${runtime.readyProfileCount} ready</span>
    </div>
  </div>
  <div class="profile-list">${profileCards}</div>
</section>`;
}

function renderSummaryBar(model: RuntimesPanelModel): string {
  const { summary } = model;
  const items = [
    `<span class="summary-item"><span class="summary-count">${summary.totalRuntimes}</span> runtimes (<span class="count-available">${summary.availableRuntimes}</span> available)</span>`,
    `<span class="summary-sep">&middot;</span>`,
    `<span class="summary-item"><span class="summary-count">${summary.totalProfiles}</span> profiles</span>`,
    `<span class="summary-sep">&middot;</span>`,
    `<span class="summary-item count-ready">${summary.readyProfiles} ready</span>`,
    summary.blockedProfiles > 0
      ? `<span class="summary-sep">&middot;</span><span class="summary-item count-blocked">${summary.blockedProfiles} blocked</span>`
      : "",
    summary.disabledProfiles > 0
      ? `<span class="summary-sep">&middot;</span><span class="summary-item count-disabled">${summary.disabledProfiles} disabled</span>`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="summary-bar">${items}</div>`;
}

function renderLoadingHtml(): string {
  return `<div class="state-banner state-loading"><strong>Loading runtime inventory…</strong><p>Fetching runtime profiles and readiness state.</p></div>`;
}

function renderEmptyHtml(): string {
  return `<div class="state-banner state-empty">
    <strong>No linked runtime profiles</strong>
    <p>This repository has no linked runtime profiles yet. Scan for available runtimes or link one directly.</p>
    <div class="empty-actions">
      <code>pa runtime scan</code> &mdash; discover available runtimes<br/>
      <code>pa runtime link &lt;runtime&gt; --profile &lt;id&gt;</code> &mdash; link a runtime profile<br/>
      <code>pa runtime list --json</code> &mdash; inspect raw inventory
    </div>
  </div>`;
}

function renderFailedHtml(error: string): string {
  return `<div class="state-banner state-failed">
    <strong>Failed to load runtime inventory</strong>
    <p>${escapeHtml(error)}</p>
    <p>Click Refresh to retry, or run <code>pa runtime list --json</code> to inspect directly.</p>
  </div>`;
}

function renderOnboardingBanner(model: RuntimesPanelModel): string {
  const hasReadyProfiles = model.summary.readyProfiles > 0;
  const hasUnlinkedCandidates = model.scanCandidates.some((c) => !c.alreadyLinked);

  if (hasReadyProfiles && !hasUnlinkedCandidates) {
    return "";
  }

  if (model.profiles.length === 0) {
    return `<div class="state-banner state-empty"><strong>Runtime setup is not complete</strong><p>No linked runtime profiles exist yet. Scan for local runtime candidates, then link a profile into project configuration.</p></div>`;
  }

  if (!hasReadyProfiles) {
    return `<div class="state-banner state-empty"><strong>No ready runtime profiles</strong><p>Profiles are linked but blocked or disabled. Scan for additional runtime candidates or update linked profiles.</p></div>`;
  }

  if (hasUnlinkedCandidates) {
    return `<div class="state-banner state-empty"><strong>Additional runtime candidates discovered</strong><p>Some local runtimes are available but not linked in project-owned profile config.</p></div>`;
  }

  return "";
}

function renderScanCandidateCard(candidate: RuntimeManagementCandidateViewModel): string {
  const confidenceBadge = `<span class="badge badge-source-config">${escapeHtml(candidate.confidence)}</span>`;
  const sourceBadge = `<span class="badge badge-source-adapter">${escapeHtml(candidate.source)}</span>`;
  const linkedBadge = candidate.alreadyLinked
    ? `<span class="badge badge-default">Linked</span>`
    : `<span class="badge badge-blocked">Not Linked</span>`;

  const descriptionLine = candidate.description
    ? `<div class="runtime-description">${escapeHtml(candidate.description)}</div>`
    : "";
  const suggestedModelLine = candidate.suggestedModel
    ? `<div class="meta-row"><span class="meta-label">Suggested model</span><span class="meta-value">${escapeHtml(candidate.suggestedModel)}</span></div>`
    : "";

  const diagnostics =
    candidate.diagnostics.length > 0
      ? `<ul class="diagnostic-list">${candidate.diagnostics
          .map(
            (d) =>
              `<li class="diag-${escapeHtml(d.severity)}">${escapeHtml(d.message)}${d.nextStep ? ` <span class="diag-hint">&mdash; ${escapeHtml(d.nextStep)}</span>` : ""}</li>`,
          )
          .join("")}</ul>`
      : "";

  const actionButtons = candidate.alreadyLinked
    ? [
        candidate.suggestedModel
          ? `<button class="action-promote" data-mutation-kind="create-candidate" data-runtime="${escapeHtml(candidate.runtime)}" data-suggested-model="${escapeHtml(candidate.suggestedModel)}">Setup profile for suggested model</button>`
          : "",
        `<button class="action-neutral" data-command="pa runtime list --json">Inspect linked profiles</button>`,
      ]
        .filter(Boolean)
        .join("")
    : [
        `<button class="action-promote" data-mutation-kind="create-candidate" data-runtime="${escapeHtml(candidate.runtime)}" data-suggested-model="${escapeHtml(candidate.suggestedModel ?? "")}">Link profile from candidate</button>`,
      ].join("");

  return `<article class="profile-card" data-runtime-candidate="${escapeHtml(candidate.runtime)}">
  <div class="profile-header">
    <div class="profile-title">
      <span class="profile-id">${escapeHtml(candidate.displayName)}</span>
      ${linkedBadge}${confidenceBadge}${sourceBadge}
    </div>
    <div class="profile-runtime-label">${escapeHtml(candidate.runtime)} (local discovery)</div>
  </div>
  ${descriptionLine}
  <div class="profile-meta">${suggestedModelLine}</div>
  ${diagnostics}
  <div class="card-actions">${actionButtons}</div>
</article>`;
}

function renderScanSection(model: RuntimesPanelModel): string {
  const topDiagnostics =
    model.scanDiagnostics.length > 0
      ? `<ul class="diagnostic-list">${model.scanDiagnostics
          .map((d) => `<li class="diag-${escapeHtml(d.severity)}">${escapeHtml(d.message)}</li>`)
          .join("")}</ul>`
      : "";

  const statusLine = model.scanStatus
    ? `<div class="runtime-stats">Scan status: ${escapeHtml(model.scanStatus)}${model.scanCheckedAt ? ` &middot; scanned at ${escapeHtml(model.scanCheckedAt)}` : ""}</div>`
    : `<div class="runtime-stats">No scan results loaded yet.</div>`;

  const content = model.scanError
    ? `<div class="state-banner state-failed"><strong>Runtime scan failed</strong><p>${escapeHtml(model.scanError)}</p><p>Retry scan from this panel or run <code>pa runtime scan --json</code> in terminal.</p></div>`
    : model.scanCandidates.length === 0
      ? `<div class="empty-profiles">No runtime candidates discovered. Use Scan Runtimes to probe local availability.</div>`
      : `<div class="profile-list">${model.scanCandidates.map(renderScanCandidateCard).join("\n")}</div>`;

  return `<section class="runtime-section" data-section="scan-candidates">
  <div class="runtime-section-header">
    <div class="runtime-section-title"><span class="runtime-display-name">Discovered Runtime Candidates</span></div>
    <div class="runtime-description">Local discovery is machine-specific. Linking creates project-owned runtime profile config.</div>
    ${statusLine}
  </div>
  ${topDiagnostics}
  ${content}
</section>`;
}

const RUNTIMES_VIEW_STYLES = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 13px; }
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
  .state-banner { border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 12px; }
  .state-banner strong { display: block; font-size: 13px; margin-bottom: 4px; }
  .state-banner p { margin: 4px 0; color: var(--vscode-descriptionForeground); }
  .state-banner code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
  .state-loading { border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
  .state-empty { border: 1px solid color-mix(in srgb, rebeccapurple 45%, var(--vscode-panel-border)); background: color-mix(in srgb, rebeccapurple 10%, var(--vscode-editor-background)); }
  .state-failed { border: 1px solid color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 45%, var(--vscode-panel-border)); background: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 8%, var(--vscode-editor-background)); }
  .empty-actions { margin-top: 8px; font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.7; }
  .summary-bar { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .summary-sep { color: var(--vscode-panel-border); }
  .summary-count { font-weight: 600; color: var(--vscode-foreground); }
  .count-ready { color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 80%, var(--vscode-foreground)); font-weight: 600; }
  .count-blocked { color: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 80%, var(--vscode-foreground)); font-weight: 600; }
  .count-disabled { color: var(--vscode-descriptionForeground); }
  .count-available { font-weight: 600; color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 70%, var(--vscode-foreground)); }
  .runtime-section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
  .runtime-section.runtime-unavailable { opacity: 0.75; }
  .runtime-section-header { padding: 8px 10px; background: color-mix(in srgb, var(--vscode-panel-border) 40%, var(--vscode-editor-background)); border-bottom: 1px solid var(--vscode-panel-border); }
  .runtime-section-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 3px; }
  .runtime-display-name { font-size: 12px; font-weight: 600; }
  .runtime-description { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 3px; }
  .runtime-stats { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .stat-item { }
  .stat-sep { margin: 0 2px; color: var(--vscode-panel-border); }
  .profile-list { padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
  .profile-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; background: var(--vscode-editor-background); }
  .profile-card[data-readiness="ready"] { border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 45%, var(--vscode-panel-border)); }
  .profile-card[data-readiness="disabled"] { opacity: 0.72; }
  .profile-header { margin-bottom: 6px; }
  .profile-title { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 2px; }
  .profile-id { font-size: 12px; font-weight: 600; }
  .profile-runtime-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .profile-meta { margin-bottom: 6px; }
  .meta-row { font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 5px; margin-bottom: 2px; }
  .meta-label { min-width: 54px; font-weight: 500; color: var(--vscode-foreground); opacity: 0.7; }
  .meta-value { color: var(--vscode-descriptionForeground); }
  .diagnostic-list { font-size: 11px; margin: 0 0 6px 0; padding-left: 16px; }
  .diagnostic-list li { margin-bottom: 3px; }
  .diag-error { color: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 80%, var(--vscode-foreground)); }
  .diag-warning { color: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 80%, var(--vscode-foreground)); }
  .diag-hint { opacity: 0.75; }
  .card-actions { display: flex; flex-wrap: wrap; gap: 5px; border-top: 1px solid var(--vscode-panel-border); padding-top: 6px; margin-top: 4px; }
  .card-actions button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; }
  .action-neutral { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-color: var(--vscode-panel-border); }
  .action-promote { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 55%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 50%, var(--vscode-panel-border)); }
  .action-remove { background: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 45%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 45%, var(--vscode-panel-border)); }
  .empty-profiles { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 6px 0; }
  .empty-profiles code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
  .badge { display: inline-block; font-size: 10px; font-weight: 500; border-radius: 3px; padding: 1px 5px; text-transform: uppercase; letter-spacing: 0.03em; }
  .badge-ready { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 25%, var(--vscode-editor-background)); color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 90%, var(--vscode-foreground)); border: 1px solid color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 40%, var(--vscode-panel-border)); }
  .badge-blocked { background: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 18%, var(--vscode-editor-background)); color: color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 90%, var(--vscode-foreground)); border: 1px solid color-mix(in srgb, var(--vscode-charts-red, var(--vscode-terminal-ansiRed)) 35%, var(--vscode-panel-border)); }
  .badge-disabled { background: color-mix(in srgb, var(--vscode-panel-border) 35%, var(--vscode-editor-background)); color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-panel-border); }
  .badge-default { background: color-mix(in srgb, var(--vscode-button-background) 25%, var(--vscode-editor-background)); color: color-mix(in srgb, var(--vscode-button-background) 90%, var(--vscode-foreground)); border: 1px solid color-mix(in srgb, var(--vscode-button-background) 40%, var(--vscode-panel-border)); }
  .badge-source-adapter { background: color-mix(in srgb, rebeccapurple 18%, var(--vscode-editor-background)); color: color-mix(in srgb, rebeccapurple 90%, var(--vscode-foreground)); border: 1px solid color-mix(in srgb, rebeccapurple 35%, var(--vscode-panel-border)); }
  .badge-source-config { background: color-mix(in srgb, var(--vscode-charts-blue, var(--vscode-terminal-ansiBlue)) 18%, var(--vscode-editor-background)); color: color-mix(in srgb, var(--vscode-charts-blue, var(--vscode-terminal-ansiBlue)) 90%, var(--vscode-foreground)); border: 1px solid color-mix(in srgb, var(--vscode-charts-blue, var(--vscode-terminal-ansiBlue)) 35%, var(--vscode-panel-border)); }
  .section-heading { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); margin: 14px 0 8px; font-weight: 600; }
`;

const RUNTIMES_VIEW_SCRIPT = `
  const vscode = acquireVsCodeApi();

  document.querySelectorAll(".card-actions button[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      const command = button.getAttribute("data-command");
      if (command) {
        vscode.postMessage({ type: "stageCommand", command });
      }
    });
  });

  document.querySelectorAll(".card-actions button[data-mutation-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-mutation-kind");
      const profileId = button.getAttribute("data-profile-id") || "";
      const currentModel = button.getAttribute("data-current-model") || "";
      const runtime = button.getAttribute("data-runtime") || "";
      const suggestedModel = button.getAttribute("data-suggested-model") || "";
      if (kind) {
        vscode.postMessage({
          type: "mutation",
          kind,
          profileId,
          currentModel,
          runtime,
          suggestedModel,
        });
      }
    });
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });
  }

  const linkProfileBtn = document.getElementById("link-profile-btn");
  if (linkProfileBtn) {
    linkProfileBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "mutation", kind: "create", profileId: "", currentModel: "" });
    });
  }

  const scanRuntimesBtn = document.getElementById("scan-runtimes-btn");
  if (scanRuntimesBtn) {
    scanRuntimesBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "scan" });
    });
  }
`;

export function renderRuntimesHtml(model: RuntimesPanelModel): string {
  const nonce = String(Date.now());

  let pageContent: string;

  if (model.loadState === "loading") {
    pageContent = renderLoadingHtml();
  } else if (model.loadState === "failed") {
    pageContent = renderFailedHtml(model.error ?? "Unknown error.");
  } else if (model.loadState === "empty-inventory") {
    pageContent = `${renderEmptyHtml()}${renderScanSection(model)}`;
  } else {
    const summaryBar = renderSummaryBar(model);
    const onboardingBanner = renderOnboardingBanner(model);
    const scanSection = renderScanSection(model);
    const runtimeSections = model.runtimes
      .map((runtime) => renderRuntimeSection(runtime, model.profiles))
      .join("\n");

    const defaultLine = model.defaultProfile
      ? `<div class="section-heading">Default Profile: <code>${escapeHtml(model.defaultProfile)}</code></div>`
      : "";

    pageContent = `${summaryBar}${onboardingBanner}${scanSection}${defaultLine}${runtimeSections}`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${RUNTIMES_VIEW_STYLES}</style>
  </head>
  <body>
    <div class="pa-shell-layout" data-pa-shell-surface="${RUNTIMES_SHELL_SURFACE_ID}">
      <header class="pa-shell-region pa-shell-region-header">
        <div class="pa-shell-surface-marker">Shared Shell Surface</div>
        <div class="pa-shell-surface-title">Runtimes</div>
        <div class="pa-shell-surface-meta">Runtimes surface is migrated into shared shell composition through ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}; inventory, readiness diagnostics, scan candidates, and profile mutation flows remain runtimes-local.</div>
      </header>
      <main class="pa-shell-region pa-shell-region-main">
        <div class="pa-shell-surface-pane" data-pa-shell-pane="${RUNTIMES_SHELL_PANE_ID}">
    <div class="toolbar">
      <button class="button action-navigation" id="refresh-btn">Refresh</button>
      <button class="button action-navigation" id="scan-runtimes-btn">Scan Runtimes</button>
      <button class="button action-navigation" id="link-profile-btn">Link Profile</button>
    </div>
    ${pageContent}
        </div>
      </main>
    </div>
    <script nonce="${nonce}">${RUNTIMES_VIEW_SCRIPT}</script>
  </body>
</html>`;
}

export async function loadRuntimesPanelModelSnapshot(input: {
  workspaceRoot: string;
  dependencies?: {
    boundary?: ProjectArchBoundary;
  };
}): Promise<RuntimesPanelModel> {
  try {
    const inventory = await loadRuntimeManagementInventoryViewModel({
      boundary: input.dependencies?.boundary,
      cwd: input.workspaceRoot,
    });

    let scan: RuntimeManagementScanViewModel | undefined;
    let scanError: string | undefined;
    try {
      scan = await loadRuntimeManagementScanViewModel({
        boundary: input.dependencies?.boundary,
        cwd: input.workspaceRoot,
        linkedRuntimeIds: inventory.profiles
          .filter((profile) => profile.linked)
          .map((profile) => profile.runtime),
      });
    } catch (error) {
      scanError = error instanceof Error ? error.message : String(error);
    }

    return buildRuntimesPanelModel(inventory, scan, scanError);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildRuntimesPanelFailedModel(message);
  }
}

export async function runRuntimeProfileMutationFlow(input: {
  request: RuntimeProfileMutationRequest;
  windowApi: typeof vscode.window;
  stageCommand: (command: string) => void;
}): Promise<ProfileMutationFlowResult> {
  const kind = input.request.kind ?? "";
  const profileId = input.request.profileId ?? "";
  const currentModel = input.request.currentModel ?? "";
  const runtime = input.request.runtime ?? "";
  const suggestedModel = input.request.suggestedModel ?? "";

  if (kind === "create") {
    return runCreateProfileFlow({
      windowApi: input.windowApi,
      stageCommand: input.stageCommand,
    });
  }

  if (kind === "create-candidate") {
    return runCreateProfileFlow({
      windowApi: input.windowApi,
      stageCommand: input.stageCommand,
      prefillRuntime: runtime || undefined,
      prefillModel: suggestedModel || undefined,
    });
  }

  if (kind === "update-model" && profileId) {
    return runUpdateProfileModelFlow({
      profileId,
      currentModel: currentModel || null,
      windowApi: input.windowApi,
      stageCommand: input.stageCommand,
    });
  }

  if (kind === "unlink" && profileId) {
    return runUnlinkProfileFlow({
      profileId,
      windowApi: input.windowApi,
      stageCommand: input.stageCommand,
    });
  }

  return "cancelled";
}

// ---------------------------------------------------------------------------
// WebviewViewProvider
// ---------------------------------------------------------------------------

class RuntimesWebviewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private model: RuntimesPanelModel = buildRuntimesPanelLoadingModel();

  public constructor(
    private readonly workspaceRoot: string,
    private readonly windowApi: typeof vscode.window,
    private readonly dependencies?: {
      boundary?: ProjectArchBoundary;
      now?: () => string;
    },
  ) {}

  public async refresh(): Promise<void> {
    this.model = buildRuntimesPanelLoadingModel();
    this.render();

    this.model = await loadRuntimesPanelModelSnapshot({
      workspaceRoot: this.workspaceRoot,
      dependencies: {
        boundary: this.dependencies?.boundary,
      },
    });

    this.render();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(
      async (message: {
        type?: string;
        command?: string;
        kind?: string;
        profileId?: string;
        currentModel?: string;
        runtime?: string;
        suggestedModel?: string;
      }) => {
        if (message.type === "refresh") {
          await this.refresh();
          return;
        }

        if (message.type === "scan") {
          await this.refresh();
          return;
        }

        if (message.type === "stageCommand" && message.command) {
          this.stageCommandInTerminal(message.command);
          return;
        }

        if (message.type === "mutation") {
          const msg = message as {
            type: "mutation";
            kind?: string;
            profileId?: string;
            currentModel?: string;
            runtime?: string;
            suggestedModel?: string;
          };
          await this.handleMutationMessage(
            msg.kind ?? "",
            msg.profileId ?? "",
            msg.currentModel ?? "",
            msg.runtime ?? "",
            msg.suggestedModel ?? "",
          );
        }
      },
    );

    void this.refresh();
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderRuntimesHtml(this.model);
  }

  private async handleMutationMessage(
    kind: string,
    profileId: string,
    currentModel: string,
    runtime: string,
    suggestedModel: string,
  ): Promise<void> {
    const result = await runRuntimeProfileMutationFlow({
      request: {
        kind,
        profileId,
        currentModel,
        runtime,
        suggestedModel,
      },
      windowApi: this.windowApi,
      stageCommand: (cmd) => this.stageCommandInTerminal(cmd),
    });

    if (result === "staged") {
      const choice = await this.windowApi.showInformationMessage(
        "Command staged in terminal. Run it to apply the change, then refresh the panel.",
        "Refresh Panel",
      );
      if (choice === "Refresh Panel") {
        await this.refresh();
      }
    }
  }

  private stageCommandInTerminal(command: string): void {
    const terminal =
      this.windowApi.terminals.length > 0
        ? this.windowApi.terminals[0]
        : this.windowApi.createTerminal("Project Arch CLI");

    if (!terminal) {
      return;
    }

    terminal.show(true);
    terminal.sendText(command, false);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerRuntimesView(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "commands" | "window" | "workspace">,
  dependencies?: {
    boundary?: ProjectArchBoundary;
    now?: () => string;
  },
): void {
  const workspaceRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  const provider = new RuntimesWebviewProvider(workspaceRoot, api.window, dependencies);

  const providerRegistration = api.window.registerWebviewViewProvider(RUNTIMES_VIEW_ID, provider);

  const refreshCommand = api.commands.registerCommand(REFRESH_RUNTIMES_COMMAND_ID, async () => {
    await provider.refresh();
  });

  context.subscriptions.push(providerRegistration);
  context.subscriptions.push(refreshCommand);
}
