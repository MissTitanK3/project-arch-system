import path from "path";
import { agentResultBundleSchema, type AgentResultBundle } from "../../schemas/agentResultBundle";
import { pathExists, readJson, writeJsonDeterministic } from "../../utils/fs";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";
import { agentResultPath, toPosixRelativePath } from "./paths";
import { appendAgentAuditEvent } from "./audit";

export class ResultImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResultImportError";
  }
}

export interface ImportAgentResultOptions {
  path: string;
  cwd?: string;
}

export interface ImportAgentResultResult extends AgentRuntimeCommandResultBase {
  runId: string;
  taskId: string;
  status: "imported";
  resultPath: string;
}

export async function readAgentResultBundle(bundlePath: string): Promise<AgentResultBundle> {
  let raw: unknown;

  try {
    raw = await readJson<unknown>(bundlePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ResultImportError(
      "PAA008",
      `Result bundle could not be read as valid JSON: ${bundlePath}. ${message}`,
    );
  }

  const parsed = agentResultBundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? ` at '${issue.path.join(".")}'` : "";
    throw new ResultImportError(
      "PAA008",
      `Result bundle failed schema validation${where}: ${issue?.message ?? "unknown validation error"}`,
    );
  }

  return parsed.data;
}

export async function importAgentResult(
  options: ImportAgentResultOptions,
): Promise<ImportAgentResultResult> {
  const cwd = options.cwd ?? process.cwd();
  let bundle: AgentResultBundle | undefined;

  try {
    const sourcePath = path.resolve(cwd, options.path);
    bundle = await readAgentResultBundle(sourcePath);

    const targetPath = agentResultPath(bundle.runId, cwd);
    if (await pathExists(targetPath)) {
      throw new ResultImportError(
        "PAA009",
        `Result bundle for run ${bundle.runId} already exists at ${toPosixRelativePath(cwd, targetPath)}. Duplicate imports are not allowed.`,
      );
    }

    await writeJsonDeterministic(targetPath, bundle);
    await appendAgentAuditEvent(
      {
        command: "result-import",
        status: "success",
        runId: bundle.runId,
        taskId: bundle.taskId,
        metadata: {
          sourcePath: toPosixRelativePath(cwd, sourcePath),
          resultPath: toPosixRelativePath(cwd, targetPath),
        },
      },
      cwd,
    );

    return {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: bundle.runId,
      taskId: bundle.taskId,
      status: "imported",
      resultPath: toPosixRelativePath(cwd, targetPath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendAgentAuditEvent(
      {
        command: "result-import",
        status: "error",
        runId: bundle?.runId,
        taskId: bundle?.taskId,
        message,
      },
      cwd,
    ).catch(() => undefined);
    throw error;
  }
}
