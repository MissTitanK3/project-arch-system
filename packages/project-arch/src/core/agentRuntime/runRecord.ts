import path from "path";
import { z } from "zod";
import { agentIsoDateTimeSchema, agentRepoPathSchema } from "../../schemas/agentContractCommon";
import { agentValidationReportSchema, type AgentValidationReport } from "./validationReport";
import { readJson, writeJsonDeterministic } from "../../utils/fs";

const AGENT_RUNTIME_RUNS_DIR = ".project-arch/agent-runtime/runs";

export const agentRunReconciliationStatusSchema = z.enum(["not-run", "completed", "failed"]);
export type AgentRunReconciliationStatus = z.infer<typeof agentRunReconciliationStatusSchema>;

export const agentRunReviewStatusSchema = z.enum([
  "validation-failed",
  "validation-passed-awaiting-reconcile",
  "reconciliation-failed",
  "reconciled",
]);
export type AgentRunReviewStatus = z.infer<typeof agentRunReviewStatusSchema>;

export const agentRunRecordSchema = agentValidationReportSchema
  .extend({
    resultPath: agentRepoPathSchema,
    contractPath: agentRepoPathSchema.optional(),
    escalationDraftPaths: z.array(agentRepoPathSchema).optional(),
    reconciliationStatus: agentRunReconciliationStatusSchema,
    reconciliationReportPath: agentRepoPathSchema.optional(),
    reconciledAt: agentIsoDateTimeSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "validation-passed" && !value.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "validation-passed records must set ok=true",
        path: ["ok"],
      });
    }

    if (value.status === "validation-failed" && value.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "validation-failed records must set ok=false",
        path: ["ok"],
      });
    }

    if (value.reconciliationStatus !== "not-run" && !value.reconciledAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reconciledAt is required when reconciliation has been attempted",
        path: ["reconciledAt"],
      });
    }

    if (value.reconciliationStatus === "completed" && !value.reconciliationReportPath) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reconciliationReportPath is required when reconciliationStatus=completed",
        path: ["reconciliationReportPath"],
      });
    }

    if (value.reconciliationStatus === "not-run" && value.reconciliationReportPath) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reconciliationReportPath is not allowed when reconciliationStatus=not-run",
        path: ["reconciliationReportPath"],
      });
    }
  });

export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

export function deriveAgentRunReviewStatus(record: AgentRunRecord): AgentRunReviewStatus {
  if (record.status === "validation-failed") {
    return "validation-failed";
  }

  if (record.reconciliationStatus === "not-run") {
    return "validation-passed-awaiting-reconcile";
  }

  if (record.reconciliationStatus === "failed") {
    return "reconciliation-failed";
  }

  return "reconciled";
}

export function agentRunsDir(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_RUNTIME_RUNS_DIR);
}

export function agentRunRecordPath(runId: string, cwd = process.cwd()): string {
  return path.join(agentRunsDir(cwd), `${runId}.json`);
}

export function buildAgentRunRecord(input: {
  validationReport: AgentValidationReport;
  resultPath: string;
  contractPath?: string;
}): AgentRunRecord {
  return agentRunRecordSchema.parse({
    schemaVersion: input.validationReport.schemaVersion,
    runId: input.validationReport.runId,
    taskId: input.validationReport.taskId,
    status: input.validationReport.status,
    ok: input.validationReport.ok,
    validatedAt: input.validationReport.validatedAt,
    violations: input.validationReport.violations,
    warnings: input.validationReport.warnings,
    checksRun: input.validationReport.checksRun,
    resultPath: input.resultPath,
    contractPath: input.contractPath,
    escalationDraftPaths: [],
    reconciliationStatus: "not-run",
  });
}

export async function writeAgentRunRecord(
  record: AgentRunRecord,
  cwd = process.cwd(),
): Promise<string> {
  const parsed = agentRunRecordSchema.parse(record);
  const targetPath = agentRunRecordPath(parsed.runId, cwd);
  await writeJsonDeterministic(targetPath, parsed);
  return targetPath;
}

export async function readAgentRunRecord(
  runId: string,
  cwd = process.cwd(),
): Promise<AgentRunRecord> {
  const payload = await readJson<unknown>(agentRunRecordPath(runId, cwd));
  return agentRunRecordSchema.parse(payload);
}

export async function writeReconciliationStatus(
  input: {
    runId: string;
    reconciliationStatus: AgentRunReconciliationStatus;
    reconciliationReportPath?: string;
    escalationDraftPaths?: string[];
    reconciledAt?: string;
  },
  cwd = process.cwd(),
): Promise<AgentRunRecord> {
  const existing = await readAgentRunRecord(input.runId, cwd);
  const next = agentRunRecordSchema.parse({
    ...existing,
    reconciliationStatus: input.reconciliationStatus,
    reconciliationReportPath: input.reconciliationReportPath,
    escalationDraftPaths: input.escalationDraftPaths ?? existing.escalationDraftPaths,
    reconciledAt: input.reconciledAt,
  });

  await writeAgentRunRecord(next, cwd);
  return next;
}
