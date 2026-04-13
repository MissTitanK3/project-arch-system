import { z } from "zod";
import {
  agentContractSchemaVersionSchema,
  agentIsoDateTimeSchema,
  agentRunIdSchema,
  agentTaskIdSchema,
  agentRepoPathSchema,
} from "./agentContractCommon";

export const agentAuditCommandSchema = z.enum([
  "prepare",
  "run",
  "result-import",
  "validate",
  "reconcile",
  "review",
]);
export type AgentAuditCommand = z.infer<typeof agentAuditCommandSchema>;

export const agentAuditStatusSchema = z.enum(["success", "error"]);
export type AgentAuditStatus = z.infer<typeof agentAuditStatusSchema>;

export const agentAuditEventSchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  eventId: z.string().min(1),
  occurredAt: agentIsoDateTimeSchema,
  command: agentAuditCommandSchema,
  status: agentAuditStatusSchema,
  runId: agentRunIdSchema.optional(),
  taskId: agentTaskIdSchema.optional(),
  message: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AgentAuditEvent = z.infer<typeof agentAuditEventSchema>;

export const agentAuditHistorySchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  status: z.literal("audit-history"),
  logPath: agentRepoPathSchema,
  events: z.array(agentAuditEventSchema),
  total: z.number().int().min(0),
  filteredByRunId: agentRunIdSchema.optional(),
});
export type AgentAuditHistory = z.infer<typeof agentAuditHistorySchema>;
