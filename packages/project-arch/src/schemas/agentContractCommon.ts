import { z } from "zod";

export const agentContractSchemaVersionSchema = z.literal("2.0");
export type AgentContractSchemaVersion = z.infer<typeof agentContractSchemaVersionSchema>;

export const agentRunIdSchema = z.string().min(1);
export type AgentRunId = z.infer<typeof agentRunIdSchema>;

export const agentTaskIdSchema = z.string().regex(/^\d{3}$/);
export type AgentTaskId = z.infer<typeof agentTaskIdSchema>;

export const agentRepoPathSchema = z.string().min(1);
export type AgentRepoPath = z.infer<typeof agentRepoPathSchema>;

export const agentIsoDateTimeSchema = z.string().datetime();
export type AgentIsoDateTime = z.infer<typeof agentIsoDateTimeSchema>;

export const agentNonEmptyStringArraySchema = z.array(z.string().min(1)).min(1);
export type AgentNonEmptyStringArray = z.infer<typeof agentNonEmptyStringArraySchema>;

export const agentSeveritySchema = z.enum(["low", "medium", "high"]);
export type AgentSeverity = z.infer<typeof agentSeveritySchema>;

export const agentArtifactIdentitySchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  runId: agentRunIdSchema,
  taskId: agentTaskIdSchema,
});
export type AgentArtifactIdentity = z.infer<typeof agentArtifactIdentitySchema>;
