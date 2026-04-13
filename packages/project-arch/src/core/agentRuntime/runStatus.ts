import { toPosixRelativePath, agentLaunchRecordPath } from "./paths";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";
import { readAgentRunLaunchRecord, type AgentRunLaunchRecord, AgentRunLaunchError } from "./run";
import {
  readAgentRunRecord,
  agentRunRecordPath,
  deriveAgentRunReviewStatus,
  type AgentRunRecord,
  type AgentRunReviewStatus,
} from "./runRecord";
import { appendAgentAuditEvent } from "./audit";
import { readOrchestrationRecord, orchestrationRecordPath } from "./orchestration";

// ---------------------------------------------------------------------------
// Launch-phase classification
// ---------------------------------------------------------------------------

/**
 * Reflects the adapter-launch phase of a run.
 *
 * - `pre-launch`: No launch record exists; the run was prepared but not yet
 *   dispatched through an adapter.
 * - `launch-dispatched`: An adapter successfully dispatched the run.
 * - `launch-failed`: The adapter reported a failure before dispatch completed.
 * - `post-launch`: The run was launched AND a run record (validation/reconcile
 *   truth) already exists.  The run-record remains the authoritative state; this
 *   phase only indicates that downstream lifecycle has begun.
 */
export type AgentRunLaunchPhase =
  | "pre-launch"
  | "launch-dispatched"
  | "launch-failed"
  | "post-launch";

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface AgentRunLaunchStatusResult extends AgentRuntimeCommandResultBase {
  status: "launch-status";
  /**
   * The resolved launch phase.  The run-record review status (when present) is
   * the authoritative downstream state; `phase` is advisory metadata about the
   * adapter-launch boundary only.
   */
  phase: AgentRunLaunchPhase;
  lifecycleBoundary: "prepare-first";
  /** Present when a launch record exists for the run. */
  launchRecord?: AgentRunLaunchRecord;
  launchRecordPath?: string;
  /** true when a validated run record exists for this run. */
  runRecordExists: boolean;
  runRecordPath?: string;
  orchestrationRecordExists: boolean;
  orchestrationPath?: string;
  orchestrationStatus?: "in-progress" | "waiting-for-result-import" | "failed" | "completed";
  orchestrationCompletedRoles?: Array<"planner" | "implementer" | "reviewer" | "reconciler">;
  /**
   * The reviewStatus derived from the existing run record, when present.
   * This is the authoritative source of validation / reconcile truth.
   */
  runReviewStatus?: AgentRunReviewStatus;
  runtime?: string;
  runHandle?: string;
  launchedAt?: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface GetAgentRunLaunchStatusOptions {
  runId: string;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

export async function getAgentRunLaunchStatus(
  options: GetAgentRunLaunchStatusOptions,
): Promise<AgentRunLaunchStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const runId = options.runId;

  // ------------------------------------------------------------------
  // 1. Attempt to read the launch record (optional – may be pre-launch)
  // ------------------------------------------------------------------
  let launchRecord: AgentRunLaunchRecord | undefined;
  let launchRecPathRel: string | undefined;

  try {
    launchRecord = await readAgentRunLaunchRecord(runId, cwd);
    launchRecPathRel = toPosixRelativePath(cwd, agentLaunchRecordPath(runId, cwd));
  } catch (error) {
    // PAA018 means not found – acceptable in pre-launch state
    const isPaError = error instanceof AgentRunLaunchError && error.code === "PAA018";
    if (!isPaError) {
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // 2. Attempt to read the run record (optional – may not exist yet)
  // ------------------------------------------------------------------
  let runRecord: AgentRunRecord | undefined;
  let runRecordPathRel: string | undefined;
  let runReviewStatus: AgentRunReviewStatus | undefined;

  try {
    runRecord = await readAgentRunRecord(runId, cwd);
    runRecordPathRel = toPosixRelativePath(cwd, agentRunRecordPath(runId, cwd));
    runReviewStatus = deriveAgentRunReviewStatus(runRecord);
  } catch {
    // not yet available – handled via runRecordExists: false
  }

  let orchestrationRecordExists = false;
  let orchestrationPathRel: string | undefined;
  let orchestrationStatus:
    | "in-progress"
    | "waiting-for-result-import"
    | "failed"
    | "completed"
    | undefined;
  let orchestrationCompletedRoles:
    | Array<"planner" | "implementer" | "reviewer" | "reconciler">
    | undefined;

  try {
    const orchestrationRecord = await readOrchestrationRecord(runId, cwd);
    orchestrationRecordExists = true;
    orchestrationPathRel = toPosixRelativePath(cwd, orchestrationRecordPath(runId, cwd));
    orchestrationStatus = orchestrationRecord.status;
    orchestrationCompletedRoles = orchestrationRecord.roles
      .filter((role) => role.status === "completed")
      .map((role) => role.role) as Array<"planner" | "implementer" | "reviewer" | "reconciler">;
  } catch {
    // orchestration state is optional for non-orchestrated runs
  }

  // ------------------------------------------------------------------
  // 3. Derive launch phase
  // ------------------------------------------------------------------
  let phase: AgentRunLaunchPhase;
  if (!launchRecord) {
    phase = "pre-launch";
  } else if (launchRecord.status === "launch-failed") {
    phase = "launch-failed";
  } else if (runRecord) {
    phase = "post-launch";
  } else {
    phase = "launch-dispatched";
  }

  // ------------------------------------------------------------------
  // 4. Audit the status lookup
  // ------------------------------------------------------------------
  await appendAgentAuditEvent(
    {
      command: "review",
      status: "success",
      runId,
      taskId: launchRecord?.taskId ?? runRecord?.taskId,
      metadata: {
        surface: "launch-status",
        phase,
      },
    },
    cwd,
  ).catch(() => undefined);

  return {
    schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
    runId,
    taskId: launchRecord?.taskId ?? runRecord?.taskId ?? runId,
    status: "launch-status",
    phase,
    lifecycleBoundary: "prepare-first",
    launchRecord,
    launchRecordPath: launchRecPathRel,
    runRecordExists: !!runRecord,
    runRecordPath: runRecordPathRel,
    orchestrationRecordExists,
    orchestrationPath: orchestrationPathRel,
    orchestrationStatus,
    orchestrationCompletedRoles,
    runReviewStatus,
    runtime: launchRecord?.runtime,
    runHandle: launchRecord?.runHandle,
    launchedAt: launchRecord?.launchedAt,
  };
}
