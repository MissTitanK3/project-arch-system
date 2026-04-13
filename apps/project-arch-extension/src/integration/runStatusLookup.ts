import type { agent } from "project-arch";
import { createProjectArchBoundary, type ProjectArchBoundary } from "./projectArchBoundary";

// ---------------------------------------------------------------------------
// View model types
//
// These are derived from shipped project-arch output types.  No editor-only
// run states are invented here; meanings stay aligned with CLI/SDK definitions.
// ---------------------------------------------------------------------------

export type RunLaunchPhase = agent.AgentRunStatusResult["phase"];
export type RunReviewStatus = NonNullable<agent.AgentRunStatusResult["runReviewStatus"]>;
export type RunOrchestrationStatus = NonNullable<agent.AgentRunStatusResult["orchestrationStatus"]>;
export type RunOrchestratedRole = "planner" | "implementer" | "reviewer" | "reconciler";

/**
 * Artifact paths resolved for a specific runId.  Every path is relative to the
 * workspace root (as returned by project-arch) so downstream surfaces can
 * resolve them to absolute paths when needed.
 */
export interface RunArtifactPaths {
  /** Path to the adapter-launch record, present once the run has been dispatched. */
  launchRecordPath?: string;
  /** Path to the validated run record; authoritative source for review status. */
  runRecordPath?: string;
  /** Path to the orchestration record when the run used multi-agent orchestration. */
  orchestrationPath?: string;
}

/**
 * Orchestration metadata surfaced when the run used multi-agent orchestration.
 */
export interface RunOrchestrationInfo {
  status: RunOrchestrationStatus;
  completedRoles: RunOrchestratedRole[];
  path?: string;
}

/**
 * Extension-facing view model for a launched run.
 *
 * All fields are mapped from canonical project-arch outputs.  The model is
 * intentionally thin: it preserves CLI/SDK meanings and exposes artifact paths
 * so downstream review, orchestration, and audit surfaces can build on it
 * without rebuilding the lookup.
 */
export interface RunStatusViewModel {
  runId: string;
  taskRef: string;
  /**
   * The adapter-launch phase.  `phase` is advisory metadata about the
   * adapter-launch boundary only; `runReviewStatus` is the authoritative
   * downstream state once a run record exists.
   */
  phase: RunLaunchPhase;
  /** Whether a validated run record exists for this run. */
  runRecordExists: boolean;
  /** Whether an orchestration record exists for this run. */
  orchestrationRecordExists: boolean;
  /**
   * Review status derived from the run record.  Present only when a run record
   * exists.  This is the authoritative source of validation and reconcile truth.
   */
  runReviewStatus?: RunReviewStatus;
  /** Orchestration metadata; present when this was a multi-agent run. */
  orchestration?: RunOrchestrationInfo;
  /** Runtime adapter identifier used to launch the run. */
  runtime?: string;
  /** Adapter-managed run handle (e.g. `codex-cli:<runId>`). */
  runHandle?: string;
  /** ISO-8601 timestamp when the adapter dispatched the run. */
  launchedAt?: string;
  /** Resolved artifact paths for downstream review surfaces. */
  artifacts: RunArtifactPaths;
}

// ---------------------------------------------------------------------------
// Consumer outcome classification
//
// Maps the view model to a small set of consumer-useful states without
// inventing editor-only run states.  All outcome values are grounded in
// shipped project-arch phases and review statuses.
// ---------------------------------------------------------------------------

/**
 * A consumer-useful classification of a run's current position in the
 * project-arch lifecycle.  Values are derived from `RunLaunchPhase` and
 * `RunReviewStatus` without adding extension-owned states.
 */
export type RunStatusLookupOutcome =
  | "pre-launch"
  | "launch-dispatched"
  | "launch-failed"
  | "post-launch-awaiting-validation"
  | "validation-failed"
  | "validation-passed-awaiting-reconcile"
  | "reconciliation-failed"
  | "reconciled"
  | "orchestration-in-progress"
  | "orchestration-waiting-for-import"
  | "orchestration-failed"
  | "orchestration-completed";

/**
 * Classify a `RunStatusViewModel` into a `RunStatusLookupOutcome`.
 *
 * Orchestration state takes precedence because it describes the multi-agent
 * lifecycle boundary.  Within a single-agent run the `runReviewStatus` is
 * the authoritative downstream state.
 */
export function classifyRunStatusOutcome(viewModel: RunStatusViewModel): RunStatusLookupOutcome {
  if (viewModel.orchestrationRecordExists && viewModel.orchestration) {
    const s = viewModel.orchestration.status;
    if (s === "completed") return "orchestration-completed";
    if (s === "failed") return "orchestration-failed";
    if (s === "waiting-for-result-import") return "orchestration-waiting-for-import";
    return "orchestration-in-progress";
  }

  if (viewModel.phase === "launch-failed") return "launch-failed";

  if (viewModel.phase === "pre-launch") return "pre-launch";

  if (viewModel.runReviewStatus) {
    switch (viewModel.runReviewStatus) {
      case "validation-failed":
        return "validation-failed";
      case "validation-passed-awaiting-reconcile":
        return "validation-passed-awaiting-reconcile";
      case "reconciliation-failed":
        return "reconciliation-failed";
      case "reconciled":
        return "reconciled";
    }
  }

  if (viewModel.phase === "post-launch") return "post-launch-awaiting-validation";

  return "launch-dispatched";
}

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw CLI JSON payload (`OperationResult<AgentRunLaunchStatusResult>`)
 * returned by `pa agent status <runId> --json` into a `RunStatusViewModel`.
 *
 * Throws if the payload indicates failure or is structurally invalid.
 */
export function parseRunStatusPayload(payload: unknown): RunStatusViewModel {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Run status payload must be an object.");
  }

  const envelope = payload as Record<string, unknown>;

  if (envelope["success"] !== true) {
    const errors = Array.isArray(envelope["errors"])
      ? (envelope["errors"] as unknown[]).map(String).join("; ")
      : "Run status lookup failed.";
    throw new Error(`Run status lookup failed: ${errors}`);
  }

  const data = envelope["data"];
  if (typeof data !== "object" || data === null) {
    throw new Error("Run status payload is missing data.");
  }

  const d = data as Record<string, unknown>;

  const runId = typeof d["runId"] === "string" ? d["runId"] : "";
  const taskRef =
    typeof d["taskRef"] === "string"
      ? d["taskRef"]
      : typeof d["taskId"] === "string"
        ? d["taskId"]
        : runId;
  const phase = (typeof d["phase"] === "string" ? d["phase"] : "pre-launch") as RunLaunchPhase;
  const runRecordExists = d["runRecordExists"] === true;
  const orchestrationRecordExists = d["orchestrationRecordExists"] === true;
  const runReviewStatus =
    typeof d["runReviewStatus"] === "string"
      ? (d["runReviewStatus"] as RunReviewStatus)
      : undefined;

  const orchestrationStatus =
    typeof d["orchestrationStatus"] === "string"
      ? (d["orchestrationStatus"] as RunOrchestrationStatus)
      : undefined;

  const orchestrationPath =
    typeof d["orchestrationPath"] === "string" ? d["orchestrationPath"] : undefined;

  const orchestrationCompletedRoles = Array.isArray(d["orchestrationCompletedRoles"])
    ? (d["orchestrationCompletedRoles"] as unknown[]).filter(
        (r): r is RunOrchestratedRole => typeof r === "string",
      )
    : [];

  const orchestration: RunOrchestrationInfo | undefined =
    orchestrationRecordExists && orchestrationStatus
      ? {
          status: orchestrationStatus,
          completedRoles: orchestrationCompletedRoles,
          path: orchestrationPath,
        }
      : undefined;

  const launchRecordPath =
    typeof d["launchRecordPath"] === "string" ? d["launchRecordPath"] : undefined;

  const runRecordPath = typeof d["runRecordPath"] === "string" ? d["runRecordPath"] : undefined;

  return {
    runId,
    taskRef,
    phase,
    runRecordExists,
    orchestrationRecordExists,
    runReviewStatus,
    orchestration,
    runtime: typeof d["runtime"] === "string" ? d["runtime"] : undefined,
    runHandle: typeof d["runHandle"] === "string" ? d["runHandle"] : undefined,
    launchedAt: typeof d["launchedAt"] === "string" ? d["launchedAt"] : undefined,
    artifacts: {
      launchRecordPath,
      runRecordPath,
      orchestrationPath,
    },
  };
}

// ---------------------------------------------------------------------------
// Run status lookup
// ---------------------------------------------------------------------------

export interface LookupRunStatusOptions {
  runId: string;
  /** Project Arch CLI boundary.  Defaults to a fresh boundary using `pa`. */
  boundary?: ProjectArchBoundary;
  /** Working directory for the CLI call.  Defaults to `process.cwd()`. */
  cwd?: string;
}

/**
 * Look up the status of a launched run by `runId` via the project-arch CLI
 * JSON transport and return a `RunStatusViewModel`.
 *
 * Delegates to `pa agent status <runId> --json`.  Status meanings are preserved
 * directly from the CLI output rather than being re-derived inside the extension.
 */
export async function lookupRunStatus(input: LookupRunStatusOptions): Promise<RunStatusViewModel> {
  const boundary = input.boundary ?? createProjectArchBoundary();

  const payload = await boundary.runCliJson({
    args: ["agent", "status", input.runId],
    cwd: input.cwd,
  });

  return parseRunStatusPayload(payload);
}

// ---------------------------------------------------------------------------
// Artifact resolution
// ---------------------------------------------------------------------------

/**
 * Return the artifact paths from a resolved `RunStatusViewModel`.
 *
 * This is a focused helper so downstream review, orchestration, and audit
 * surfaces do not need to reach into the view model structure directly.
 */
export function resolveRunArtifacts(viewModel: RunStatusViewModel): RunArtifactPaths {
  return viewModel.artifacts;
}
