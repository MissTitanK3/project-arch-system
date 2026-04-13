import type {
  RunStatusViewModel,
  RunOrchestratedRole,
  RunArtifactPaths,
  RunStatusLookupOutcome,
} from "../integration/runStatusLookup";
import {
  lookupRunStatus,
  classifyRunStatusOutcome,
  resolveRunArtifacts,
} from "../integration/runStatusLookup";
import {
  buildRunReviewContext,
  deriveRunReviewActions,
  type RunReviewAction,
  type RunReviewContext,
} from "./runReviewContext";
import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";

// ---------------------------------------------------------------------------
// Orchestration-specific types
//
// All values are grounded in shipped project-arch orchestration outputs.
// ---------------------------------------------------------------------------

/** Fixed execution order for orchestration roles. */
export const ORCHESTRATION_ROLE_ORDER: ReadonlyArray<RunOrchestratedRole> = [
  "planner",
  "implementer",
  "reviewer",
  "reconciler",
] as const;

/**
 * The lifecycle boundary crossed between adjacent roles.
 * Mirrors the `agentOrchestrationLifecycleBoundarySchema` values.
 */
export type OrchestrationLifecycleBoundary = "prepare" | "validate" | "reconcile";

/** Overall orchestration run status, mirroring the canonical schema values. */
export type OrchestrationRunStatus =
  | "in-progress"
  | "waiting-for-result-import"
  | "failed"
  | "completed";

/**
 * Per-role progress entry derived from the status response.
 *
 * `state` is inferred from `completedRoles` and the overall orchestration
 * status.  Only canonical states are used; no editor-owned role states are
 * introduced.
 */
export interface OrchestrationRoleProgress {
  role: RunOrchestratedRole;
  /** `completed` — role is in completedRoles.
   *  `in-progress` — this is the active role (first non-completed role when overall status is in-progress).
   *  `failed` — this role is considered the failure point (first non-completed role when overall status is failed).
   *  `pending` — not yet reached.
   */
  state: "completed" | "in-progress" | "failed" | "pending";
}

/**
 * Summary of the handoff between two adjacent roles.
 *
 * `crossed` is true when the `fromRole` is in `completedRoles`, meaning
 * the handoff boundary has been passed.
 */
export interface OrchestrationHandoffSummary {
  fromRole: RunOrchestratedRole;
  toRole: RunOrchestratedRole;
  /** The control-plane lifecycle boundary this handoff crosses. */
  lifecycleBoundary: OrchestrationLifecycleBoundary;
  /** Whether the handoff has been crossed (fromRole completed). */
  crossed: boolean;
}

/**
 * Orchestration-aware review context for a launched run.
 *
 * Extends the base run review context with role-level progress, handoff
 * summaries, and a human-readable lifecycle position.  All data is derived
 * from the status response and does not require reading the orchestration
 * record directly — that artifact is surfaced via `orchestrationPath` for
 * editor-side file navigation.
 *
 * `baseReviewContext` is included so downstream surfaces do not need to
 * separately resolve the base context.
 */
export interface OrchestrationReviewContext {
  /** Canonical run identifier. */
  runId: string;
  /** Task the run was created from. */
  taskRef: string;
  /** Overall orchestration lifecycle status. */
  status: OrchestrationRunStatus;
  /** Lifecycle outcome from the base view model. */
  outcome: RunStatusLookupOutcome;
  /**
   * Per-role progress in fixed execution order (planner → implementer →
   * reviewer → reconciler).
   */
  roleProgress: OrchestrationRoleProgress[];
  /**
   * Handoff summaries for the three lifecycle boundaries:
   * prepare (planner→implementer), validate (implementer→reviewer),
   * reconcile (reviewer→reconciler).
   */
  handoffs: OrchestrationHandoffSummary[];
  /** The role currently in-progress, if determinable. */
  activeRole?: RunOrchestratedRole;
  /** The role considered to have failed, if determinable. */
  failedRole?: RunOrchestratedRole;
  /** Human-readable description of the current orchestration lifecycle position. */
  lifecyclePosition: string;
  /** Path to the full orchestration record artifact for file navigation. */
  orchestrationPath?: string;
  /** Canonical artifact paths for the run. */
  artifacts: RunArtifactPaths;
  /** Follow-up actions available for the run in its current position. */
  followUpActions: RunReviewAction[];
  /** The base run review context from task 002. */
  baseReviewContext: RunReviewContext;
}

// ---------------------------------------------------------------------------
// Role progress derivation
// ---------------------------------------------------------------------------

/**
 * Handoff definitions in the canonical order.
 * Mirrors the four-role lifecycle model defined in the control-plane RFC.
 */
const HANDOFF_DEFINITIONS: ReadonlyArray<{
  fromRole: RunOrchestratedRole;
  toRole: RunOrchestratedRole;
  lifecycleBoundary: OrchestrationLifecycleBoundary;
}> = [
  { fromRole: "planner", toRole: "implementer", lifecycleBoundary: "prepare" },
  { fromRole: "implementer", toRole: "reviewer", lifecycleBoundary: "validate" },
  { fromRole: "reviewer", toRole: "reconciler", lifecycleBoundary: "reconcile" },
];

/**
 * Derive per-role progress from the completed-roles list and overall status.
 *
 * Algorithm:
 * 1. Roles in `completedRoles` → `completed`.
 * 2. For `in-progress` overall status: first non-completed role → `in-progress`;
 *    remaining → `pending`.
 * 3. For `failed` overall status: first non-completed role → `failed`;
 *    remaining → `pending`.
 * 4. For `completed` status: all roles should be in completedRoles (any
 *    survivors default to `pending`).
 * 5. For `waiting-for-result-import`: treat like `in-progress` — the
 *    implementer role is blocked waiting for a result bundle.
 */
export function deriveRoleProgress(
  completedRoles: RunOrchestratedRole[],
  status: OrchestrationRunStatus,
): OrchestrationRoleProgress[] {
  const completedSet = new Set(completedRoles);
  let firstNonCompletedHandled = false;

  return ORCHESTRATION_ROLE_ORDER.map((role) => {
    if (completedSet.has(role)) {
      return { role, state: "completed" as const };
    }

    if (!firstNonCompletedHandled) {
      firstNonCompletedHandled = true;

      if (status === "failed") {
        return { role, state: "failed" as const };
      }

      if (status === "in-progress" || status === "waiting-for-result-import") {
        return { role, state: "in-progress" as const };
      }
    }

    return { role, state: "pending" as const };
  });
}

/**
 * Derive handoff summaries from the completed-roles list.
 *
 * A handoff is `crossed` when its `fromRole` is in `completedRoles`.
 */
export function deriveHandoffSummaries(
  completedRoles: RunOrchestratedRole[],
): OrchestrationHandoffSummary[] {
  const completedSet = new Set(completedRoles);
  return HANDOFF_DEFINITIONS.map((def) => ({
    ...def,
    crossed: completedSet.has(def.fromRole),
  }));
}

/**
 * Produce a human-readable description of the current orchestration lifecycle
 * position.
 */
export function describeOrchestrationPosition(
  status: OrchestrationRunStatus,
  roleProgress: OrchestrationRoleProgress[],
): string {
  if (status === "completed") {
    return "All roles completed. Orchestration finished.";
  }

  const failedEntry = roleProgress.find((r) => r.state === "failed");
  if (failedEntry) {
    return `Orchestration failed at the ${failedEntry.role} role. Fallback: import result → validate → reconcile.`;
  }

  const activeEntry = roleProgress.find((r) => r.state === "in-progress");
  if (activeEntry) {
    if (status === "waiting-for-result-import") {
      return `Waiting for result import at the ${activeEntry.role} role before validate/reconcile follow-up.`;
    }
    return `${capitalize(activeEntry.role)} role is in progress.`;
  }

  return "Orchestration in progress.";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Orchestration context builder
// ---------------------------------------------------------------------------

/**
 * Build an `OrchestrationReviewContext` from a `RunStatusViewModel` and
 * the corresponding `RunOrchestrationInfo`.
 *
 * This is a pure derivation step.  Use `lookupOrchestrationReviewContext`
 * when you need to fetch+build in one call.
 *
 * Throws if the status view model has no orchestration info, since this
 * builder is only valid for orchestrated runs.
 */
export function buildOrchestrationReviewContext(
  statusViewModel: RunStatusViewModel,
): OrchestrationReviewContext {
  const orchestration = statusViewModel.orchestration;
  if (!orchestration) {
    throw new Error(
      `Run ${statusViewModel.runId} does not have orchestration info. buildOrchestrationReviewContext requires an orchestrated run.`,
    );
  }

  const status = orchestration.status as OrchestrationRunStatus;
  const completedRoles = orchestration.completedRoles;

  const roleProgress = deriveRoleProgress(completedRoles, status);
  const handoffs = deriveHandoffSummaries(completedRoles);
  const lifecyclePosition = describeOrchestrationPosition(status, roleProgress);

  const activeRole = roleProgress.find((r) => r.state === "in-progress")?.role;
  const failedRole = roleProgress.find((r) => r.state === "failed")?.role;

  const outcome = classifyRunStatusOutcome(statusViewModel);
  const artifacts = resolveRunArtifacts(statusViewModel);
  const followUpActions = deriveRunReviewActions(statusViewModel.runId, outcome, artifacts);
  const baseReviewContext = buildRunReviewContext(statusViewModel);

  return {
    runId: statusViewModel.runId,
    taskRef: statusViewModel.taskRef,
    status,
    outcome,
    roleProgress,
    handoffs,
    activeRole,
    failedRole,
    lifecyclePosition,
    orchestrationPath: orchestration.path,
    artifacts,
    followUpActions,
    baseReviewContext,
  };
}

// ---------------------------------------------------------------------------
// Lookup + orchestration context in one call
// ---------------------------------------------------------------------------

export interface LookupOrchestrationReviewContextOptions {
  runId: string;
  /** Project Arch CLI boundary.  Defaults to a fresh boundary using `pa`. */
  boundary?: ProjectArchBoundary;
  /** Working directory for the CLI call.  Defaults to `process.cwd()`. */
  cwd?: string;
}

/**
 * Look up a run's current status and build an `OrchestrationReviewContext`
 * in a single operation.
 *
 * If the returned status indicates the run has no orchestration record,
 * an error is thrown — callers should check `orchestrationRecordExists`
 * via `lookupRunStatus` before calling this function when uncertain.
 */
export async function lookupOrchestrationReviewContext(
  input: LookupOrchestrationReviewContextOptions,
): Promise<OrchestrationReviewContext> {
  const boundary = input.boundary ?? createProjectArchBoundary();

  const statusViewModel = await lookupRunStatus({
    runId: input.runId,
    boundary,
    cwd: input.cwd,
  });

  return buildOrchestrationReviewContext(statusViewModel);
}
