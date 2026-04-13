import {
  lookupRunStatus,
  classifyRunStatusOutcome,
  resolveRunArtifacts,
  type RunStatusViewModel,
  type RunArtifactPaths,
  type RunReviewStatus,
  type RunStatusLookupOutcome,
} from "../integration/runStatusLookup";
import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";

// ---------------------------------------------------------------------------
// Follow-up action types
//
// Actions are derived from canonical project-arch control-plane steps.
// No extension-owned lifecycle is introduced.
// ---------------------------------------------------------------------------

/**
 * Identifier for a follow-up action available on a launched run.
 *
 * Only actions grounded in shipped project-arch control-plane commands are
 * included:
 * - `validate`  maps to `pa agent validate <runId>`
 * - `reconcile` maps to `pa agent reconcile <runId>`
 * - `view-run-record`     opens the run record artifact file
 * - `view-launch-record`  opens the launch record artifact file
 * - `view-orchestration`  opens the orchestration record artifact file
 */
export type RunReviewActionId =
  | "validate"
  | "reconcile"
  | "view-run-record"
  | "view-launch-record"
  | "view-orchestration";

/**
 * A single follow-up action derived from the run review context.
 *
 * `cliArgs` carries the exact argument list for `ProjectArchBoundary.runCliJson`
 * when the action involves a CLI call.  View-only actions (`view-*`) have an
 * empty `cliArgs` array because they are fulfilled by opening the file at
 * `artifactPath` rather than invoking the CLI.
 */
export interface RunReviewAction {
  /** Stable identifier for the action type. */
  id: RunReviewActionId;
  /** Short human-readable label for UI display. */
  label: string;
  /** Brief description suitable for a tooltip or secondary line. */
  description: string;
  /**
   * CLI arg list passed to `boundary.runCliJson` for command actions.
   * Empty for view-only actions.
   */
  cliArgs: string[];
  /**
   * For `view-*` actions: the relative artifact path to open.
   * Undefined for command actions.
   */
  artifactPath?: string;
}

// ---------------------------------------------------------------------------
// Run review context
// ---------------------------------------------------------------------------

/**
 * Extension-facing review context for a single launched run.
 *
 * All fields are derived from canonical project-arch outputs (via the run
 * status lookup from task 001).  The context is run-oriented and does not
 * replicate local-task-workflow state.
 *
 * `followUpActions` lists only the actions that are meaningful given the
 * current run lifecycle position.  Surfaces should render these actions
 * without adding editor-only lifecycle steps.
 */
export interface RunReviewContext {
  /** Canonical run identifier. */
  runId: string;
  /** Task the run was created from. */
  taskRef: string;
  /**
   * Lifecycle outcome classification (from `classifyRunStatusOutcome`).
   * Surfaces use this to pick the primary display state.
   */
  outcome: RunStatusLookupOutcome;
  /**
   * The run review status from the run record when available.
   * Authoritative for validate/reconcile state.
   */
  runReviewStatus?: RunReviewStatus;
  /** Whether a validated run record exists for this run. */
  runRecordExists: boolean;
  /** Whether an orchestration record exists. */
  orchestrationRecordExists: boolean;
  /** Runtime adapter that launched the run (if known). */
  runtime?: string;
  /** Adapter-managed handle (e.g. `codex-cli:<runId>`). */
  runHandle?: string;
  /** ISO-8601 timestamp when the run was dispatched. */
  launchedAt?: string;
  /** Canonical artifact paths for this run. */
  artifacts: RunArtifactPaths;
  /**
   * Follow-up actions available given the current lifecycle position.
   * Only actions bounded by existing control-plane behavior are included.
   */
  followUpActions: RunReviewAction[];
}

// ---------------------------------------------------------------------------
// Follow-up action derivation
// ---------------------------------------------------------------------------

/**
 * Derive the set of follow-up actions available for a run given its current
 * lifecycle position.
 *
 * Rules:
 * - `validate` is available when a run record exists but review status reflects
 *   no validation yet OR a previous validation failed (retry).
 * - `reconcile` is available when validation passed and reconciliation is pending.
 * - `view-run-record` is available whenever a run record path is known.
 * - `view-launch-record` is available whenever a launch record path is known.
 * - `view-orchestration` is available when an orchestration record path is known.
 *
 * Orchestration runs receive the same actions because the lower-level
 * validate/reconcile loop still applies after role execution completes or when
 * a role-failure fallback is needed.
 */
export function deriveRunReviewActions(
  runId: string,
  outcome: RunStatusLookupOutcome,
  artifacts: RunArtifactPaths,
): RunReviewAction[] {
  const actions: RunReviewAction[] = [];

  // Command actions: validate and reconcile follow control-plane ordering.
  const isValidateEligible =
    outcome === "post-launch-awaiting-validation" ||
    outcome === "validation-failed" ||
    outcome === "orchestration-waiting-for-import" ||
    outcome === "orchestration-failed";

  const isReconcileEligible =
    outcome === "validation-passed-awaiting-reconcile" || outcome === "reconciliation-failed";

  if (isValidateEligible) {
    actions.push({
      id: "validate",
      label: "Validate Run",
      description: "Run pa agent validate to check scope, policy, and repository state.",
      cliArgs: ["agent", "validate", runId],
    });
  }

  if (isReconcileEligible) {
    actions.push({
      id: "reconcile",
      label: "Reconcile Run",
      description: "Run pa agent reconcile to generate reconciliation outputs.",
      cliArgs: ["agent", "reconcile", runId],
    });
  }

  // View actions: open canonical artifact files.
  if (artifacts.runRecordPath) {
    actions.push({
      id: "view-run-record",
      label: "View Run Record",
      description: "Open the validated run record artifact.",
      cliArgs: [],
      artifactPath: artifacts.runRecordPath,
    });
  }

  if (artifacts.launchRecordPath) {
    actions.push({
      id: "view-launch-record",
      label: "View Launch Record",
      description: "Open the adapter launch record.",
      cliArgs: [],
      artifactPath: artifacts.launchRecordPath,
    });
  }

  if (artifacts.orchestrationPath) {
    actions.push({
      id: "view-orchestration",
      label: "View Orchestration Record",
      description: "Open the multi-agent orchestration record.",
      cliArgs: [],
      artifactPath: artifacts.orchestrationPath,
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Build review context from a status view model
// ---------------------------------------------------------------------------

/**
 * Build a `RunReviewContext` from a previously resolved `RunStatusViewModel`.
 *
 * This is the pure derivation step: no I/O, no CLI calls.  It is separated
 * from `lookupRunReviewContext` so surfaces that already hold a
 * `RunStatusViewModel` (e.g. after a status refresh) can re-derive the review
 * context without a second network/CLI round-trip.
 */
export function buildRunReviewContext(statusViewModel: RunStatusViewModel): RunReviewContext {
  const outcome = classifyRunStatusOutcome(statusViewModel);
  const artifacts = resolveRunArtifacts(statusViewModel);
  const followUpActions = deriveRunReviewActions(statusViewModel.runId, outcome, artifacts);

  return {
    runId: statusViewModel.runId,
    taskRef: statusViewModel.taskRef,
    outcome,
    runReviewStatus: statusViewModel.runReviewStatus,
    runRecordExists: statusViewModel.runRecordExists,
    orchestrationRecordExists: statusViewModel.orchestrationRecordExists,
    runtime: statusViewModel.runtime,
    runHandle: statusViewModel.runHandle,
    launchedAt: statusViewModel.launchedAt,
    artifacts,
    followUpActions,
  };
}

// ---------------------------------------------------------------------------
// Lookup + review context in one call
// ---------------------------------------------------------------------------

export interface LookupRunReviewContextOptions {
  runId: string;
  /** Project Arch CLI boundary.  Defaults to a fresh boundary using `pa`. */
  boundary?: ProjectArchBoundary;
  /** Working directory for the CLI call.  Defaults to `process.cwd()`. */
  cwd?: string;
}

/**
 * Look up a run's current status and build a `RunReviewContext` in a single
 * operation.
 *
 * Delegates status lookup to `lookupRunStatus` (task 001) and then derives the
 * review context via `buildRunReviewContext`.  Use this when a surface needs
 * to resolve both status and review affordances in one step.
 */
export async function lookupRunReviewContext(
  input: LookupRunReviewContextOptions,
): Promise<RunReviewContext> {
  const boundary = input.boundary ?? createProjectArchBoundary();

  const statusViewModel = await lookupRunStatus({
    runId: input.runId,
    boundary,
    cwd: input.cwd,
  });

  return buildRunReviewContext(statusViewModel);
}

// ---------------------------------------------------------------------------
// Execute a command-type follow-up action
// ---------------------------------------------------------------------------

export interface ExecuteRunReviewActionOptions {
  action: RunReviewAction;
  boundary?: ProjectArchBoundary;
  cwd?: string;
}

/**
 * Execute a command-type follow-up action via the project-arch CLI boundary.
 *
 * Only call this for actions with non-empty `cliArgs`.  View-only actions
 * (`view-*`) should be handled by the surface layer (e.g. opening a file in
 * the editor) rather than passed to this function.
 *
 * Returns the raw CLI JSON payload so the caller can parse it according to
 * the expected response shape for the specific action (`validate`, `reconcile`).
 *
 * Throws if `action.cliArgs` is empty (caller mistake) or if the CLI call
 * fails.
 */
export async function executeRunReviewAction(
  input: ExecuteRunReviewActionOptions,
): Promise<unknown> {
  if (input.action.cliArgs.length === 0) {
    throw new Error(
      `Action '${input.action.id}' is a view-only action and cannot be executed via the CLI boundary.`,
    );
  }

  const boundary = input.boundary ?? createProjectArchBoundary();

  return boundary.runCliJson({
    args: input.action.cliArgs,
    cwd: input.cwd,
  });
}
