import { z } from "zod";

import {
  agentArtifactIdentitySchema,
  agentIsoDateTimeSchema,
  agentNonEmptyStringArraySchema,
  agentSeveritySchema,
  type AgentSeverity,
} from "./agentContractCommon";

export const agentEscalationTypeSchema = z.enum([
  "requires-new-dependency",
  "public-contract-change",
  "missing-domain-boundary",
  "missing-standard",
  "undocumented-cross-domain-dependency",
  "missing-task-authority",
]);
export type AgentEscalationType = z.infer<typeof agentEscalationTypeSchema>;

export const agentEscalationSeveritySchema = agentSeveritySchema;
export type AgentEscalationSeverity = AgentSeverity;

export const agentEscalationOptionSchema = z.object({
  label: z.string().min(1),
  impact: z.string().min(1),
});
export type AgentEscalationOption = z.infer<typeof agentEscalationOptionSchema>;

export const agentEscalationNextStepSchema = z.enum([
  "create-decision-draft",
  "create-discovered-task-draft",
  "stop-run",
]);
export type AgentEscalationNextStep = z.infer<typeof agentEscalationNextStepSchema>;

export const agentEscalationRequestSchema = agentArtifactIdentitySchema.extend({
  escalationType: agentEscalationTypeSchema,
  severity: agentEscalationSeveritySchema,
  summary: z.string().min(1),
  details: agentNonEmptyStringArraySchema,
  options: z.array(agentEscalationOptionSchema).min(1),
  recommendedNextStep: agentEscalationNextStepSchema,
  createdAt: agentIsoDateTimeSchema,
});
export type AgentEscalationRequest = z.infer<typeof agentEscalationRequestSchema>;
