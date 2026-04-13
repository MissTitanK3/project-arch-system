import { z } from "zod";
import {
  agentContractSchemaVersionSchema,
  agentIsoDateTimeSchema,
  agentRunIdSchema,
  agentTaskIdSchema,
  agentRepoPathSchema,
} from "../../schemas/agentContractCommon";

export const agentValidationStatusSchema = z.enum(["validation-passed", "validation-failed"]);
export type AgentValidationStatus = z.infer<typeof agentValidationStatusSchema>;

export const agentValidationFindingSeveritySchema = z.enum(["error", "warning"]);
export type AgentValidationFindingSeverity = z.infer<typeof agentValidationFindingSeveritySchema>;

export const agentValidationFindingSchema = z.object({
  code: z.string().min(1),
  severity: agentValidationFindingSeveritySchema,
  message: z.string().min(1),
  path: agentRepoPathSchema.optional(),
});
export type AgentValidationFinding = z.infer<typeof agentValidationFindingSchema>;

export const agentValidationCheckSchema = z.string().min(1);
export type AgentValidationCheck = z.infer<typeof agentValidationCheckSchema>;

export const agentValidationReportSchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  runId: agentRunIdSchema,
  taskId: agentTaskIdSchema,
  ok: z.boolean(),
  status: agentValidationStatusSchema,
  validatedAt: agentIsoDateTimeSchema,
  violations: z.array(agentValidationFindingSchema),
  warnings: z.array(agentValidationFindingSchema),
  checksRun: z.array(agentValidationCheckSchema).min(1),
});
export type AgentValidationReport = z.infer<typeof agentValidationReportSchema>;
