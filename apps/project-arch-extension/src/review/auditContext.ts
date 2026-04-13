import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";
import type { RunArtifactPaths } from "../integration/runStatusLookup";

// ---------------------------------------------------------------------------
// Canonical audit types
//
// Mirrored from `project-arch` schema definitions without importing the
// schema library directly.  The extension only reads these values; it never
// writes audit events.
// ---------------------------------------------------------------------------

/**
 * Commands that can produce audit events, matching `agentAuditCommandSchema`.
 */
export type AuditCommand =
  | "prepare"
  | "run"
  | "result-import"
  | "validate"
  | "reconcile"
  | "review";

/** Outcome status of an audit event, matching `agentAuditStatusSchema`. */
export type AuditEventStatus = "success" | "error";

/**
 * Extension-facing view model for a single audit event.
 *
 * All fields map directly to the canonical `AgentAuditEvent` schema produced
 * by project-arch.  No editor-only fields are added.
 */
export interface AuditEntryViewModel {
  /** Stable unique identifier for the event. */
  eventId: string;
  /** ISO-8601 timestamp when the event occurred. */
  occurredAt: string;
  /** Control-plane command that produced the event. */
  command: AuditCommand;
  /** Outcome status. */
  status: AuditEventStatus;
  /** Run the event is linked to, if present. */
  runId?: string;
  /** Task the event is linked to, if present. */
  taskId?: string;
  /** Optional diagnostic or error message. */
  message?: string;
  /** Opaque per-command metadata carried by the event. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Artifact navigation
// ---------------------------------------------------------------------------

/**
 * Navigation affordances derived from an `AuditEntryViewModel`.
 *
 * `logPath` is the relative path to the audit log file itself.
 * `runArtifactPaths` links the event to related run artifact paths when the
 * event carries a `runId`.  These are derived from the standard project-arch
 * layout rather than resolved by a live CLI call.
 */
export interface AuditEntryNavigation {
  /** Relative path to the audit log file. */
  logPath: string;
  /** Relative path to the run record, when runId is known. */
  runRecordPath?: string;
  /** Relative path to the adapter launch record, when runId is known. */
  launchRecordPath?: string;
  /** Relative path to the orchestration record, when runId is known. */
  orchestrationPath?: string;
}

/**
 * Derive standard artifact paths for a run from its `runId`.
 *
 * These paths follow the canonical project-arch artifact layout
 * (`.project-arch/agent-runtime/…`) and are relative to the workspace root.
 * The extension should not resolve them to absolute paths until it needs to
 * open the file.
 */
export function deriveRunArtifactPaths(runId: string): RunArtifactPaths {
  return {
    runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
    launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
    orchestrationPath: `.project-arch/agent-runtime/orchestration/${runId}.json`,
  };
}

/**
 * Build navigation affordances for an audit entry.
 *
 * `logPath` is always included.  Run artifact paths are included whenever the
 * event has a `runId`.
 */
export function buildAuditEntryNavigation(
  entry: AuditEntryViewModel,
  logPath: string,
): AuditEntryNavigation {
  const navigation: AuditEntryNavigation = { logPath };

  if (entry.runId) {
    const paths = deriveRunArtifactPaths(entry.runId);
    navigation.runRecordPath = paths.runRecordPath;
    navigation.launchRecordPath = paths.launchRecordPath;
    navigation.orchestrationPath = paths.orchestrationPath;
  }

  return navigation;
}

// ---------------------------------------------------------------------------
// Run-scoped audit group
// ---------------------------------------------------------------------------

/**
 * All audit events associated with a single run, grouped for review.
 *
 * Events are in chronological order (matching the audit log order).
 * Artifact navigation covers the run-level paths shared by all events in
 * the group.
 */
export interface RunAuditGroup {
  runId: string;
  /** Task the run was created from, if determinable from events. */
  taskId?: string;
  /** Events for this run in chronological order. */
  events: AuditEntryViewModel[];
  /** Run-level artifact navigation paths. */
  navigation: AuditEntryNavigation;
  /** Whether any event in this group has `status: "error"`. */
  hasErrors: boolean;
}

/**
 * Group a flat list of `AuditEntryViewModel` entries by `runId`.
 *
 * Entries without a `runId` are collected into an `unlinked` array.
 * Each group's events are in the order they appear in `entries` (i.e.
 * chronological order matching the audit log).
 */
export function groupEntriesByRun(
  entries: AuditEntryViewModel[],
  logPath: string,
): { runs: RunAuditGroup[]; unlinked: AuditEntryViewModel[] } {
  const runsMap = new Map<string, RunAuditGroup>();
  const unlinked: AuditEntryViewModel[] = [];

  for (const entry of entries) {
    if (!entry.runId) {
      unlinked.push(entry);
      continue;
    }

    const existing = runsMap.get(entry.runId);
    if (existing) {
      existing.events.push(entry);
      if (entry.status === "error") {
        existing.hasErrors = true;
      }
    } else {
      const navigation = buildAuditEntryNavigation(entry, logPath);
      runsMap.set(entry.runId, {
        runId: entry.runId,
        taskId: entry.taskId,
        events: [entry],
        navigation,
        hasErrors: entry.status === "error",
      });
    }
  }

  return { runs: Array.from(runsMap.values()), unlinked };
}

// ---------------------------------------------------------------------------
// Human-readable summary
// ---------------------------------------------------------------------------

/**
 * Produce a single-line human-readable summary for an audit entry.
 *
 * Format: `<occurredAt> <command> <status>[  run=<runId>][  task=<taskId>][  <message>]`
 */
export function summariseAuditEntry(entry: AuditEntryViewModel): string {
  const parts: string[] = [entry.occurredAt, entry.command, entry.status];
  if (entry.runId) parts.push(`run=${entry.runId}`);
  if (entry.taskId) parts.push(`task=${entry.taskId}`);
  if (entry.message) parts.push(entry.message);
  return parts.join("  ");
}

// ---------------------------------------------------------------------------
// Audit presentation context
// ---------------------------------------------------------------------------

/**
 * Extension-facing presentation context for an audit history query result.
 *
 * All data is sourced from the canonical `pa agent audit --json` output.
 * The extension reads this; it does not write to the audit log.
 *
 * `runs` allows run-oriented surfaces to review per-run event sequences.
 * `unlinkedEntries` captures events that have no `runId` (e.g. top-level
 * prepare-error events that never produced a run).
 */
export interface AuditPresentationContext {
  /** Relative path to the audit log file. */
  logPath: string;
  /** All entries in chronological order. */
  entries: AuditEntryViewModel[];
  /** Total count from the audit history response (before limit). */
  total: number;
  /**
   * Whether the history was pre-filtered by a runId.
   * When set, `runs` will contain at most one group.
   */
  filteredByRunId?: string;
  /** Entries grouped by runId for run-oriented review surfaces. */
  runs: RunAuditGroup[];
  /** Events that carry no runId. */
  unlinkedEntries: AuditEntryViewModel[];
  /** Whether any entry in this context has `status: "error"`. */
  hasErrors: boolean;
}

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw CLI JSON payload (`OperationResult<AgentAuditHistory>`) returned
 * by `pa agent audit [runId] --json` into an `AuditPresentationContext`.
 *
 * Throws if the payload indicates failure or is structurally invalid.
 */
export function parseAuditHistoryPayload(payload: unknown): AuditPresentationContext {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Audit history payload must be an object.");
  }

  const envelope = payload as Record<string, unknown>;

  if (envelope["success"] !== true) {
    const errors = Array.isArray(envelope["errors"])
      ? (envelope["errors"] as unknown[]).map(String).join("; ")
      : "Audit history lookup failed.";
    throw new Error(`Audit history lookup failed: ${errors}`);
  }

  const data = envelope["data"];
  if (typeof data !== "object" || data === null) {
    throw new Error("Audit history payload is missing data.");
  }

  const d = data as Record<string, unknown>;

  const logPath =
    typeof d["logPath"] === "string"
      ? d["logPath"]
      : ".project-arch/agent-runtime/logs/execution.jsonl";
  const total = typeof d["total"] === "number" ? d["total"] : 0;
  const filteredByRunId =
    typeof d["filteredByRunId"] === "string" ? d["filteredByRunId"] : undefined;

  const rawEvents = Array.isArray(d["events"]) ? d["events"] : [];
  const entries: AuditEntryViewModel[] = rawEvents
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((e): AuditEntryViewModel | null => {
      const command = typeof e["command"] === "string" ? (e["command"] as AuditCommand) : null;
      const status = typeof e["status"] === "string" ? (e["status"] as AuditEventStatus) : null;
      const eventId = typeof e["eventId"] === "string" ? e["eventId"] : "";
      const occurredAt = typeof e["occurredAt"] === "string" ? e["occurredAt"] : "";

      if (!command || !status) return null;

      return {
        eventId,
        occurredAt,
        command,
        status,
        runId: typeof e["runId"] === "string" ? e["runId"] : undefined,
        taskId: typeof e["taskId"] === "string" ? e["taskId"] : undefined,
        message: typeof e["message"] === "string" ? e["message"] : undefined,
        metadata:
          typeof e["metadata"] === "object" &&
          e["metadata"] !== null &&
          !Array.isArray(e["metadata"])
            ? (e["metadata"] as Record<string, unknown>)
            : undefined,
      };
    })
    .filter((e): e is AuditEntryViewModel => e !== null);

  const { runs, unlinked } = groupEntriesByRun(entries, logPath);
  const hasErrors = entries.some((e) => e.status === "error");

  return {
    logPath,
    entries,
    total,
    filteredByRunId,
    runs,
    unlinkedEntries: unlinked,
    hasErrors,
  };
}

// ---------------------------------------------------------------------------
// Audit lookup
// ---------------------------------------------------------------------------

export interface LookupAuditHistoryOptions {
  /** When provided, restricts results to events linked to this runId. */
  runId?: string;
  /** Maximum number of events to return (passed to `pa agent audit --limit`). */
  limit?: number;
  /** Project Arch CLI boundary.  Defaults to a fresh boundary using `pa`. */
  boundary?: ProjectArchBoundary;
  /** Working directory for the CLI call.  Defaults to `process.cwd()`. */
  cwd?: string;
}

/**
 * Fetch audit history via the project-arch CLI boundary and return an
 * `AuditPresentationContext`.
 *
 * Delegates to `pa agent audit [runId] --json [--limit N]`.  The extension
 * only reads the audit log; it never writes to it.
 */
export async function lookupAuditHistory(
  input: LookupAuditHistoryOptions = {},
): Promise<AuditPresentationContext> {
  const boundary = input.boundary ?? createProjectArchBoundary();

  const args = ["agent", "audit"];
  if (input.runId) args.push(input.runId);
  if (typeof input.limit === "number" && input.limit > 0) {
    args.push("--limit", String(input.limit));
  }

  const payload = await boundary.runCliJson({
    args,
    cwd: input.cwd,
  });

  return parseAuditHistoryPayload(payload);
}

// ---------------------------------------------------------------------------
// Run-scoped audit lookup
// ---------------------------------------------------------------------------

/**
 * Look up the audit history for a specific run and return a `RunAuditGroup`.
 *
 * This is a focused helper for surfaces that are reviewing a single run.
 * Returns an empty group when no events are found for the given `runId`.
 */
export async function lookupRunAuditGroup(input: {
  runId: string;
  boundary?: ProjectArchBoundary;
  cwd?: string;
}): Promise<RunAuditGroup> {
  const context = await lookupAuditHistory({
    runId: input.runId,
    boundary: input.boundary,
    cwd: input.cwd,
  });

  const group = context.runs.find((r) => r.runId === input.runId);
  if (!group) {
    // Return an empty group rather than throwing — the run may simply have no
    // audit events yet (e.g. pre-launch state).
    const navigation = buildAuditEntryNavigation(
      { eventId: "", occurredAt: "", command: "prepare", status: "success", runId: input.runId },
      context.logPath,
    );
    return {
      runId: input.runId,
      taskId: undefined,
      events: [],
      navigation,
      hasErrors: false,
    };
  }

  return group;
}
