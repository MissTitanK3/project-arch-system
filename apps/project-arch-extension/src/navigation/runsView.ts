import { promises as fs } from "node:fs";
import path from "node:path";
import type * as vscode from "vscode";
import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";
import {
  loadRuntimeProfileLaunchBoundaryModel,
  type RuntimeLaunchEligibility,
  type RuntimeProfileLaunchBoundaryModel,
} from "../integration/runtimeProfileLaunchBoundary";
import {
  RUNS_SHELL_PANE_ID,
  RUNS_SHELL_SURFACE_ID,
  RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH,
} from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";
import { lookupRunStatus, type RunStatusLookupOutcome } from "../integration/runStatusLookup";
import { buildRunReviewContext, type RunReviewAction } from "../review/runReviewContext";
import { buildOrchestrationReviewContext } from "../review/orchestrationContext";
import { lookupRunAuditGroup } from "../review/auditContext";
import { OPEN_ARTIFACT_INSPECTOR_COMMAND_ID } from "./artifactInspectorPanel";
import { STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID } from "./commandCatalogView";
import type { ArtifactKind } from "./artifactNavigationModel";

export const RUNS_VIEW_ID = "projectArch.runs" as const;
export const REFRESH_RUNS_COMMAND_ID = "projectArch.refreshRuns" as const;

export interface RunsPanelArtifactLink {
  kind: ArtifactKind;
  relativePath: string;
  label: string;
  reason: string;
}

export interface RunsPanelCard {
  runId: string;
  taskRef: string;
  outcome: RunStatusLookupOutcome | "lookup-failed";
  launchedAt?: string;
  runtime?: string;
  nextStep: string;
  followUpActions: RunReviewAction[];
  artifacts: RunsPanelArtifactLink[];
  orchestrationSummary?: string;
  hasAuditErrors: boolean;
  auditSummary: string;
  error?: string;
}

export interface RunsPanelModel {
  generatedAt: string;
  runCount: number;
  needsAttentionCount: number;
  orchestratedCount: number;
  auditErrorCount: number;
  runtimeProfiles: RunsPanelRuntimeProfilesModel;
  cards: RunsPanelCard[];
}

export interface RunsPanelRuntimeProfileOption {
  id: string;
  runtime: string;
  model?: string | null;
  isDefault: boolean;
  eligibility: RuntimeLaunchEligibility;
  inlineSummary: string;
}

export interface RunsPanelRuntimeProfilesModel {
  loadState: "loaded" | "empty-inventory" | "failed";
  sourceAuthority: string;
  defaultProfile?: string;
  decisionReason: string;
  nextStep: string;
  refreshCommand: string;
  readyCount: number;
  disabledCount: number;
  blockedCount: number;
  options: RunsPanelRuntimeProfileOption[];
  error?: string;
}

interface RunsPanelBuildDependencies {
  boundary?: ProjectArchBoundary;
  now?: () => string;
  discoverRunIds?: (workspaceRoot: string, limit: number) => Promise<string[]>;
  loadRuntimeProfiles?: (input: {
    boundary: ProjectArchBoundary;
    workspaceRoot: string;
  }) => Promise<RuntimeProfileLaunchBoundaryModel>;
  limit?: number;
}

const RUN_ID_PATTERN = /^run-\d{4}-\d{2}-\d{2}-\d{6}$/;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

async function listFilesInDir(dirPath: string): Promise<string[]> {
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((entry) => entry.endsWith(".json"));
}

export async function discoverRecentRunIds(workspaceRoot: string, limit = 24): Promise<string[]> {
  const candidateDirs = [
    path.join(workspaceRoot, ".project-arch", "agent-runtime", "launches"),
    path.join(workspaceRoot, ".project-arch", "agent-runtime", "runs"),
    path.join(workspaceRoot, ".project-arch", "agent-runtime", "orchestration"),
  ];

  const runIds = new Set<string>();

  for (const dirPath of candidateDirs) {
    const files = await listFilesInDir(dirPath);
    for (const fileName of files) {
      const runId = path.basename(fileName, ".json");
      if (!RUN_ID_PATTERN.test(runId)) {
        continue;
      }

      runIds.add(runId);
    }
  }

  return [...runIds].sort((left, right) => right.localeCompare(left)).slice(0, limit);
}

function inferArtifactKind(relativePath: string): ArtifactKind {
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

function uniqueArtifacts(input: RunsPanelArtifactLink[]): RunsPanelArtifactLink[] {
  const seen = new Set<string>();
  const output: RunsPanelArtifactLink[] = [];

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

async function findReconcileArtifactByRunId(
  workspaceRoot: string,
  runId: string,
): Promise<string | undefined> {
  const reconcileDir = path.join(workspaceRoot, ".project-arch", "reconcile");
  if (!(await pathExists(reconcileDir))) {
    return undefined;
  }

  const entries = await fs.readdir(reconcileDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(reconcileDir, entry.name);
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      const payload = JSON.parse(content) as Record<string, unknown>;
      if (payload["runId"] === runId) {
        return toRelativePath(workspaceRoot, absolutePath);
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function outcomeNeedsAttention(outcome: RunStatusLookupOutcome | "lookup-failed"): boolean {
  return (
    outcome === "lookup-failed" ||
    outcome === "launch-failed" ||
    outcome === "post-launch-awaiting-validation" ||
    outcome === "validation-failed" ||
    outcome === "validation-passed-awaiting-reconcile" ||
    outcome === "reconciliation-failed" ||
    outcome === "orchestration-failed" ||
    outcome === "orchestration-waiting-for-import"
  );
}

function defaultNextStep(outcome: RunStatusLookupOutcome | "lookup-failed"): string {
  switch (outcome) {
    case "lookup-failed":
      return "Run pa agent status <runId> --json and inspect launch/runtime output.";
    case "pre-launch":
      return "Run pa agent run <taskRef> --runtime <runtime> --json.";
    case "launch-dispatched":
      return "Run pa agent status <runId> --json to confirm run record availability.";
    case "launch-failed":
      return "Fix launch/runtime errors, then re-run pa agent run.";
    case "post-launch-awaiting-validation":
      return "Run pa agent validate <runId> --json.";
    case "validation-failed":
      return "Review diagnostics, update repository state, then re-run validate.";
    case "validation-passed-awaiting-reconcile":
      return "Run pa agent reconcile <runId> --json.";
    case "reconciliation-failed":
      return "Fix reconcile blockers and retry pa agent reconcile.";
    case "reconciled":
      return "No follow-up required; run is reconciled.";
    case "orchestration-in-progress":
      return "Monitor orchestration progress and review handoff context.";
    case "orchestration-waiting-for-import":
      return "Import result bundle, then run validate and reconcile.";
    case "orchestration-failed":
      return "Inspect failed role context and continue with validate/reconcile fallback.";
    case "orchestration-completed":
      return "Review outputs and reconcile if required by run review status.";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function buildCardArtifacts(input: {
  runRecordPath?: string;
  launchRecordPath?: string;
  orchestrationPath?: string;
  reconcilePath?: string;
  auditLogPath?: string;
}): RunsPanelArtifactLink[] {
  const links: RunsPanelArtifactLink[] = [];

  const push = (relativePath: string | undefined, label: string, reason: string): void => {
    if (!relativePath) {
      return;
    }

    links.push({
      kind: inferArtifactKind(`/${relativePath}`),
      relativePath,
      label,
      reason,
    });
  };

  push(input.runRecordPath, "Run Record", "Canonical validated run record");
  push(input.launchRecordPath, "Launch Record", "Adapter launch context");
  push(input.orchestrationPath, "Orchestration Record", "Multi-agent orchestration details");
  push(input.reconcilePath, "Reconcile Artifact", "Latest reconcile output for this run");
  push(input.auditLogPath, "Audit Context", "Audit trail for command and status events");

  return uniqueArtifacts(links);
}

function buildRuntimeProfilesModel(
  model: RuntimeProfileLaunchBoundaryModel,
): RunsPanelRuntimeProfilesModel {
  const readyCount = model.options.filter((option) => option.eligibility === "ready").length;
  const disabledCount = model.options.filter((option) => option.eligibility === "disabled").length;
  const blockedCount = model.options.filter((option) => option.eligibility === "blocked").length;

  return {
    loadState: model.options.length === 0 ? "empty-inventory" : "loaded",
    sourceAuthority: model.source.authority,
    defaultProfile: model.defaultProfile,
    decisionReason: model.decision.reason,
    nextStep: model.decision.nextStep,
    refreshCommand: model.source.inventoryCommand,
    readyCount,
    disabledCount,
    blockedCount,
    options: model.options.map((option) => ({
      id: option.id,
      runtime: option.runtime,
      model: option.model,
      isDefault: option.isDefault,
      eligibility: option.eligibility,
      inlineSummary: option.inlineSummary,
    })),
  };
}

function buildFailedRuntimeProfilesModel(error: unknown): RunsPanelRuntimeProfilesModel {
  const message = error instanceof Error ? error.message : String(error);

  return {
    loadState: "failed",
    sourceAuthority: "project-arch-cli-json",
    decisionReason: "Runtime inventory could not be loaded.",
    nextStep: "Run pa runtime list --json and inspect the returned runtime inventory payload.",
    refreshCommand: "pa runtime list --json",
    readyCount: 0,
    disabledCount: 0,
    blockedCount: 0,
    options: [],
    error: message,
  };
}

function formatRuntimeProfileEligibility(eligibility: RuntimeLaunchEligibility): string {
  switch (eligibility) {
    case "ready":
      return "Ready";
    case "disabled":
      return "Disabled";
    case "blocked":
      return "Blocked";
  }
}

function renderRuntimeProfilesSection(model: RunsPanelRuntimeProfilesModel): string {
  const summary = `<div class="runtime-summary-grid">
      <div class="summary-card"><div class="summary-label">Ready Profiles</div><div class="summary-value">${model.readyCount}</div></div>
      <div class="summary-card"><div class="summary-label">Blocked Profiles</div><div class="summary-value">${model.blockedCount}</div></div>
      <div class="summary-card"><div class="summary-label">Disabled Profiles</div><div class="summary-value">${model.disabledCount}</div></div>
      <div class="summary-card"><div class="summary-label">Default Profile</div><div class="summary-value">${escapeHtml(model.defaultProfile ?? "none")}</div></div>
    </div>`;

  const openRuntimesButton =
    '<button class="button action-navigation" data-runtime-panel-action="openRuntimesPanel">Open Runtimes Panel</button>';

  const header = `<section class="runtime-section" data-runtime-profiles-section>
      <div class="section-header">
        <div>
          <div class="kind">Runtime State</div>
          <div class="title">Runtime Profiles</div>
          <div class="meta">Source of truth: ${escapeHtml(model.sourceAuthority)} · Refresh via ${escapeHtml(model.refreshCommand)}</div>
          <div class="meta">Runs is history and follow-up only. Start new runs from task artifacts; inventory, readiness diagnostics, onboarding, and profile mutation are owned by the Runtimes panel.</div>
        </div>
        <div class="runtime-card-actions">${openRuntimesButton}</div>
      </div>
      ${summary}`;

  if (model.loadState === "failed") {
    return `${header}
      <article class="runtime-card runtime-card-state-failed">
        <div class="title">Runtime inventory unavailable</div>
        <div class="summary">${escapeHtml(model.decisionReason)}</div>
        <div class="summary">${escapeHtml(model.error ?? "Unknown runtime inventory failure.")}</div>
        <div class="next-step">Next: ${escapeHtml(model.nextStep)}</div>
        <div class="runtime-card-actions">
          <button class="button action-navigation" data-runtime-panel-action="openRuntimesPanel">Open Runtimes Panel</button>
        </div>
      </article>
    </section>`;
  }

  if (model.loadState === "empty-inventory") {
    return `${header}
      <article class="runtime-card runtime-card-state-empty">
        <div class="title">No linked runtime profiles</div>
        <div class="summary">Launch target management is handled in the Runtimes panel.</div>
        <div class="summary">Start new runs from task artifacts in the Artifacts panel.</div>
        <div class="summary">${escapeHtml(model.decisionReason)}</div>
        <div class="next-step">Next: ${escapeHtml(model.nextStep)}</div>
        <div class="runtime-card-actions">
          <button class="button action-navigation" data-runtime-panel-action="openRuntimesPanel">Open Runtimes Panel</button>
        </div>
      </article>
    </section>`;
  }

  const cards = model.options
    .map((option) => {
      const badges = [
        option.isDefault ? '<span class="runtime-badge runtime-badge-default">Default</span>' : "",
        `<span class="runtime-badge runtime-badge-${escapeHtml(option.eligibility)}">${escapeHtml(formatRuntimeProfileEligibility(option.eligibility))}</span>`,
      ]
        .filter((value) => value.length > 0)
        .join("");

      return `<article class="runtime-card" data-runtime-profile-card="${escapeHtml(option.id)}">
        <div class="runtime-card-header">
          <div>
            <div class="title">${escapeHtml(option.id)}</div>
            <div class="meta">Runtime ${escapeHtml(option.runtime)} · Model ${escapeHtml(option.model ?? "not set")}</div>
          </div>
          <div class="runtime-badges">${badges}</div>
        </div>
        <div class="summary">${escapeHtml(option.inlineSummary)}</div>
        <div class="runtime-card-actions">
          ${
            option.eligibility === "ready"
              ? `<button class="button action-navigation" data-runtime-panel-action="openRuntimesPanel">Open Runtimes Panel</button>`
              : `<button class="button" data-runtime-panel-action="inspectRuntimeProfile" data-runtime-profile-id="${escapeHtml(option.id)}">Inspect Diagnostics</button>`
          }
        </div>
      </article>`;
    })
    .join("\n");

  return `${header}
      <div class="summary">${escapeHtml(model.decisionReason)}</div>
      <div class="next-step">Next: ${escapeHtml(model.nextStep)}</div>
      <div class="runtime-grid">${cards}</div>
    </section>`;
}

export async function buildRunsPanelModel(input: {
  workspaceRoot: string;
  dependencies?: RunsPanelBuildDependencies;
}): Promise<RunsPanelModel> {
  const boundary = input.dependencies?.boundary ?? createProjectArchBoundary();
  const now = input.dependencies?.now ?? (() => new Date().toISOString());
  const limit = input.dependencies?.limit ?? 24;
  const discover = input.dependencies?.discoverRunIds ?? discoverRecentRunIds;
  const loadRuntimeProfiles =
    input.dependencies?.loadRuntimeProfiles ??
    (async ({
      boundary: candidateBoundary,
      workspaceRoot,
    }: {
      boundary: ProjectArchBoundary;
      workspaceRoot: string;
    }) =>
      await loadRuntimeProfileLaunchBoundaryModel({
        boundary: candidateBoundary,
        cwd: workspaceRoot,
      }));

  const runtimeProfiles = await loadRuntimeProfiles({
    boundary,
    workspaceRoot: input.workspaceRoot,
  })
    .then((model) => buildRuntimeProfilesModel(model))
    .catch((error) => buildFailedRuntimeProfilesModel(error));

  const runIds = await discover(input.workspaceRoot, limit);
  const cards: RunsPanelCard[] = [];

  for (const runId of runIds) {
    try {
      const statusViewModel = await lookupRunStatus({
        runId,
        boundary,
        cwd: input.workspaceRoot,
      });

      const reviewContext = buildRunReviewContext(statusViewModel);
      const orchestrationContext =
        statusViewModel.orchestrationRecordExists && statusViewModel.orchestration
          ? buildOrchestrationReviewContext(statusViewModel)
          : undefined;

      const auditGroup = await lookupRunAuditGroup({
        runId,
        boundary,
        cwd: input.workspaceRoot,
      });

      const reconcilePath = await findReconcileArtifactByRunId(input.workspaceRoot, runId);
      const artifacts = buildCardArtifacts({
        runRecordPath: reviewContext.artifacts.runRecordPath,
        launchRecordPath: reviewContext.artifacts.launchRecordPath,
        orchestrationPath: reviewContext.artifacts.orchestrationPath,
        reconcilePath,
        auditLogPath: auditGroup.navigation.logPath,
      });

      const firstCommandAction = reviewContext.followUpActions.find(
        (action) => action.cliArgs.length > 0,
      );
      const nextStep = firstCommandAction
        ? `${firstCommandAction.label}: pa ${firstCommandAction.cliArgs.join(" ")}`
        : defaultNextStep(reviewContext.outcome);

      const latestAuditEvent = auditGroup.events[auditGroup.events.length - 1];
      const auditSummary = latestAuditEvent
        ? `${latestAuditEvent.command} → ${latestAuditEvent.status}${latestAuditEvent.message ? ` (${latestAuditEvent.message})` : ""}`
        : "No audit events linked to this run yet.";

      const orchestrationSummary = orchestrationContext
        ? `${orchestrationContext.lifecyclePosition} Completed roles: ${
            orchestrationContext.roleProgress
              .filter((role) => role.state === "completed")
              .map((role) => role.role)
              .join(", ") || "none"
          }.`
        : undefined;

      cards.push({
        runId,
        taskRef: reviewContext.taskRef,
        outcome: reviewContext.outcome,
        launchedAt: reviewContext.launchedAt,
        runtime: reviewContext.runtime,
        nextStep,
        followUpActions: reviewContext.followUpActions,
        artifacts,
        orchestrationSummary,
        hasAuditErrors: auditGroup.hasErrors,
        auditSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      cards.push({
        runId,
        taskRef: "unknown",
        outcome: "lookup-failed",
        nextStep: defaultNextStep("lookup-failed"),
        followUpActions: [],
        artifacts: buildCardArtifacts({
          launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
          runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
          orchestrationPath: `.project-arch/agent-runtime/orchestration/${runId}.json`,
          auditLogPath: ".project-arch/agent-runtime/logs/execution.jsonl",
        }),
        hasAuditErrors: false,
        auditSummary: "Audit status unavailable.",
        error: message,
      });
    }
  }

  cards.sort((left, right) => {
    if (left.launchedAt && right.launchedAt) {
      return right.launchedAt.localeCompare(left.launchedAt);
    }

    if (left.launchedAt && !right.launchedAt) {
      return -1;
    }

    if (!left.launchedAt && right.launchedAt) {
      return 1;
    }

    return right.runId.localeCompare(left.runId);
  });

  return {
    generatedAt: now(),
    runCount: cards.length,
    needsAttentionCount: cards.filter((card) => outcomeNeedsAttention(card.outcome)).length,
    orchestratedCount: cards.filter((card) => card.outcome.startsWith("orchestration-")).length,
    auditErrorCount: cards.filter((card) => card.hasAuditErrors).length,
    runtimeProfiles,
    cards,
  };
}

export function renderRunsHtml(model: RunsPanelModel): string {
  const nonce = String(Date.now());
  const runtimeProfilesSection = renderRuntimeProfilesSection(model.runtimeProfiles);

  const cards = model.cards
    .map((card) => {
      const followUpRows = card.followUpActions
        .map((action) => {
          if (action.cliArgs.length === 0) {
            return "";
          }

          return `<button class="action-run" data-run-id="${escapeHtml(card.runId)}" data-action-id="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`;
        })
        .join("");

      const artifactRows = card.artifacts
        .map(
          (artifact) => `<li>
            <strong>${escapeHtml(artifact.label)}</strong>
            <span>${escapeHtml(artifact.reason)}</span>
            <button
              class="action-stage"
              data-artifact-kind="${escapeHtml(artifact.kind)}"
              data-artifact-path="${escapeHtml(artifact.relativePath)}"
              data-artifact-label="${escapeHtml(artifact.label)}"
            >Open</button>
          </li>`,
        )
        .join("");

      return `<article class="card" data-run-card="${escapeHtml(card.runId)}">
        <div class="kind">Run</div>
        <div class="title">${escapeHtml(card.runId)}</div>
        <div class="meta">Task ${escapeHtml(card.taskRef)} · ${escapeHtml(card.outcome)} · Runtime ${escapeHtml(card.runtime ?? "unknown")}</div>
        <div class="meta">Launched ${escapeHtml(formatTimestamp(card.launchedAt))}</div>
        <div class="next-step">Next: ${escapeHtml(card.nextStep)}</div>
        ${card.orchestrationSummary ? `<div class="summary">${escapeHtml(card.orchestrationSummary)}</div>` : ""}
        <div class="summary">Audit: ${escapeHtml(card.auditSummary)}${card.hasAuditErrors ? " (errors detected)" : ""}</div>
        ${card.error ? `<div class="summary">Status lookup error: ${escapeHtml(card.error)}</div>` : ""}
        <div class="actions-section">
          <div class="actions-heading">Follow-up Actions</div>
          <div class="actions">${followUpRows || '<button class="action-stage" disabled>No CLI follow-up action</button>'}</div>
        </div>
        <div class="actions-section">
          <div class="actions-heading">Linked Artifacts</div>
          ${artifactRows ? `<ul class="artifact-list">${artifactRows}</ul>` : "<p>No linked artifacts found.</p>"}
        </div>
      </article>`;
    })
    .join("\n");

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
        .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; width: 100%; }
        .summary-card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 8px; background: var(--vscode-editor-background); }
        .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin-bottom: 3px; }
        .summary-value { font-size: 14px; font-weight: 700; }
        .section-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .runtime-section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; background: var(--vscode-editor-background); margin-bottom: 10px; }
        .runtime-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
        .runtime-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
        .runtime-card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-panel-border)); }
        .runtime-card-state-empty, .runtime-card-state-failed { background: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-panel-border)); }
        .runtime-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .runtime-badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
        .runtime-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 7px; font-size: 10px; font-weight: 600; border: 1px solid var(--vscode-panel-border); }
        .runtime-card-actions { display: flex; gap: 6px; margin-top: 8px; }
        .runtime-card-actions .button { width: 100%; }
        .runtime-badge-default { background: color-mix(in srgb, var(--vscode-charts-blue, var(--vscode-focusBorder)) 22%, var(--vscode-editor-background)); }
        .runtime-badge-selected { background: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 25%, var(--vscode-editor-background)); }
        .runtime-badge-ready { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 25%, var(--vscode-editor-background)); }
        .runtime-badge-disabled { background: color-mix(in srgb, var(--vscode-descriptionForeground) 20%, var(--vscode-editor-background)); }
        .runtime-badge-blocked { background: color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 22%, var(--vscode-editor-background)); }
        .filter-row { margin-bottom: 10px; }
        .filter-input { width: 100%; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; padding: 6px 8px; font-size: 11px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
        .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; background: var(--vscode-editor-background); }
        .kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
        .title { font-size: 12px; font-weight: 600; margin-bottom: 6px; word-break: break-word; }
        .meta, .summary, .next-step { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
        .next-step { color: var(--vscode-foreground); }
        .actions-section { border-top: 1px solid var(--vscode-panel-border); margin-top: 8px; padding-top: 8px; }
        .actions-heading { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
        .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
        .actions button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 6px 8px; font-size: 11px; cursor: pointer; width: 100%; min-height: 30px; text-align: center; }
        .actions button.action-run { background: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 58%, var(--vscode-editor-background)); color: #ffffff; border-color: color-mix(in srgb, var(--vscode-charts-orange, var(--vscode-terminal-ansiYellow)) 52%, var(--vscode-panel-border)); }
        .actions button.action-stage { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 58%, var(--vscode-editor-background)); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-terminal-ansiGreen)) 52%, var(--vscode-panel-border)); }
        .actions button:disabled { opacity: 0.7; cursor: not-allowed; }
        .artifact-list { margin: 0; padding-left: 16px; display: grid; gap: 4px; }
        .artifact-list li { font-size: 11px; color: var(--vscode-descriptionForeground); }
        .guide { border: 1px solid var(--vscode-panel-border); border-radius: 8px; margin-bottom: 10px; background: var(--vscode-editor-background); overflow: hidden; }
        .guide summary { font-size: 11px; font-weight: 600; padding: 8px 10px; cursor: pointer; user-select: none; list-style: none; display: flex; align-items: center; gap: 6px; }
        .guide summary::-webkit-details-marker { display: none; }
        .guide summary::before { content: "▶"; font-size: 9px; transition: transform 0.15s; display: inline-block; color: var(--vscode-descriptionForeground); }
        .guide[open] summary::before { transform: rotate(90deg); }
        .guide-body { padding: 0 10px 10px; }
        .guide-body p { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
        .guide-body ol { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0 0 8px; padding-left: 18px; }
        .guide-body li { margin-bottom: 4px; }
        .guide-body code { font-family: var(--vscode-editor-font-family, monospace); font-size: 10px; background: var(--vscode-textCodeBlock-background, color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-panel-border))); border-radius: 3px; padding: 1px 4px; }
      </style>
    </head>
    <body>
      <div class="pa-shell-layout" data-pa-shell-surface="${RUNS_SHELL_SURFACE_ID}">
        <header class="pa-shell-region pa-shell-region-header">
          <div class="pa-shell-surface-marker">Shared Shell Surface</div>
          <div class="pa-shell-surface-title">Runs</div>
          <div class="pa-shell-surface-meta">Runs surface is migrated into shared shell composition through ${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}; run state, follow-up orchestration, and host message routing remain runs-local.</div>
        </header>
        <main class="pa-shell-region pa-shell-region-main">
          <div class="pa-shell-surface-pane" data-pa-shell-pane="${RUNS_SHELL_PANE_ID}">
      <div class="toolbar">
        <button class="button action-navigation" id="refresh-btn">Refresh</button>
      </div>
      <details class="guide"${model.runCount === 0 ? " open" : ""}>
        <summary>How to perform runs</summary>
        <div class="guide-body">
          <p>Runs represent a single agent execution tied to a task. Start new runs from task artifacts in the Artifacts panel, then use this panel to inspect history and progress follow-up steps:</p>
          <ol>
            <li><strong>Start a run</strong> — use the task artifact's <code>Launch Run</code> action, or run:<br/><code>pa agent run &lt;taskRef&gt; --runtime &lt;runtime&gt; --json</code></li>
            <li><strong>Check status</strong> — confirm the run record is available:<br/><code>pa agent status &lt;runId&gt; --json</code></li>
            <li><strong>Validate</strong> — review agent output against repository expectations:<br/><code>pa agent validate &lt;runId&gt; --json</code></li>
            <li><strong>Reconcile</strong> — apply validated changes to the repository:<br/><code>pa agent reconcile &lt;runId&gt; --json</code></li>
          </ol>
          <p>For orchestrated runs (multi-agent): after importing the result bundle, run validate then reconcile as normal. Use the <strong>Refresh</strong> button above to reload this panel after each step.</p>
        </div>
      </details>
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-label">Runs</div><div class="summary-value">${model.runCount}</div></div>
        <div class="summary-card"><div class="summary-label">Needs Attention</div><div class="summary-value">${model.needsAttentionCount}</div></div>
        <div class="summary-card"><div class="summary-label">Orchestrated</div><div class="summary-value">${model.orchestratedCount}</div></div>
        <div class="summary-card"><div class="summary-label">Audit Errors</div><div class="summary-value">${model.auditErrorCount}</div></div>
      </div>
      ${runtimeProfilesSection}
      <div class="filter-row"><input class="filter-input" id="run-filter" placeholder="Filter by run id, task ref, or outcome" /></div>
      <div class="grid" id="run-grid">${cards}</div>
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

        const refreshBtn = document.getElementById("refresh-btn");
        if (refreshBtn) {
          refreshBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "refresh" });
          });
        }

        const filterInput = document.getElementById("run-filter");
        if (filterInput) {
          filterInput.addEventListener("input", () => {
            const query = String(filterInput.value || "").toLowerCase().trim();
            document.querySelectorAll("[data-run-card]").forEach((card) => {
              const text = String(card.textContent || "").toLowerCase();
              card.hidden = query.length > 0 && !text.includes(query);
            });
          });
        }

        document.querySelectorAll("button[data-run-id][data-action-id]").forEach((button) => {
          button.addEventListener("click", () => {
            const runId = button.getAttribute("data-run-id");
            const actionId = button.getAttribute("data-action-id");
            if (!runId || !actionId) {
              return;
            }
            vscode.postMessage({ type: "runFollowUp", runId, actionId });
          });
        });

        document.querySelectorAll("button[data-artifact-kind][data-artifact-path][data-artifact-label]").forEach((button) => {
          button.addEventListener("click", () => {
            const kind = button.getAttribute("data-artifact-kind");
            const relativePath = button.getAttribute("data-artifact-path");
            const label = button.getAttribute("data-artifact-label");
            if (!kind || !relativePath || !label) {
              return;
            }

            vscode.postMessage({
              type: "openArtifact",
              kind,
              relativePath,
              label,
            });
          });
        });

        document.querySelectorAll("button[data-runtime-panel-action]").forEach((button) => {
          button.addEventListener("click", () => {
            const action = button.getAttribute("data-runtime-panel-action");
            const profileId = button.getAttribute("data-runtime-profile-id");
            if (!action) {
              return;
            }

            vscode.postMessage({
              type: "runtimeProfileAction",
              action,
              profileId,
            });
          });
        });
      </script>
    </body>
  </html>`;
}

class RunsWebviewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private model: RunsPanelModel | undefined;

  public constructor(
    private readonly workspaceRoot: string,
    private readonly api: Pick<typeof vscode, "window" | "commands">,
    private readonly dependencies?: RunsPanelBuildDependencies,
  ) {}

  private async loadModel(): Promise<RunsPanelModel> {
    this.model = await buildRunsPanelModel({
      workspaceRoot: this.workspaceRoot,
      dependencies: this.dependencies,
    });
    return this.model;
  }

  private findRuntimeProfileOption(profileId: string): RunsPanelRuntimeProfileOption | undefined {
    return this.model?.runtimeProfiles.options.find((option) => option.id === profileId);
  }

  private async openRuntimesPanel(): Promise<void> {
    try {
      await this.api.commands.executeCommand("projectArch.runtimes.focus");
      return;
    } catch {
      // Continue with fallback navigation.
    }

    try {
      await this.api.commands.executeCommand("workbench.view.extension.projectArch");
      await this.api.commands.executeCommand("projectArch.runtimes.focus");
    } catch {
      await this.api.window.showWarningMessage(
        "Project Arch: Unable to focus the Runtimes panel automatically. Open 'Project Arch Runtimes' from the Project Arch sidebar.",
      );
    }
  }

  private async inspectRuntimeProfile(profileId: string): Promise<void> {
    const option = this.findRuntimeProfileOption(profileId);
    if (!option) {
      await this.api.window.showWarningMessage(
        `Project Arch: Runtime profile '${profileId}' is not available in the Runs panel.`,
      );
      return;
    }

    const detailsCommand = `pa runtime check ${option.id} --json`;
    await this.api.commands.executeCommand(
      STAGE_COMMAND_IN_NEW_TERMINAL_COMMAND_ID,
      detailsCommand,
    );
  }

  public async refresh(): Promise<void> {
    await this.loadModel();
    await this.render();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(
      async (message: {
        type?: string;
        action?: string;
        profileId?: string;
        runId?: string;
        actionId?: string;
        kind?: ArtifactKind;
        relativePath?: string;
        label?: string;
      }) => {
        if (message.type === "refresh") {
          await this.refresh();
          return;
        }

        if (message.type === "runtimeProfileAction" && message.profileId) {
          if (message.action === "inspectRuntimeProfile") {
            await this.inspectRuntimeProfile(message.profileId);
            return;
          }
        }

        if (message.type === "runtimeProfileAction" && message.action === "openRuntimesPanel") {
          await this.openRuntimesPanel();
          return;
        }

        if (message.type === "runFollowUp" && message.runId && message.actionId && this.model) {
          const card = this.model.cards.find((candidate) => candidate.runId === message.runId);
          const action = card?.followUpActions.find(
            (candidate) => candidate.id === message.actionId,
          );
          if (!action || action.cliArgs.length === 0) {
            await this.api.window.showWarningMessage(
              `Project Arch: Follow-up action '${message.actionId}' is not currently executable.`,
            );
            return;
          }

          const boundary = this.dependencies?.boundary ?? createProjectArchBoundary();
          try {
            await boundary.runCliJson({
              args: action.cliArgs,
              cwd: this.workspaceRoot,
            });
            await this.api.window.showInformationMessage(
              `Project Arch: Completed '${action.label}' for ${message.runId}.`,
            );
            await this.refresh();
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            await this.api.window.showErrorMessage(
              `Project Arch: '${action.label}' failed for ${message.runId}. ${detail}`,
            );
          }
          return;
        }

        if (
          message.type === "openArtifact" &&
          message.relativePath &&
          message.kind &&
          message.label
        ) {
          await this.api.commands.executeCommand(OPEN_ARTIFACT_INSPECTOR_COMMAND_ID, {
            kind: message.kind,
            relativePath: message.relativePath,
            label: message.label,
          });
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
    this.view.webview.html = renderRunsHtml(model);
  }
}

export function registerRunsView(
  context: vscode.ExtensionContext,
  api: Pick<typeof vscode, "window" | "workspace" | "commands">,
  dependencies?: RunsPanelBuildDependencies,
): void {
  const workspaceRoot = api.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const provider = new RunsWebviewProvider(workspaceRoot, api, dependencies);

  const viewRegistration = api.window.registerWebviewViewProvider(RUNS_VIEW_ID, provider);
  const refreshCommand = api.commands.registerCommand(REFRESH_RUNS_COMMAND_ID, async () => {
    await provider.refresh();
  });

  context.subscriptions.push(viewRegistration);
  context.subscriptions.push(refreshCommand);
}
