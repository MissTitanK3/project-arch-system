import path from "path";
import { z } from "zod";
import { readJson, writeJsonDeterministic } from "../../utils/fs";
import { agentTaskContractSchema, type AgentTaskContract } from "../../schemas/agentTaskContract";
import { buildAgentRoleOrchestrationContract } from "./roleContracts";
import {
  launchPreparedAgentRun,
  type AgentRunLaunchResult,
  type LaunchPreparedAgentRunOptions,
} from "./run";
import {
  prepareAgentRun,
  type PrepareAgentRunOptions,
  type PrepareAgentRunResult,
} from "./prepare";
import {
  validateAgentRun,
  type ValidateAgentRunOptions,
  type ValidateAgentRunResult,
} from "./validate";
import {
  reconcileAgentRun,
  type ReconcileAgentRunOptions,
  type ReconcileAgentRunResult,
} from "./reconcile";
import { toPosixRelativePath, agentResultPath } from "./paths";
import { pathExists } from "../../utils/fs";
import {
  agentOrchestrationRoleSchema,
  agentRoleHandoffSchema,
  type AgentRoleHandoff,
} from "../../schemas/agentRoleOrchestration";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";

const AGENT_ORCHESTRATION_DIR = ".project-arch/agent-runtime/orchestration";

const agentOrchestrationRoleStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "waiting-input",
]);
type AgentOrchestrationRoleStatus = z.infer<typeof agentOrchestrationRoleStatusSchema>;

const agentOrchestrationHandoffStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "waiting-input",
]);
type AgentOrchestrationHandoffStatus = z.infer<typeof agentOrchestrationHandoffStatusSchema>;

const agentOrchestrationRunStatusSchema = z.enum([
  "in-progress",
  "waiting-for-result-import",
  "failed",
  "completed",
]);
export type AgentOrchestrationRunStatus = z.infer<typeof agentOrchestrationRunStatusSchema>;

const agentOrchestrationAuditEventKindSchema = z.enum([
  "role-transition",
  "handoff-outcome",
  "orchestration-status",
]);

const agentOrchestrationAuditEventSchema = z.object({
  sequence: z.number().int().min(1),
  occurredAt: z.string().datetime(),
  kind: agentOrchestrationAuditEventKindSchema,
  role: agentOrchestrationRoleSchema.optional(),
  handoff: z
    .object({
      fromRole: agentOrchestrationRoleSchema,
      toRole: agentOrchestrationRoleSchema,
      lifecycleBoundary: z.enum(["prepare", "validate", "reconcile"]),
    })
    .optional(),
  fromStatus: z.string().min(1).optional(),
  toStatus: z.string().min(1),
  message: z.string().min(1).optional(),
});
type AgentOrchestrationAuditEvent = z.infer<typeof agentOrchestrationAuditEventSchema>;

const agentOrchestrationRoleStateSchema = z.object({
  role: agentOrchestrationRoleSchema,
  status: agentOrchestrationRoleStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().min(1).optional(),
});

const agentOrchestrationHandoffStateSchema = agentRoleHandoffSchema.extend({
  status: agentOrchestrationHandoffStatusSchema,
  checkedAt: z.string().datetime().optional(),
  missingArtifacts: z.array(z.string().min(1)).optional(),
  error: z.string().min(1).optional(),
});

export const agentOrchestrationRecordSchema = z.object({
  schemaVersion: z.literal("2.0"),
  runId: z.string().min(1),
  taskId: z.string().regex(/^\d{3}$/),
  runtime: z.string().min(1),
  lifecycleModel: z.literal("prepare-run-validate-reconcile"),
  status: agentOrchestrationRunStatusSchema,
  roles: z.array(agentOrchestrationRoleStateSchema).length(4),
  handoffs: z.array(agentOrchestrationHandoffStateSchema).min(3),
  artifacts: z
    .object({
      contractPath: z.string().min(1),
      promptPath: z.string().min(1),
      launchRecordPath: z.string().min(1).optional(),
      resultPath: z.string().min(1).optional(),
      runRecordPath: z.string().min(1).optional(),
      reconciliationReportPath: z.string().min(1).optional(),
    })
    .strict(),
  failure: z
    .object({
      role: agentOrchestrationRoleSchema,
      message: z.string().min(1),
      failedAt: z.string().datetime(),
    })
    .optional(),
  auditTrail: z.array(agentOrchestrationAuditEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AgentOrchestrationRecord = z.infer<typeof agentOrchestrationRecordSchema>;

export interface OrchestrateAgentRunOptions {
  taskId: string;
  runtime: string;
  cwd?: string;
  requestedAt?: string;
  timeoutMs?: number;
  strict?: boolean;
  pathsOnly?: boolean;
  apply?: boolean;
  createDiscovered?: boolean;
  prepare?: (options: PrepareAgentRunOptions) => Promise<PrepareAgentRunResult>;
  launch?: (options: LaunchPreparedAgentRunOptions) => Promise<AgentRunLaunchResult>;
  validate?: (options: ValidateAgentRunOptions) => Promise<ValidateAgentRunResult>;
  reconcile?: (options: ReconcileAgentRunOptions) => Promise<ReconcileAgentRunResult>;
  loadTaskContract?: (input: {
    runId: string;
    cwd: string;
    contractPath: string;
  }) => Promise<AgentTaskContract>;
  resultExists?: (runId: string, cwd: string) => Promise<boolean>;
}

export interface OrchestrateAgentRunResult extends AgentRuntimeCommandResultBase {
  status: "orchestrated";
  orchestrationStatus: AgentOrchestrationRunStatus;
  runtime: string;
  orchestrationPath: string;
  completedRoles: Array<"planner" | "implementer" | "reviewer" | "reconciler">;
  failedRole?: "planner" | "implementer" | "reviewer" | "reconciler";
  nextAction?: "import-result-and-retry";
  runRecordPath?: string;
  reconciliationReportPath?: string;
}

function orchestrationDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_ORCHESTRATION_DIR);
}

export function orchestrationRecordPath(runId: string, cwd = process.cwd()): string {
  return path.join(orchestrationDirPath(cwd), `${runId}.json`);
}

function updateRoleState(
  record: AgentOrchestrationRecord,
  role: z.infer<typeof agentOrchestrationRoleSchema>,
  input: { status: AgentOrchestrationRoleStatus; error?: string },
): void {
  const now = new Date().toISOString();
  const existing = record.roles.find((entry) => entry.role === role);
  record.roles = record.roles.map((entry) => {
    if (entry.role !== role) {
      return entry;
    }
    return {
      ...entry,
      status: input.status,
      startedAt: entry.startedAt ?? now,
      completedAt:
        input.status === "completed" ||
        input.status === "failed" ||
        input.status === "waiting-input"
          ? now
          : entry.completedAt,
      error: input.error,
    };
  });

  if (!existing) {
    return;
  }

  const statusChanged = existing.status !== input.status;
  const messageChanged = (existing.error ?? "") !== (input.error ?? "");
  if (!statusChanged && !messageChanged) {
    return;
  }

  appendAuditEvent(record, {
    occurredAt: now,
    kind: "role-transition",
    role,
    fromStatus: existing.status,
    toStatus: input.status,
    message: input.error,
  });
}

function updateHandoffState(
  record: AgentOrchestrationRecord,
  handoff: AgentRoleHandoff,
  input: {
    status: AgentOrchestrationHandoffStatus;
    missingArtifacts?: string[];
    error?: string;
  },
): void {
  const now = new Date().toISOString();
  const existing = record.handoffs.find(
    (entry) =>
      entry.fromRole === handoff.fromRole &&
      entry.toRole === handoff.toRole &&
      entry.lifecycleBoundary === handoff.lifecycleBoundary,
  );
  record.handoffs = record.handoffs.map((entry) => {
    if (
      entry.fromRole !== handoff.fromRole ||
      entry.toRole !== handoff.toRole ||
      entry.lifecycleBoundary !== handoff.lifecycleBoundary
    ) {
      return entry;
    }
    return {
      ...entry,
      status: input.status,
      checkedAt: now,
      missingArtifacts: input.missingArtifacts,
      error: input.error,
    };
  });

  if (!existing) {
    return;
  }

  const statusChanged = existing.status !== input.status;
  const messageChanged = (existing.error ?? "") !== (input.error ?? "");
  if (!statusChanged && !messageChanged) {
    return;
  }

  appendAuditEvent(record, {
    occurredAt: now,
    kind: "handoff-outcome",
    handoff: {
      fromRole: handoff.fromRole,
      toRole: handoff.toRole,
      lifecycleBoundary: handoff.lifecycleBoundary,
    },
    fromStatus: existing.status,
    toStatus: input.status,
    message: input.error,
  });
}

function appendAuditEvent(
  record: AgentOrchestrationRecord,
  input: Omit<AgentOrchestrationAuditEvent, "sequence">,
): void {
  const nextSequence = record.auditTrail.length + 1;
  record.auditTrail.push({
    sequence: nextSequence,
    ...input,
  });
}

function updateOrchestrationStatus(
  record: AgentOrchestrationRecord,
  status: AgentOrchestrationRunStatus,
  message?: string,
): void {
  if (record.status === status && !message) {
    return;
  }

  const previous = record.status;
  record.status = status;
  appendAuditEvent(record, {
    occurredAt: new Date().toISOString(),
    kind: "orchestration-status",
    fromStatus: previous,
    toStatus: status,
    message,
  });
}

async function writeOrchestrationRecord(
  record: AgentOrchestrationRecord,
  cwd = process.cwd(),
): Promise<string> {
  const parsed = agentOrchestrationRecordSchema.parse({
    ...record,
    updatedAt: new Date().toISOString(),
  });
  const absPath = orchestrationRecordPath(parsed.runId, cwd);
  await writeJsonDeterministic(absPath, parsed);
  return toPosixRelativePath(cwd, absPath);
}

function completedRoles(
  record: AgentOrchestrationRecord,
): Array<"planner" | "implementer" | "reviewer" | "reconciler"> {
  return record.roles
    .filter((entry) => entry.status === "completed")
    .map((entry) => entry.role) as Array<"planner" | "implementer" | "reviewer" | "reconciler">;
}

function initializeOrchestrationRecord(input: {
  runId: string;
  taskId: string;
  runtime: string;
  contractPath: string;
  promptPath: string;
  handoffs: AgentRoleHandoff[];
}): AgentOrchestrationRecord {
  const now = new Date().toISOString();
  return agentOrchestrationRecordSchema.parse({
    schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
    runId: input.runId,
    taskId: input.taskId,
    runtime: input.runtime,
    lifecycleModel: "prepare-run-validate-reconcile",
    status: "in-progress",
    roles: [
      { role: "planner", status: "pending" },
      { role: "implementer", status: "pending" },
      { role: "reviewer", status: "pending" },
      { role: "reconciler", status: "pending" },
    ],
    handoffs: input.handoffs.map((handoff) => ({ ...handoff, status: "pending" })),
    artifacts: {
      contractPath: input.contractPath,
      promptPath: input.promptPath,
    },
    auditTrail: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function readOrchestrationRecord(
  runId: string,
  cwd = process.cwd(),
): Promise<AgentOrchestrationRecord> {
  const payload = await readJson<unknown>(orchestrationRecordPath(runId, cwd));
  return agentOrchestrationRecordSchema.parse(payload);
}

export async function orchestrateAgentRun(
  options: OrchestrateAgentRunOptions,
): Promise<OrchestrateAgentRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const prepare = options.prepare ?? prepareAgentRun;
  const launch = options.launch ?? launchPreparedAgentRun;
  const validate = options.validate ?? validateAgentRun;
  const reconcile = options.reconcile ?? reconcileAgentRun;
  const loadTaskContract =
    options.loadTaskContract ??
    (async (input: { runId: string; cwd: string; contractPath: string }) => {
      const payload = await readJson<unknown>(path.resolve(input.cwd, input.contractPath));
      return agentTaskContractSchema.parse(payload);
    });
  const resultExists =
    options.resultExists ??
    ((runId: string, root: string) => pathExists(agentResultPath(runId, root)));

  const prepared = await prepare({ taskId: options.taskId, cwd });
  const taskContract = await loadTaskContract({
    runId: prepared.runId,
    cwd,
    contractPath: prepared.contractPath,
  });
  const orchestrationContract = buildAgentRoleOrchestrationContract({ taskContract });

  const record = initializeOrchestrationRecord({
    runId: prepared.runId,
    taskId: prepared.taskId,
    runtime: options.runtime,
    contractPath: prepared.contractPath,
    promptPath: prepared.promptPath,
    handoffs: orchestrationContract.handoffs,
  });

  const plannerToImplementer = record.handoffs.find(
    (handoff) =>
      handoff.fromRole === "planner" &&
      handoff.toRole === "implementer" &&
      handoff.lifecycleBoundary === "prepare",
  );
  const implementerToReviewer = record.handoffs.find(
    (handoff) =>
      handoff.fromRole === "implementer" &&
      handoff.toRole === "reviewer" &&
      handoff.lifecycleBoundary === "validate",
  );
  const reviewerToReconciler = record.handoffs.find(
    (handoff) =>
      handoff.fromRole === "reviewer" &&
      handoff.toRole === "reconciler" &&
      handoff.lifecycleBoundary === "reconcile",
  );

  updateRoleState(record, "planner", { status: "completed" });
  if (plannerToImplementer) {
    updateHandoffState(record, plannerToImplementer, { status: "completed" });
  }
  await writeOrchestrationRecord(record, cwd);
  let orchestrationPath: string;

  try {
    const launchResult = await launch({
      runtime: options.runtime,
      prepared,
      cwd,
      requestedAt: options.requestedAt,
      timeoutMs: options.timeoutMs,
    });

    updateRoleState(record, "implementer", { status: "completed" });
    record.artifacts.launchRecordPath = launchResult.launchRecordPath;
    orchestrationPath = await writeOrchestrationRecord(record, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateRoleState(record, "implementer", { status: "failed", error: message });
    if (implementerToReviewer) {
      updateHandoffState(record, implementerToReviewer, { status: "failed", error: message });
    }
    updateOrchestrationStatus(record, "failed", message);
    record.failure = {
      role: "implementer",
      message,
      failedAt: new Date().toISOString(),
    };
    orchestrationPath = await writeOrchestrationRecord(record, cwd);
    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: record.runId,
      taskId: record.taskId,
      status: "orchestrated",
      orchestrationStatus: record.status,
      runtime: record.runtime,
      orchestrationPath,
      completedRoles: completedRoles(record),
      failedRole: "implementer",
    };
  }

  const hasResult = await resultExists(record.runId, cwd);
  if (!hasResult) {
    updateRoleState(record, "reviewer", { status: "waiting-input" });
    if (implementerToReviewer) {
      updateHandoffState(record, implementerToReviewer, {
        status: "waiting-input",
        missingArtifacts: ["result-bundle"],
      });
    }
    updateOrchestrationStatus(record, "waiting-for-result-import");
    orchestrationPath = await writeOrchestrationRecord(record, cwd);
    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: record.runId,
      taskId: record.taskId,
      status: "orchestrated",
      orchestrationStatus: record.status,
      runtime: record.runtime,
      orchestrationPath,
      completedRoles: completedRoles(record),
      nextAction: "import-result-and-retry",
    };
  }

  try {
    const validation = await validate({
      runId: record.runId,
      cwd,
      strict: options.strict,
      pathsOnly: options.pathsOnly,
    });
    record.artifacts.resultPath = toPosixRelativePath(cwd, agentResultPath(record.runId, cwd));
    record.artifacts.runRecordPath = validation.runRecordPath;

    if (!validation.ok) {
      updateRoleState(record, "reviewer", { status: "failed", error: "Validation failed." });
      if (implementerToReviewer) {
        updateHandoffState(record, implementerToReviewer, { status: "completed" });
      }
      if (reviewerToReconciler) {
        updateHandoffState(record, reviewerToReconciler, {
          status: "failed",
          error: "Validation did not pass; reconcile handoff blocked.",
        });
      }
      updateOrchestrationStatus(
        record,
        "failed",
        "Validation did not pass; reconcile role was not executed.",
      );
      record.failure = {
        role: "reviewer",
        message: "Validation did not pass; reconcile role was not executed.",
        failedAt: new Date().toISOString(),
      };
      orchestrationPath = await writeOrchestrationRecord(record, cwd);
      return {
        schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
        runId: record.runId,
        taskId: record.taskId,
        status: "orchestrated",
        orchestrationStatus: record.status,
        runtime: record.runtime,
        orchestrationPath,
        completedRoles: completedRoles(record),
        failedRole: "reviewer",
        runRecordPath: record.artifacts.runRecordPath,
      };
    }

    updateRoleState(record, "reviewer", { status: "completed" });
    if (implementerToReviewer) {
      updateHandoffState(record, implementerToReviewer, { status: "completed" });
    }
    orchestrationPath = await writeOrchestrationRecord(record, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateRoleState(record, "reviewer", { status: "failed", error: message });
    if (implementerToReviewer) {
      updateHandoffState(record, implementerToReviewer, { status: "failed", error: message });
    }
    updateOrchestrationStatus(record, "failed", message);
    record.failure = {
      role: "reviewer",
      message,
      failedAt: new Date().toISOString(),
    };
    orchestrationPath = await writeOrchestrationRecord(record, cwd);
    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: record.runId,
      taskId: record.taskId,
      status: "orchestrated",
      orchestrationStatus: record.status,
      runtime: record.runtime,
      orchestrationPath,
      completedRoles: completedRoles(record),
      failedRole: "reviewer",
      runRecordPath: record.artifacts.runRecordPath,
    };
  }

  try {
    const reconciled = await reconcile({
      runId: record.runId,
      cwd,
      apply: options.apply,
      createDiscovered: options.createDiscovered,
    });

    updateRoleState(record, "reconciler", { status: "completed" });
    if (reviewerToReconciler) {
      updateHandoffState(record, reviewerToReconciler, { status: "completed" });
    }
    record.artifacts.reconciliationReportPath = reconciled.reportPath;
    updateOrchestrationStatus(record, "completed");
    orchestrationPath = await writeOrchestrationRecord(record, cwd);

    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: record.runId,
      taskId: record.taskId,
      status: "orchestrated",
      orchestrationStatus: record.status,
      runtime: record.runtime,
      orchestrationPath,
      completedRoles: completedRoles(record),
      runRecordPath: record.artifacts.runRecordPath,
      reconciliationReportPath: record.artifacts.reconciliationReportPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateRoleState(record, "reconciler", { status: "failed", error: message });
    if (reviewerToReconciler) {
      updateHandoffState(record, reviewerToReconciler, { status: "failed", error: message });
    }
    updateOrchestrationStatus(record, "failed", message);
    record.failure = {
      role: "reconciler",
      message,
      failedAt: new Date().toISOString(),
    };
    orchestrationPath = await writeOrchestrationRecord(record, cwd);
    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: record.runId,
      taskId: record.taskId,
      status: "orchestrated",
      orchestrationStatus: record.status,
      runtime: record.runtime,
      orchestrationPath,
      completedRoles: completedRoles(record),
      failedRole: "reconciler",
      runRecordPath: record.artifacts.runRecordPath,
    };
  }
}
