import { z } from "zod";
import {
  agentArtifactIdentitySchema,
  agentIsoDateTimeSchema,
  agentRepoPathSchema,
  agentSeveritySchema,
  type AgentSeverity,
} from "./agentContractCommon";
import {
  agentEscalationRequestSchema,
  type AgentEscalationRequest,
} from "./agentEscalationRequest";

export const agentResultStatusSchema = z.enum([
  "completed",
  "completed-with-warnings",
  "blocked",
  "failed",
]);
export type AgentResultStatus = z.infer<typeof agentResultStatusSchema>;

export const agentResultFindingSeveritySchema = agentSeveritySchema;
export type AgentResultFindingSeverity = AgentSeverity;

export const agentRuntimeMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
});
export type AgentRuntimeMetadata = z.infer<typeof agentRuntimeMetadataSchema>;

export const agentCommandRunSchema = z.object({
  command: z.string().min(1),
  exitCode: z.number().int(),
});
export type AgentCommandRun = z.infer<typeof agentCommandRunSchema>;

export const agentResultEvidenceSchema = z
  .object({
    diffSummary: z.string().min(1),
    changedFileCount: z.number().int().min(0),
    testsPassed: z.boolean(),
    lintPassed: z.boolean(),
    typecheckPassed: z.boolean(),
  })
  .passthrough();
export type AgentResultEvidence = z.infer<typeof agentResultEvidenceSchema>;

export const agentPolicyFindingSchema = z.object({
  code: z.string().min(1),
  severity: agentResultFindingSeveritySchema,
  message: z.string().min(1),
  path: agentRepoPathSchema.optional(),
});
export type AgentPolicyFinding = z.infer<typeof agentPolicyFindingSchema>;

export const agentProposedDiscoveredTaskSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
});
export type AgentProposedDiscoveredTask = z.infer<typeof agentProposedDiscoveredTaskSchema>;

export const agentDecisionRequestSchema = z.object({
  ...agentEscalationRequestSchema.shape,
});
export type AgentDecisionRequest = AgentEscalationRequest;

export const agentResultBundleSchema = agentArtifactIdentitySchema.extend({
  runtime: agentRuntimeMetadataSchema,
  status: agentResultStatusSchema,
  summary: z.string().min(1),
  changedFiles: z.array(agentRepoPathSchema),
  commandsRun: z.array(agentCommandRunSchema),
  evidence: agentResultEvidenceSchema,
  policyFindings: z.array(agentPolicyFindingSchema),
  proposedDiscoveredTasks: z.array(agentProposedDiscoveredTaskSchema).optional(),
  decisionRequests: z.array(agentDecisionRequestSchema).optional(),
  reconciliationHints: z.array(z.string().min(1)).optional(),
  completedAt: agentIsoDateTimeSchema,
});
export type AgentResultBundle = z.infer<typeof agentResultBundleSchema>;
