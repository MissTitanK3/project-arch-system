import type { StageChatRuntimeHandoffRecord } from "../integration/stageChatSessionBoundary";
import type { StageChatHandoffDirection } from "../integration/stageChatRuntimeHandoff";

// ---------------------------------------------------------------------------
// Default details – compact default view for a runtime transition event
// ---------------------------------------------------------------------------

/**
 * The minimal information shown by default when a runtime transition event is
 * rendered inline in the stage thread.
 *
 * Kept deliberately small: direction label, the two runtimes, reason label,
 * when it happened, and the current goal that was active at transition time.
 */
export interface StageChatTransitionDefaultDetails {
  /** Human-readable direction label. */
  directionLabel: string;
  /** Human-readable from-runtime label. */
  fromRuntimeLabel: string;
  /** Human-readable to-runtime label. */
  toRuntimeLabel: string;
  /** Human-readable reason label. */
  reasonLabel: string;
  /** ISO-8601 string of when the transition occurred. */
  occurredAt: string;
  /** The current-goal carried into the transfer summary. */
  currentGoal: string;
  /** Number of open questions recorded at handoff time. */
  openQuestionCount: number;
}

// ---------------------------------------------------------------------------
// Diagnostics – deeper information available on demand
// ---------------------------------------------------------------------------

/**
 * The deeper diagnostic data available when the user expands a transition
 * marker. Contains all optional sections from the transfer summary so that
 * the main thread view stays clean by default.
 */
export interface StageChatTransitionDiagnostics {
  keyFacts: string[];
  decisionsMade: string[];
  openQuestions: string[];
  proposedNextSteps: string[];
  pinnedNotes: string[];
  referencedArtifacts: string[];
  /** Full markdown transfer summary text for copy/reference. */
  fullSummaryText: string;
}

// ---------------------------------------------------------------------------
// Transition marker – a lightweight system event for the stage thread
// ---------------------------------------------------------------------------

/**
 * A single runtime-transition marker as it appears in the stage chat thread.
 *
 * Each marker corresponds exactly to one `StageChatRuntimeHandoffRecord` and
 * carries both default details (always visible) and deeper diagnostics
 * (available on demand).
 */
export interface StageChatTransitionMarker {
  id: string;
  threadKey: string;
  direction: StageChatHandoffDirection;
  defaultDetails: StageChatTransitionDefaultDetails;
  diagnostics: StageChatTransitionDiagnostics;
}

// ---------------------------------------------------------------------------
// Thread transition view – the ordered list of markers for a stage thread
// ---------------------------------------------------------------------------

/**
 * The full set of transition markers for a stage chat thread, in chronological
 * order, together with a summary count for quick status display.
 */
export interface StageChatThreadTransitionView {
  threadKey: string;
  markers: StageChatTransitionMarker[];
  /** Convenience count. Equal to `markers.length`. */
  transitionCount: number;
  /** True if any marker represents a local-to-cloud escalation. */
  hasEscalations: boolean;
  /** True if any marker represents a cloud-to-local de-escalation. */
  hasDeescalations: boolean;
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

/**
 * Converts a handoff direction to a human-readable label.
 */
export function formatTransitionDirectionLabel(direction: StageChatHandoffDirection): string {
  return direction === "local-to-cloud" ? "Switched to cloud" : "Returned to local";
}

/**
 * Converts a runtime class to a human-readable label.
 */
export function formatRuntimeLabel(runtime: "local" | "cloud"): string {
  return runtime === "local" ? "Local" : "Cloud";
}

/**
 * Converts a handoff reason to a human-readable label.
 */
export function formatTransitionReasonLabel(
  reason: "manual-escalation" | "manual-deescalation",
): string {
  return reason === "manual-escalation" ? "Manual escalation" : "Manual de-escalation";
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds a single `StageChatTransitionMarker` from a `StageChatRuntimeHandoffRecord`.
 */
export function buildTransitionMarker(
  record: StageChatRuntimeHandoffRecord,
): StageChatTransitionMarker {
  const { summary } = record;

  const defaultDetails: StageChatTransitionDefaultDetails = {
    directionLabel: formatTransitionDirectionLabel(record.direction),
    fromRuntimeLabel: formatRuntimeLabel(record.fromRuntime),
    toRuntimeLabel: formatRuntimeLabel(record.toRuntime),
    reasonLabel: formatTransitionReasonLabel(record.reason),
    occurredAt: new Date(record.createdAt).toISOString(),
    currentGoal: summary.currentGoal,
    openQuestionCount: summary.openQuestions.length,
  };

  const diagnostics: StageChatTransitionDiagnostics = {
    keyFacts: summary.keyFacts,
    decisionsMade: summary.decisionsMade,
    openQuestions: summary.openQuestions,
    proposedNextSteps: summary.proposedNextSteps ?? [],
    pinnedNotes: summary.pinnedNotes ?? [],
    referencedArtifacts: summary.referencedArtifacts ?? [],
    fullSummaryText: record.summaryText,
  };

  return {
    id: record.id,
    threadKey: record.threadKey,
    direction: record.direction,
    defaultDetails,
    diagnostics,
  };
}

/**
 * Builds the full `StageChatThreadTransitionView` from an ordered list of
 * `StageChatRuntimeHandoffRecord` values.
 *
 * Records should already be sorted chronologically (as stored in the handoff
 * state map). `buildTransitionMarker` is applied to each record in order.
 */
export function buildThreadTransitionView(
  threadKey: string,
  records: StageChatRuntimeHandoffRecord[],
): StageChatThreadTransitionView {
  const markers = records.map(buildTransitionMarker);

  return {
    threadKey,
    markers,
    transitionCount: markers.length,
    hasEscalations: markers.some((m) => m.direction === "local-to-cloud"),
    hasDeescalations: markers.some((m) => m.direction === "cloud-to-local"),
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

function renderStringList(items: string[]): string {
  if (items.length === 0) {
    return `<span class="empty-hint">None captured</span>`;
  }

  return `<ul class="diagnostic-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/**
 * Renders the default (always-visible) details of a transition marker as a
 * small system-event chip suitable for embedding inline in the stage thread.
 */
export function renderTransitionMarkerDefault(marker: StageChatTransitionMarker): string {
  const { defaultDetails: d } = marker;
  const directionClass =
    marker.direction === "local-to-cloud" ? "transition-escalation" : "transition-deescalation";

  const openQuestionsLine =
    d.openQuestionCount > 0
      ? `<span class="meta-hint">${d.openQuestionCount} open question${d.openQuestionCount === 1 ? "" : "s"} at transition</span>`
      : "";

  return `<div class="transition-marker ${escapeHtml(directionClass)}" data-marker-id="${escapeHtml(marker.id)}" data-thread-key="${escapeHtml(marker.threadKey)}">
  <div class="transition-header">
    <span class="transition-label">${escapeHtml(d.directionLabel)}</span>
    <span class="transition-runtime">${escapeHtml(d.fromRuntimeLabel)} → ${escapeHtml(d.toRuntimeLabel)}</span>
    <span class="transition-reason">${escapeHtml(d.reasonLabel)}</span>
    <span class="transition-time">${escapeHtml(d.occurredAt)}</span>
  </div>
  <div class="transition-goal">${escapeHtml(d.currentGoal)}</div>
  ${openQuestionsLine}
  <div class="transition-actions">
    <button class="action-expand-diagnostics" data-marker-id="${escapeHtml(marker.id)}" data-action="expand-diagnostics">Show diagnostics</button>
  </div>
</div>`;
}

/**
 * Renders the deeper diagnostics panel for a transition marker.
 *
 * This is hidden by default and revealed when the user activates the
 * "Show details" affordance on the marker's default view.
 */
export function renderTransitionMarkerDiagnostics(marker: StageChatTransitionMarker): string {
  const { diagnostics: d } = marker;

  const proposedNextStepsSection =
    d.proposedNextSteps.length > 0
      ? `<div class="diagnostic-section">
    <div class="diagnostic-label">Proposed Next Steps</div>
    ${renderStringList(d.proposedNextSteps)}
  </div>`
      : "";

  const pinnedNotesSection =
    d.pinnedNotes.length > 0
      ? `<div class="diagnostic-section">
    <div class="diagnostic-label">Pinned Notes</div>
    ${renderStringList(d.pinnedNotes)}
  </div>`
      : "";

  const referencedArtifactsSection =
    d.referencedArtifacts.length > 0
      ? `<div class="diagnostic-section">
    <div class="diagnostic-label">Referenced Artifacts</div>
    ${renderStringList(d.referencedArtifacts)}
  </div>`
      : "";

  return `<div class="transition-diagnostics" data-marker-id="${escapeHtml(marker.id)}" data-thread-key="${escapeHtml(marker.threadKey)}">
  <div class="diagnostic-section">
    <div class="diagnostic-label">Key Facts</div>
    ${renderStringList(d.keyFacts)}
  </div>
  <div class="diagnostic-section">
    <div class="diagnostic-label">Decisions Made</div>
    ${renderStringList(d.decisionsMade)}
  </div>
  <div class="diagnostic-section">
    <div class="diagnostic-label">Open Questions</div>
    ${renderStringList(d.openQuestions)}
  </div>
  ${proposedNextStepsSection}
  ${pinnedNotesSection}
  ${referencedArtifactsSection}
  <div class="diagnostic-actions">
    <button class="action-collapse-diagnostics" data-marker-id="${escapeHtml(marker.id)}" data-action="collapse-diagnostics">Hide diagnostics</button>
  </div>
</div>`;
}

/**
 * Renders a complete transition marker: default view + diagnostics panel,
 * wrapped together so they can be toggled as a unit.
 */
export function renderTransitionMarker(marker: StageChatTransitionMarker): string {
  return `<section class="transition-marker-block" data-marker-id="${escapeHtml(marker.id)}">
${renderTransitionMarkerDefault(marker)}
${renderTransitionMarkerDiagnostics(marker)}
</section>`;
}

/**
 * Renders the full `StageChatThreadTransitionView` as an ordered list of
 * transition markers with an optional header showing transition count.
 *
 * Returns an empty string when there are no transitions.
 */
export function renderThreadTransitionView(view: StageChatThreadTransitionView): string {
  if (view.transitionCount === 0) {
    return "";
  }

  const markerHtml = view.markers.map(renderTransitionMarker).join("\n");
  const plural = view.transitionCount === 1 ? "transition" : "transitions";

  return `<div class="thread-transitions" data-thread-key="${escapeHtml(view.threadKey)}">
  <div class="transitions-header">${view.transitionCount} runtime ${escapeHtml(plural)}</div>
  ${markerHtml}
</div>`;
}
