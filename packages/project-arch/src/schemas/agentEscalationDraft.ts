import { z } from "zod";
import { agentArtifactIdentitySchema, agentIsoDateTimeSchema } from "./agentContractCommon";
import {
  agentEscalationTypeSchema,
  agentEscalationSeveritySchema,
  agentEscalationOptionSchema,
  agentEscalationNextStepSchema,
} from "./agentEscalationRequest";

export const agentEscalationDraftSchema = agentArtifactIdentitySchema.extend({
  type: z.literal("agent-escalation-draft"),
  status: z.literal("draft"),
  escalationType: agentEscalationTypeSchema,
  severity: agentEscalationSeveritySchema,
  summary: z.string().min(1),
  details: z.array(z.string().min(1)).min(1),
  options: z.array(agentEscalationOptionSchema).min(1),
  recommendedNextStep: agentEscalationNextStepSchema,
  sourceCreatedAt: agentIsoDateTimeSchema,
  promotedAt: agentIsoDateTimeSchema,
});
export type AgentEscalationDraft = z.infer<typeof agentEscalationDraftSchema>;
