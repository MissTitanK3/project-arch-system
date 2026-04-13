// ---------------------------------------------------------------------------
// Stage-chat proposal review surfaces
//
// Proposals are stage-chat suggestions that affect canonical or
// extension-owned state. They must be explicitly accepted or rejected before
// any change is applied. This module provides the model, pure builder
// functions, and HTML rendering helpers for the review surface.
//
// Writeback behavior (applying an accepted proposal) is handled separately
// in task 004. This module is purely for presentation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Command IDs
// ---------------------------------------------------------------------------

export const ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID = "projectArch.acceptStageChatProposal" as const;
export const REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID = "projectArch.rejectStageChatProposal" as const;

// ---------------------------------------------------------------------------
// Proposal status and kind
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a single proposal.
 *
 * - `pending`  – not yet reviewed; accept/reject controls are shown.
 * - `accepted` – user accepted; writeback (task 004) may proceed.
 * - `rejected` – user rejected; no further action is taken.
 */
export type StageChatProposalStatus = "pending" | "accepted" | "rejected";

/**
 * The artifact type the proposal targets.
 *
 * - `task-content`    – a textual change to the task body (diff-like review).
 * - `checklist-update` – a change to one or more checklist-item statuses.
 * - `status-update`   – a change to the task's top-level status or lane.
 */
export type StageChatProposalKind = "task-content" | "checklist-update" | "status-update";

// ---------------------------------------------------------------------------
// Diff helpers for task-content proposals
// ---------------------------------------------------------------------------

/**
 * A single line in a line-level diff.
 *
 * - `context`  – unchanged line present in both before and after.
 * - `added`    – line present only in `after`.
 * - `removed`  – line present only in `before`.
 */
export type StageChatDiffLineKind = "context" | "added" | "removed";

export interface StageChatDiffLine {
  kind: StageChatDiffLineKind;
  text: string;
}

/**
 * Computed line-level diff for a task-content proposal.
 *
 * `beforeText` and `afterText` are the full canonical before/after strings.
 * `lines` is the diff ready for rendering.
 * `addedCount` and `removedCount` are quick-access summary counts.
 */
export interface StageChatContentDiff {
  beforeText: string;
  afterText: string;
  lines: StageChatDiffLine[];
  addedCount: number;
  removedCount: number;
  contextCount: number;
}

// ---------------------------------------------------------------------------
// Checklist update helpers
// ---------------------------------------------------------------------------

export type StageChatChecklistItemStatus =
  | "planned"
  | "in_progress"
  | "done"
  | "blocked"
  | "skipped";

/**
 * A single checklist-item change within a checklist-update proposal.
 */
export interface StageChatChecklistItemChange {
  itemId: string;
  itemLabel: string;
  beforeStatus: StageChatChecklistItemStatus;
  afterStatus: StageChatChecklistItemStatus;
}

// ---------------------------------------------------------------------------
// Status update helpers
// ---------------------------------------------------------------------------

/**
 * The before/after pair for a task-level status-update proposal.
 */
export interface StageChatStatusChange {
  beforeStatus: string;
  afterStatus: string;
  /** Optional lane change when the update also moves the task to a new lane. */
  beforeLane?: string;
  afterLane?: string;
}

// ---------------------------------------------------------------------------
// Proposal shapes
// ---------------------------------------------------------------------------

interface StageChatProposalBase {
  /** Unique identifier for this proposal, scoped to the stage thread. */
  id: string;
  threadKey: string;
  /** Proposal source, e.g. a short label like "Suggested task update". */
  label: string;
  /** Optional rationale provided by the model alongside the suggestion. */
  rationale?: string;
  status: StageChatProposalStatus;
  createdAt: string;
}

export interface StageChatTaskContentProposal extends StageChatProposalBase {
  kind: "task-content";
  /** Relative path of the task file being changed. */
  artifactPath: string;
  diff: StageChatContentDiff;
}

export interface StageChatChecklistUpdateProposal extends StageChatProposalBase {
  kind: "checklist-update";
  /** Relative path of the task file whose checklist is being updated. */
  artifactPath: string;
  changes: StageChatChecklistItemChange[];
}

export interface StageChatStatusUpdateProposal extends StageChatProposalBase {
  kind: "status-update";
  /** Relative path of the task file whose status is being updated. */
  artifactPath: string;
  change: StageChatStatusChange;
}

export type StageChatProposal =
  | StageChatTaskContentProposal
  | StageChatChecklistUpdateProposal
  | StageChatStatusUpdateProposal;

// ---------------------------------------------------------------------------
// Proposal set – all proposals for one stage thread
// ---------------------------------------------------------------------------

/**
 * The complete set of proposals for a stage thread, together with summary
 * counts for use in the surface header.
 */
export interface StageChatProposalSet {
  threadKey: string;
  proposals: StageChatProposal[];
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/**
 * Produces a simple line-level diff of `before` against `after` using a
 * greedy LCS approach suitable for short-to-medium text blocks (task bodies).
 *
 * The algorithm:
 * 1. Split both texts into lines.
 * 2. Build a longest-common-subsequence table.
 * 3. Walk the table to emit `context`, `added`, and `removed` lines.
 *
 * Context lines are capped at `maxContextLines` on each side of a change
 * hunk to keep the diff readable.
 */
export function computeContentDiff(
  before: string,
  after: string,
  maxContextLines = 3,
): StageChatContentDiff {
  const beforeLines = before === "" ? [] : before.split("\n");
  const afterLines = after === "" ? [] : after.split("\n");

  const m = beforeLines.length;
  const n = afterLines.length;

  // Build LCS table (m+1) x (n+1)
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  // Walk table to build raw diff
  const rawLines: StageChatDiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      rawLines.unshift({ kind: "context", text: beforeLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      rawLines.unshift({ kind: "added", text: afterLines[j - 1] });
      j -= 1;
    } else {
      rawLines.unshift({ kind: "removed", text: beforeLines[i - 1] });
      i -= 1;
    }
  }

  // Trim context: keep only `maxContextLines` on each side of change hunks
  const trimmed = trimContextLines(rawLines, maxContextLines);

  const addedCount = trimmed.filter((l) => l.kind === "added").length;
  const removedCount = trimmed.filter((l) => l.kind === "removed").length;
  const contextCount = trimmed.filter((l) => l.kind === "context").length;

  return {
    beforeText: before,
    afterText: after,
    lines: trimmed,
    addedCount,
    removedCount,
    contextCount,
  };
}

/**
 * Trims context lines to at most `max` lines on each side of every change
 * hunk, inserting a sentinel `{ kind: "context", text: "..." }` where lines
 * were elided.
 */
function trimContextLines(lines: StageChatDiffLine[], max: number): StageChatDiffLine[] {
  if (max <= 0) {
    return lines.filter((l) => l.kind !== "context");
  }

  const result: StageChatDiffLine[] = [];
  const len = lines.length;

  for (let idx = 0; idx < len; idx += 1) {
    const line = lines[idx];

    if (line.kind !== "context") {
      result.push(line);
      continue;
    }

    // Check proximity to a change line
    const nearBefore = lines.slice(Math.max(0, idx - max), idx).some((l) => l.kind !== "context");
    const nearAfter = lines
      .slice(idx + 1, Math.min(len, idx + max + 1))
      .some((l) => l.kind !== "context");

    if (nearBefore || nearAfter) {
      result.push(line);
    } else {
      // Elide: replace a run of skipped context lines with one ellipsis marker
      if (result.length === 0 || result[result.length - 1].text !== "...") {
        result.push({ kind: "context", text: "..." });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/**
 * Builds a `StageChatProposalSet` from an unordered list of proposals.
 *
 * Proposals are returned in the order provided; counts are derived from status.
 */
export function buildProposalSet(
  threadKey: string,
  proposals: StageChatProposal[],
): StageChatProposalSet {
  return {
    threadKey,
    proposals,
    pendingCount: proposals.filter((p) => p.status === "pending").length,
    acceptedCount: proposals.filter((p) => p.status === "accepted").length,
    rejectedCount: proposals.filter((p) => p.status === "rejected").length,
  };
}

/**
 * Builds a `StageChatTaskContentProposal`.
 *
 * `before` and `after` are the full content strings. The diff is computed
 * automatically.
 */
export function buildTaskContentProposal(input: {
  id: string;
  threadKey: string;
  label: string;
  artifactPath: string;
  before: string;
  after: string;
  rationale?: string;
  status?: StageChatProposalStatus;
  createdAt?: string;
}): StageChatTaskContentProposal {
  return {
    id: input.id,
    threadKey: input.threadKey,
    kind: "task-content",
    label: input.label,
    artifactPath: input.artifactPath,
    diff: computeContentDiff(input.before, input.after),
    rationale: input.rationale,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Builds a `StageChatChecklistUpdateProposal`.
 */
export function buildChecklistUpdateProposal(input: {
  id: string;
  threadKey: string;
  label: string;
  artifactPath: string;
  changes: StageChatChecklistItemChange[];
  rationale?: string;
  status?: StageChatProposalStatus;
  createdAt?: string;
}): StageChatChecklistUpdateProposal {
  return {
    id: input.id,
    threadKey: input.threadKey,
    kind: "checklist-update",
    label: input.label,
    artifactPath: input.artifactPath,
    changes: input.changes,
    rationale: input.rationale,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Builds a `StageChatStatusUpdateProposal`.
 */
export function buildStatusUpdateProposal(input: {
  id: string;
  threadKey: string;
  label: string;
  artifactPath: string;
  change: StageChatStatusChange;
  rationale?: string;
  status?: StageChatProposalStatus;
  createdAt?: string;
}): StageChatStatusUpdateProposal {
  return {
    id: input.id,
    threadKey: input.threadKey,
    kind: "status-update",
    label: input.label,
    artifactPath: input.artifactPath,
    change: input.change,
    rationale: input.rationale,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
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

function renderProposalControls(proposal: StageChatProposal): string {
  if (proposal.status !== "pending") {
    const statusLabel = proposal.status === "accepted" ? "Accepted" : "Rejected";
    const statusClass = proposal.status === "accepted" ? "status-accepted" : "status-rejected";
    return `<div class="proposal-status ${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</div>`;
  }

  return `<div class="proposal-controls">
  <button class="action-accept" data-command="${escapeHtml(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID)}" data-proposal-id="${escapeHtml(proposal.id)}" data-thread-key="${escapeHtml(proposal.threadKey)}">Accept Proposal</button>
  <button class="action-reject" data-command="${escapeHtml(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID)}" data-proposal-id="${escapeHtml(proposal.id)}" data-thread-key="${escapeHtml(proposal.threadKey)}">Reject Proposal</button>
</div>`;
}

function renderProposalHeader(proposal: StageChatProposal): string {
  const rationaleLine = proposal.rationale
    ? `<div class="proposal-rationale">${escapeHtml(proposal.rationale)}</div>`
    : "";

  return `<div class="proposal-header">
  <div class="proposal-label">${escapeHtml(proposal.label)}</div>
  <div class="proposal-artifact">${escapeHtml(proposal.artifactPath)}</div>
  ${rationaleLine}
</div>`;
}

/**
 * Renders a single diff line with appropriate CSS class and prefix sigil.
 */
export function renderDiffLine(line: StageChatDiffLine): string {
  const classMap: Record<StageChatDiffLineKind, string> = {
    context: "diff-context",
    added: "diff-added",
    removed: "diff-removed",
  };

  const prefixMap: Record<StageChatDiffLineKind, string> = {
    context: " ",
    added: "+",
    removed: "-",
  };

  const cls = classMap[line.kind];
  const prefix = prefixMap[line.kind];
  // Ellipsis sentinel lines get a special class
  const isElided = line.kind === "context" && line.text === "...";
  const finalCls = isElided ? "diff-elided" : cls;

  return `<div class="diff-line ${escapeHtml(finalCls)}"><span class="diff-sigil">${escapeHtml(prefix)}</span><span class="diff-text">${escapeHtml(line.text)}</span></div>`;
}

/**
 * Renders the diff view for a `task-content` proposal.
 */
export function renderTaskContentProposal(proposal: StageChatTaskContentProposal): string {
  const { diff } = proposal;
  const summary = `+${diff.addedCount} -${diff.removedCount}`;
  const diffLines = diff.lines.map(renderDiffLine).join("\n");

  return `<article class="proposal proposal-task-content" data-proposal-id="${escapeHtml(proposal.id)}" data-thread-key="${escapeHtml(proposal.threadKey)}" data-kind="task-content" data-status="${escapeHtml(proposal.status)}">
${renderProposalHeader(proposal)}
<div class="diff-summary">${escapeHtml(summary)}</div>
<div class="diff-view">
${diffLines}
</div>
${renderProposalControls(proposal)}
</article>`;
}

/**
 * Renders a checklist item change row.
 */
function renderChecklistItemChange(change: StageChatChecklistItemChange): string {
  return `<div class="checklist-change-row" data-item-id="${escapeHtml(change.itemId)}">
  <span class="checklist-label">${escapeHtml(change.itemLabel)}</span>
  <span class="checklist-before status-${escapeHtml(change.beforeStatus)}">${escapeHtml(change.beforeStatus)}</span>
  <span class="checklist-arrow">→</span>
  <span class="checklist-after status-${escapeHtml(change.afterStatus)}">${escapeHtml(change.afterStatus)}</span>
</div>`;
}

/**
 * Renders the structured review surface for a `checklist-update` proposal.
 */
export function renderChecklistUpdateProposal(proposal: StageChatChecklistUpdateProposal): string {
  const changeRows = proposal.changes.map(renderChecklistItemChange).join("\n");
  const count = proposal.changes.length;
  const summary = `${count} checklist update${count === 1 ? "" : "s"} proposed`;

  return `<article class="proposal proposal-checklist-update" data-proposal-id="${escapeHtml(proposal.id)}" data-thread-key="${escapeHtml(proposal.threadKey)}" data-kind="checklist-update" data-status="${escapeHtml(proposal.status)}">
${renderProposalHeader(proposal)}
<div class="checklist-summary">${escapeHtml(summary)}</div>
<div class="checklist-changes">
${changeRows}
</div>
${renderProposalControls(proposal)}
</article>`;
}

/**
 * Renders the structured review surface for a `status-update` proposal.
 */
export function renderStatusUpdateProposal(proposal: StageChatStatusUpdateProposal): string {
  const { change } = proposal;
  const laneLine =
    change.beforeLane !== undefined && change.afterLane !== undefined
      ? `<div class="status-change-row">
  <span class="status-field-label">Lane</span>
  <span class="status-before">${escapeHtml(change.beforeLane)}</span>
  <span class="status-arrow">→</span>
  <span class="status-after">${escapeHtml(change.afterLane)}</span>
</div>`
      : "";

  return `<article class="proposal proposal-status-update" data-proposal-id="${escapeHtml(proposal.id)}" data-thread-key="${escapeHtml(proposal.threadKey)}" data-kind="status-update" data-status="${escapeHtml(proposal.status)}">
${renderProposalHeader(proposal)}
<div class="status-changes">
  <div class="status-change-row">
    <span class="status-field-label">Status</span>
    <span class="status-before">${escapeHtml(change.beforeStatus)}</span>
    <span class="status-arrow">→</span>
    <span class="status-after">${escapeHtml(change.afterStatus)}</span>
  </div>
  ${laneLine}
</div>
${renderProposalControls(proposal)}
</article>`;
}

/**
 * Renders any `StageChatProposal` by dispatching to the appropriate renderer.
 */
export function renderProposal(proposal: StageChatProposal): string {
  if (proposal.kind === "task-content") {
    return renderTaskContentProposal(proposal);
  }

  if (proposal.kind === "checklist-update") {
    return renderChecklistUpdateProposal(proposal);
  }

  return renderStatusUpdateProposal(proposal);
}

/**
 * Renders the full `StageChatProposalSet` as an ordered list of proposal
 * cards with a header showing pending/accepted/rejected counts.
 *
 * Returns an empty string when there are no proposals.
 */
export function renderProposalSet(set: StageChatProposalSet): string {
  if (set.proposals.length === 0) {
    return "";
  }

  const proposalHtml = set.proposals.map(renderProposal).join("\n");
  const headerParts: string[] = [];

  if (set.pendingCount > 0) {
    headerParts.push(`${set.pendingCount} pending`);
  }

  if (set.acceptedCount > 0) {
    headerParts.push(`${set.acceptedCount} accepted`);
  }

  if (set.rejectedCount > 0) {
    headerParts.push(`${set.rejectedCount} rejected`);
  }

  const headerText = headerParts.join(", ");

  return `<div class="proposal-set" data-thread-key="${escapeHtml(set.threadKey)}">
  <div class="proposal-set-header">${escapeHtml(headerText)}</div>
  ${proposalHtml}
</div>`;
}
