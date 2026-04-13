import path from "path";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION } from "./output";
import { toPosixRelativePath } from "./paths";
import {
  agentAuditEventSchema,
  agentAuditHistorySchema,
  type AgentAuditCommand,
  type AgentAuditEvent,
  type AgentAuditHistory,
} from "../../schemas/agentAuditLog";

export type { AgentAuditCommand, AgentAuditEvent };

export interface AgentAuditHistoryOptions {
  cwd?: string;
  runId?: string;
  limit?: number;
}

export type AgentAuditHistoryResult = AgentAuditHistory;

const AGENT_RUNTIME_LOGS_DIR = ".project-arch/agent-runtime/logs";
const AGENT_RUNTIME_AUDIT_LOG_FILE = "execution.jsonl";

function auditLogsDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_RUNTIME_LOGS_DIR);
}

export function auditLogPath(cwd = process.cwd()): string {
  return path.join(auditLogsDirPath(cwd), AGENT_RUNTIME_AUDIT_LOG_FILE);
}

function buildAuditEventId(input: { command: AgentAuditCommand; runId?: string }): string {
  const now = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${input.command}-${input.runId ?? "no-run"}-${now}-${suffix}`;
}

export async function appendAgentAuditEvent(
  input: Omit<AgentAuditEvent, "schemaVersion" | "eventId" | "occurredAt">,
  cwd = process.cwd(),
): Promise<AgentAuditEvent> {
  const fs = await import("fs-extra");
  const event = agentAuditEventSchema.parse({
    schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
    eventId: buildAuditEventId({ command: input.command, runId: input.runId }),
    occurredAt: new Date().toISOString(),
    command: input.command,
    status: input.status,
    runId: input.runId,
    taskId: input.taskId,
    message: input.message,
    metadata: input.metadata,
  });

  const targetPath = auditLogPath(cwd);
  await fs.default.ensureDir(path.dirname(targetPath));
  await fs.default.appendFile(targetPath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readAgentAuditHistory(
  options: AgentAuditHistoryOptions = {},
): Promise<AgentAuditHistoryResult> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = auditLogPath(cwd);
  const fs = await import("fs-extra");

  const exists = await fs.default.pathExists(targetPath);
  if (!exists) {
    return agentAuditHistorySchema.parse({
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      status: "audit-history",
      logPath: toPosixRelativePath(cwd, targetPath),
      events: [],
      total: 0,
      filteredByRunId: options.runId,
    });
  }

  const content = await fs.default.readFile(targetPath, "utf8");
  const events = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        const parsed = agentAuditEventSchema.safeParse(JSON.parse(line));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is AgentAuditEvent => entry !== null);

  const byRun = options.runId ? events.filter((event) => event.runId === options.runId) : events;
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : undefined;
  const limited = limit ? byRun.slice(-limit) : byRun;

  return agentAuditHistorySchema.parse({
    schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
    status: "audit-history",
    logPath: toPosixRelativePath(cwd, targetPath),
    events: limited,
    total: byRun.length,
    filteredByRunId: options.runId,
  });
}
