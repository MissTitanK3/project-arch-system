import { z } from "zod";
import {
  agentArtifactIdentitySchema,
  agentIsoDateTimeSchema,
  agentNonEmptyStringArraySchema,
  agentRepoPathSchema,
} from "./agentContractCommon";
import { laneSchema } from "./task";

export const agentTaskContractStatusSchema = z.literal("authorized");
export type AgentTaskContractStatus = z.infer<typeof agentTaskContractStatusSchema>;

export const agentTrustLevelSchema = z.enum([
  "t0-readonly",
  "t1-scoped-edit",
  "t2-structural-edit",
  "t3-maintainer-agent",
]);
export type AgentTrustLevel = z.infer<typeof agentTrustLevelSchema>;

export const agentAllowedOperationSchema = z.enum([
  "read",
  "write",
  "create",
  "run-tests",
  "run-lint",
  "run-typecheck",
]);
export type AgentAllowedOperation = z.infer<typeof agentAllowedOperationSchema>;

export const agentBlockedOperationSchema = z.enum([
  "install-dependency",
  "modify-ci",
  "change-public-api-without-decision",
]);
export type AgentBlockedOperation = z.infer<typeof agentBlockedOperationSchema>;

export const agentEscalationRuleSchema = z.enum([
  "requires-new-dependency",
  "public-contract-change",
  "undocumented-cross-domain-dependency",
]);
export type AgentEscalationRule = z.infer<typeof agentEscalationRuleSchema>;

export const agentTaskContractScopeSchema = z.object({
  allowedPaths: z.array(agentRepoPathSchema).min(1),
  blockedPaths: z.array(agentRepoPathSchema),
  allowedOperations: z.array(agentAllowedOperationSchema).min(1),
  blockedOperations: z.array(agentBlockedOperationSchema),
});
export type AgentTaskContractScope = z.infer<typeof agentTaskContractScopeSchema>;

export const agentTaskArchitectureContextSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().min(1),
  milestoneId: z.string().min(1),
  taskPath: agentRepoPathSchema,
  relatedDecisions: z.array(z.string().min(1)),
  relevantDocs: z.array(agentRepoPathSchema),
  relevantSkills: z.array(agentRepoPathSchema),
  externalStandards: z
    .array(
      z.union([
        z.string().min(1),
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1).optional(),
            url: z.string().url().optional(),
            source: z.string().min(1).optional(),
          })
          .passthrough(),
      ]),
    )
    .optional(),
});
export type AgentTaskArchitectureContext = z.infer<typeof agentTaskArchitectureContextSchema>;

export const agentTaskVerificationSchema = z.object({
  commands: agentNonEmptyStringArraySchema,
  requiredEvidence: agentNonEmptyStringArraySchema,
});
export type AgentTaskVerification = z.infer<typeof agentTaskVerificationSchema>;

export const agentTaskContractSchema = agentArtifactIdentitySchema.extend({
  status: agentTaskContractStatusSchema,
  title: z.string().min(1),
  objective: z.string().min(1),
  lane: laneSchema,
  trustLevel: agentTrustLevelSchema,
  scope: agentTaskContractScopeSchema,
  architectureContext: agentTaskArchitectureContextSchema,
  successCriteria: agentNonEmptyStringArraySchema,
  verification: agentTaskVerificationSchema,
  escalationRules: z.array(agentEscalationRuleSchema).min(1),
  preparedAt: agentIsoDateTimeSchema,
});

export type AgentTaskContract = z.infer<typeof agentTaskContractSchema>;
