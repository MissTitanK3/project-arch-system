import {
  AgentRuntimeAdapterRegistryError,
  buildAgentRuntimeLaunchInput,
  createAgentRuntimeAdapterRegistry,
  resolveAgentRuntimeAdapter,
  type AgentRuntimeAdapterRegistry,
} from "./adapters";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";
import {
  prepareAgentRun,
  type PrepareAgentRunOptions,
  type PrepareAgentRunResult,
} from "./prepare";
import { appendAgentAuditEvent } from "./audit";
import { toPosixRelativePath, agentLaunchRecordPath } from "./paths";
import {
  agentRuntimeLaunchRecordSchema,
  agentRuntimeLaunchResultSchema,
  type AgentRuntimeLaunchRecord,
  type AgentRuntimeLaunchResult,
} from "../../schemas/agentRuntimeAdapter";
import { writeJsonDeterministic, readJson } from "../../utils/fs";

const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000;

export class AgentRunLaunchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly metadata?: {
      runId?: string;
      taskId?: string;
      launchRecordPath?: string;
      runtime?: string;
    },
  ) {
    super(message);
    this.name = "AgentRunLaunchError";
  }
}

export const agentRunLaunchRecordSchema = agentRuntimeLaunchRecordSchema;

export type AgentRunLaunchRecord = AgentRuntimeLaunchRecord;

export interface AgentRunLaunchResult extends AgentRuntimeCommandResultBase {
  status: "launch-dispatched";
  runtime: string;
  runHandle: string;
  launchedAt: string;
  lifecycleBoundary: "prepare-first";
  contractPath: string;
  promptPath: string;
  launchRecordPath: string;
}

export interface LaunchPreparedAgentRunOptions {
  runtime: string;
  prepared: PrepareAgentRunResult;
  cwd?: string;
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  requestedAt?: string;
  timeoutMs?: number;
}

export interface RunAgentTaskOptions {
  taskId: string;
  runtime: string;
  cwd?: string;
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  requestedAt?: string;
  timeoutMs?: number;
  prepare?: (options: PrepareAgentRunOptions) => Promise<PrepareAgentRunResult>;
}

export function launchRecordAbsPath(runId: string, cwd = process.cwd()): string {
  return agentLaunchRecordPath(runId, cwd);
}

function timeoutMessage(runtime: string, timeoutMs: number): string {
  return `PAA017: Runtime adapter '${runtime}' launch timed out after ${timeoutMs}ms.`;
}

async function withLaunchTimeout<T>(
  runtime: string,
  timeoutMs: number,
  work: Promise<T>,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AgentRunLaunchError("PAA017", `PAA017: timeoutMs must be a positive integer.`);
  }

  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new AgentRunLaunchError("PAA017", timeoutMessage(runtime, timeoutMs)));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function writeLaunchRecord(
  record: AgentRunLaunchRecord,
  cwd = process.cwd(),
): Promise<string> {
  const parsed = agentRunLaunchRecordSchema.parse(record);
  const absPath = launchRecordAbsPath(parsed.runId, cwd);
  await writeJsonDeterministic(absPath, parsed);
  return toPosixRelativePath(cwd, absPath);
}

export async function readAgentRunLaunchRecord(
  runId: string,
  cwd = process.cwd(),
): Promise<AgentRunLaunchRecord> {
  const absPath = launchRecordAbsPath(runId, cwd);
  const payload = await readJson<unknown>(absPath).catch(() => {
    throw new AgentRunLaunchError(
      "PAA018",
      `PAA018: Launch record not found for run ${runId}. Expected .project-arch/agent-runtime/launches/${runId}.json.`,
      { runId },
    );
  });
  return agentRunLaunchRecordSchema.parse(payload);
}

export async function launchPreparedAgentRun(
  options: LaunchPreparedAgentRunOptions,
): Promise<AgentRunLaunchResult> {
  const cwd = options.cwd ?? process.cwd();
  const runtime = options.runtime;
  const requestedAt = options.requestedAt ?? new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
  const registry = options.adapterRegistry ?? createAgentRuntimeAdapterRegistry();

  const launchInput = buildAgentRuntimeLaunchInput({
    runtime,
    prepared: options.prepared,
    requestedAt,
  });

  try {
    const adapter = resolveAgentRuntimeAdapter(registry, runtime);
    const launchResult = agentRuntimeLaunchResultSchema.parse(
      await withLaunchTimeout(runtime, timeoutMs, adapter.launch(launchInput)),
    );

    const recordPath = await writeLaunchRecord(
      {
        schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
        runId: launchResult.runId,
        taskId: launchResult.taskId,
        runtime: launchResult.runtime,
        status: "launch-dispatched",
        contractPath: launchInput.contractPath,
        promptPath: launchInput.promptPath,
        allowedPaths: launchInput.allowedPaths,
        requestedAt: launchInput.requestedAt,
        lifecycleBoundary: launchResult.lifecycleBoundary,
        runHandle: launchResult.runHandle,
        launchedAt: launchResult.launchedAt,
      },
      cwd,
    );

    await appendAgentAuditEvent(
      {
        command: "run",
        status: "success",
        runId: launchResult.runId,
        taskId: launchResult.taskId,
        metadata: {
          runtime: launchResult.runtime,
          runHandle: launchResult.runHandle,
          launchRecordPath: recordPath,
        },
      },
      cwd,
    );

    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: launchResult.runId,
      taskId: launchResult.taskId,
      status: "launch-dispatched",
      runtime: launchResult.runtime,
      runHandle: launchResult.runHandle,
      launchedAt: launchResult.launchedAt,
      lifecycleBoundary: launchResult.lifecycleBoundary,
      contractPath: launchInput.contractPath,
      promptPath: launchInput.promptPath,
      launchRecordPath: recordPath,
    };
  } catch (error) {
    const normalized =
      error instanceof AgentRunLaunchError
        ? error
        : error instanceof AgentRuntimeAdapterRegistryError
          ? new AgentRunLaunchError(error.code, `${error.code}: ${error.message}`)
          : new AgentRunLaunchError(
              "PAA016",
              `PAA016: Runtime adapter '${runtime}' launch failed: ${error instanceof Error ? error.message : String(error)}`,
            );

    const failedAt = new Date().toISOString();
    let launchRecordPath: string | undefined;

    try {
      launchRecordPath = await writeLaunchRecord(
        {
          schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
          runId: launchInput.runId,
          taskId: launchInput.taskId,
          runtime,
          status: "launch-failed",
          contractPath: launchInput.contractPath,
          promptPath: launchInput.promptPath,
          allowedPaths: launchInput.allowedPaths,
          requestedAt: launchInput.requestedAt,
          lifecycleBoundary: launchInput.lifecycleBoundary,
          failedAt,
          error: normalized.message,
        },
        cwd,
      );
    } catch {
      launchRecordPath = undefined;
    }

    await appendAgentAuditEvent(
      {
        command: "run",
        status: "error",
        runId: launchInput.runId,
        taskId: launchInput.taskId,
        message: normalized.message,
        metadata: {
          runtime,
          launchRecordPath,
        },
      },
      cwd,
    ).catch(() => undefined);

    throw new AgentRunLaunchError(normalized.code, normalized.message, {
      runId: launchInput.runId,
      taskId: launchInput.taskId,
      runtime,
      launchRecordPath,
    });
  }
}

export async function runAgentTask(options: RunAgentTaskOptions): Promise<AgentRunLaunchResult> {
  const cwd = options.cwd ?? process.cwd();
  const prepare = options.prepare ?? prepareAgentRun;
  const prepared = await prepare({
    taskId: options.taskId,
    cwd,
  });

  return launchPreparedAgentRun({
    runtime: options.runtime,
    prepared,
    cwd,
    adapterRegistry: options.adapterRegistry,
    requestedAt: options.requestedAt,
    timeoutMs: options.timeoutMs,
  });
}

export function asAgentRuntimeLaunchResult(
  result: AgentRuntimeLaunchResult,
): AgentRuntimeLaunchResult {
  return agentRuntimeLaunchResultSchema.parse(result);
}
