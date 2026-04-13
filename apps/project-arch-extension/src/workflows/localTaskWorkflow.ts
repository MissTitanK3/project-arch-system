import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";

export interface AgentPrepareResult {
  schemaVersion: string;
  runId: string;
  taskRef: string;
  status: "prepared";
  contractPath: string;
  promptPath: string;
  prompt?: string;
}

export interface ResultImportResult {
  schemaVersion: string;
  runId: string;
  taskRef: string;
  status: "imported";
  resultPath: string;
}

export interface AgentValidateResult {
  schemaVersion: string;
  runId: string;
  taskRef: string;
  status: "validation-passed" | "validation-failed";
  ok: boolean;
  runRecordPath: string;
}

export interface AgentReconcileResult {
  schemaVersion: string;
  runId: string;
  taskRef: string;
  status: "reconciled";
  reportPath: string;
  reportMarkdownPath: string;
  runRecordPath: string;
  escalationDraftPaths: string[];
  discoveredDraftPath?: string;
}

export type LocalTaskWorkflowAction = "implement" | "plan" | "explain";
export type LocalTaskWorkflowPhase = "prepare" | "import" | "validate" | "reconcile";

export class LocalTaskWorkflowError extends Error {
  constructor(
    public readonly phase: LocalTaskWorkflowPhase,
    message: string,
  ) {
    super(message);
    this.name = "LocalTaskWorkflowError";
  }
}

export interface LocalTaskWorkflowStepEvent {
  action: LocalTaskWorkflowAction;
  taskRef: string;
  runId?: string;
  phase: LocalTaskWorkflowPhase;
  state: "started" | "completed";
  at: string;
}

export interface LocalTaskWorkflowState {
  action: LocalTaskWorkflowAction;
  taskRef: string;
  transport: string;
  runId: string;
  startedAt: string;
  completedAt: string;
  prepare: AgentPrepareResult;
  imported?: ResultImportResult;
  validated?: AgentValidateResult;
  reconciled?: AgentReconcileResult;
  artifacts: {
    contractPath: string;
    promptPath: string;
    resultPath?: string;
    runRecordPath?: string;
    reportPath?: string;
    reportMarkdownPath?: string;
  };
}

export interface RunLocalTaskWorkflowOptions {
  action: LocalTaskWorkflowAction;
  taskRef: string;
  resultBundlePath?: string;
  cwd?: string;
  boundary?: ProjectArchBoundary;
  now?: () => string;
  onStep?: (event: LocalTaskWorkflowStepEvent) => Promise<void> | void;
}

async function emitStep(
  options: RunLocalTaskWorkflowOptions,
  event: Omit<LocalTaskWorkflowStepEvent, "at">,
): Promise<void> {
  if (!options.onStep) {
    return;
  }

  await options.onStep({
    ...event,
    at: options.now ? options.now() : new Date().toISOString(),
  });
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new Error("CLI JSON payload must be an object.");
  }
  return payload as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`CLI JSON payload is missing string field '${key}'.`);
  }
  return value;
}

function readTaskRef(record: Record<string, unknown>): string {
  const taskRef = record["taskRef"];
  if (typeof taskRef === "string" && taskRef.length > 0) {
    return taskRef;
  }

  const taskId = record["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) {
    return taskId;
  }

  throw new Error("CLI JSON payload is missing string field 'taskRef'.");
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`CLI JSON payload is missing boolean field '${key}'.`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`CLI JSON payload is missing string[] field '${key}'.`);
  }
  return value as string[];
}

function unwrapOperationResult<T>(payload: unknown, label: string): T {
  const record = asRecord(payload);
  const success = record.success;

  if (typeof success !== "boolean") {
    throw new Error(`${label} response is missing 'success' boolean.`);
  }

  if (!success) {
    const errors = Array.isArray(record.errors)
      ? record.errors.filter((entry): entry is string => typeof entry === "string")
      : [];
    const message = errors.join("; ") || `${label} failed.`;
    throw new Error(message);
  }

  if (!("data" in record)) {
    throw new Error(`${label} response is missing 'data'.`);
  }

  return record.data as T;
}

function parsePrepareResult(payload: unknown): AgentPrepareResult {
  const record = asRecord(payload);
  return {
    schemaVersion: readString(record, "schemaVersion"),
    runId: readString(record, "runId"),
    taskRef: readTaskRef(record),
    status: readString(record, "status") as AgentPrepareResult["status"],
    contractPath: readString(record, "contractPath"),
    promptPath: readString(record, "promptPath"),
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
  };
}

function parseImportResult(payload: unknown): ResultImportResult {
  const record = asRecord(payload);
  return {
    schemaVersion: readString(record, "schemaVersion"),
    runId: readString(record, "runId"),
    taskRef: readTaskRef(record),
    status: readString(record, "status") as ResultImportResult["status"],
    resultPath: readString(record, "resultPath"),
  };
}

function parseValidateResult(payload: unknown): AgentValidateResult {
  const record = asRecord(payload);
  return {
    schemaVersion: readString(record, "schemaVersion"),
    runId: readString(record, "runId"),
    taskRef: readTaskRef(record),
    status: readString(record, "status") as AgentValidateResult["status"],
    ok: readBoolean(record, "ok"),
    runRecordPath: readString(record, "runRecordPath"),
  };
}

function parseReconcileResult(payload: unknown): AgentReconcileResult {
  const record = asRecord(payload);
  return {
    schemaVersion: readString(record, "schemaVersion"),
    runId: readString(record, "runId"),
    taskRef: readTaskRef(record),
    status: readString(record, "status") as AgentReconcileResult["status"],
    reportPath: readString(record, "reportPath"),
    reportMarkdownPath: readString(record, "reportMarkdownPath"),
    runRecordPath: readString(record, "runRecordPath"),
    escalationDraftPaths: readStringArray(record, "escalationDraftPaths"),
    discoveredDraftPath:
      typeof record.discoveredDraftPath === "string" ? record.discoveredDraftPath : undefined,
  };
}

export async function runLocalTaskWorkflow(
  options: RunLocalTaskWorkflowOptions,
): Promise<LocalTaskWorkflowState> {
  const boundary = options.boundary ?? createProjectArchBoundary();
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    phase: "prepare",
    state: "started",
  });

  let prepare: AgentPrepareResult;
  try {
    const preparePayload = await boundary.runCliJson<unknown>({
      args:
        options.action === "explain"
          ? ["agent", "prepare", options.taskRef, "--prompt-only"]
          : ["agent", "prepare", options.taskRef],
      cwd: options.cwd,
    });

    prepare = parsePrepareResult(unwrapOperationResult(preparePayload, "agent prepare"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalTaskWorkflowError("prepare", message);
  }

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: prepare.runId,
    phase: "prepare",
    state: "completed",
  });

  if (options.action === "plan" || options.action === "explain") {
    return {
      action: options.action,
      taskRef: options.taskRef,
      runId: prepare.runId,
      transport: boundary.transport,
      startedAt,
      completedAt: now(),
      prepare,
      artifacts: {
        contractPath: prepare.contractPath,
        promptPath: prepare.promptPath,
      },
    };
  }

  const bundlePath = options.resultBundlePath?.trim();
  if (!bundlePath) {
    throw new LocalTaskWorkflowError(
      "import",
      "Result bundle path is required for implement workflow.",
    );
  }

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: prepare.runId,
    phase: "import",
    state: "started",
  });

  let imported: ResultImportResult;
  try {
    const importPayload = await boundary.runCliJson<unknown>({
      args: ["result", "import", bundlePath],
      cwd: options.cwd,
    });
    imported = parseImportResult(importPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalTaskWorkflowError("import", message);
  }

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: imported.runId,
    phase: "import",
    state: "completed",
  });

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: imported.runId,
    phase: "validate",
    state: "started",
  });

  let validated: AgentValidateResult;
  try {
    const validatePayload = await boundary.runCliJson<unknown>({
      args: ["agent", "validate", imported.runId],
      cwd: options.cwd,
    });
    validated = parseValidateResult(unwrapOperationResult(validatePayload, "agent validate"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalTaskWorkflowError("validate", message);
  }

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: imported.runId,
    phase: "validate",
    state: "completed",
  });

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: imported.runId,
    phase: "reconcile",
    state: "started",
  });

  let reconciled: AgentReconcileResult;
  try {
    const reconcilePayload = await boundary.runCliJson<unknown>({
      args: ["agent", "reconcile", imported.runId],
      cwd: options.cwd,
    });
    reconciled = parseReconcileResult(unwrapOperationResult(reconcilePayload, "agent reconcile"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalTaskWorkflowError("reconcile", message);
  }

  await emitStep(options, {
    action: options.action,
    taskRef: options.taskRef,
    runId: imported.runId,
    phase: "reconcile",
    state: "completed",
  });

  return {
    action: options.action,
    taskRef: options.taskRef,
    runId: imported.runId,
    transport: boundary.transport,
    startedAt,
    completedAt: now(),
    prepare,
    imported,
    validated,
    reconciled,
    artifacts: {
      contractPath: prepare.contractPath,
      promptPath: prepare.promptPath,
      resultPath: imported.resultPath,
      runRecordPath: validated.runRecordPath,
      reportPath: reconciled.reportPath,
      reportMarkdownPath: reconciled.reportMarkdownPath,
    },
  };
}
