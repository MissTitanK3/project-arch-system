import { z } from "zod";
import {
  agentArtifactIdentitySchema,
  agentIsoDateTimeSchema,
  agentRepoPathSchema,
} from "./agentContractCommon";
import { agentTrustLevelSchema } from "./agentTaskContract";

export const agentOrchestrationRoleSchema = z.enum([
  "planner",
  "implementer",
  "reviewer",
  "reconciler",
]);
export type AgentOrchestrationRole = z.infer<typeof agentOrchestrationRoleSchema>;

export const agentOrchestrationLifecycleBoundarySchema = z.enum([
  "prepare",
  "validate",
  "reconcile",
]);
export type AgentOrchestrationLifecycleBoundary = z.infer<
  typeof agentOrchestrationLifecycleBoundarySchema
>;

export const agentOrchestrationArtifactKindSchema = z.enum([
  "task-contract",
  "prompt",
  "result-bundle",
  "run-record",
  "review-surface",
  "reconciliation-report",
  "escalation-draft",
]);
export type AgentOrchestrationArtifactKind = z.infer<typeof agentOrchestrationArtifactKindSchema>;

export const agentOrchestrationOperationProfileSchema = z.enum([
  "read-context",
  "implement-within-scope",
  "validate-and-review",
  "reconcile-reporting",
]);
export type AgentOrchestrationOperationProfile = z.infer<
  typeof agentOrchestrationOperationProfileSchema
>;

export const agentRoleContractSchema = z.object({
  role: agentOrchestrationRoleSchema,
  trustLevel: agentTrustLevelSchema,
  operationProfile: agentOrchestrationOperationProfileSchema,
  outputBoundary: agentOrchestrationLifecycleBoundarySchema,
  consumesArtifacts: z.array(agentOrchestrationArtifactKindSchema).min(1),
  producesArtifacts: z.array(agentOrchestrationArtifactKindSchema).min(1),
  scopePaths: z.array(agentRepoPathSchema).min(1),
});
export type AgentRoleContract = z.infer<typeof agentRoleContractSchema>;

export const agentRoleHandoffSchema = z.object({
  fromRole: agentOrchestrationRoleSchema,
  toRole: agentOrchestrationRoleSchema,
  lifecycleBoundary: agentOrchestrationLifecycleBoundarySchema,
  requiredArtifacts: z.array(agentOrchestrationArtifactKindSchema).min(1),
  authorityModel: z.literal("single-agent-lifecycle"),
  trustBoundary: z.literal("inherit-authorized-task-scope"),
});
export type AgentRoleHandoff = z.infer<typeof agentRoleHandoffSchema>;

function includesHandoff(
  handoffs: AgentRoleHandoff[],
  fromRole: AgentOrchestrationRole,
  toRole: AgentOrchestrationRole,
  lifecycleBoundary: AgentOrchestrationLifecycleBoundary,
): boolean {
  return handoffs.some(
    (handoff) =>
      handoff.fromRole === fromRole &&
      handoff.toRole === toRole &&
      handoff.lifecycleBoundary === lifecycleBoundary,
  );
}

export const agentRoleOrchestrationContractSchema = agentArtifactIdentitySchema
  .extend({
    authorityModel: z.literal("single-agent-lifecycle"),
    lifecycleModel: z.literal("prepare-run-validate-reconcile"),
    roleContracts: z.array(agentRoleContractSchema).min(4),
    handoffs: z.array(agentRoleHandoffSchema).min(3),
    createdAt: agentIsoDateTimeSchema,
  })
  .superRefine((value, context) => {
    const requiredRoles: AgentOrchestrationRole[] = [
      "planner",
      "implementer",
      "reviewer",
      "reconciler",
    ];

    for (const role of requiredRoles) {
      const count = value.roleContracts.filter((entry) => entry.role === role).length;
      if (count !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `roleContracts must contain exactly one '${role}' contract.`,
          path: ["roleContracts"],
        });
      }
    }

    const roleBoundaryExpectations: Record<
      AgentOrchestrationRole,
      AgentOrchestrationLifecycleBoundary
    > = {
      planner: "prepare",
      implementer: "validate",
      reviewer: "reconcile",
      reconciler: "reconcile",
    };

    for (const [role, expectedBoundary] of Object.entries(roleBoundaryExpectations) as [
      AgentOrchestrationRole,
      AgentOrchestrationLifecycleBoundary,
    ][]) {
      const contract = value.roleContracts.find((entry) => entry.role === role);
      if (contract && contract.outputBoundary !== expectedBoundary) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${role} must emit outputs at lifecycle boundary '${expectedBoundary}'.`,
          path: ["roleContracts"],
        });
      }
    }

    const requiredHandoffs: Array<
      [AgentOrchestrationRole, AgentOrchestrationRole, AgentOrchestrationLifecycleBoundary]
    > = [
      ["planner", "implementer", "prepare"],
      ["implementer", "reviewer", "validate"],
      ["reviewer", "reconciler", "reconcile"],
    ];

    for (const [fromRole, toRole, lifecycleBoundary] of requiredHandoffs) {
      if (!includesHandoff(value.handoffs, fromRole, toRole, lifecycleBoundary)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "handoffs must include planner->implementer (prepare), implementer->reviewer (validate), and reviewer->reconciler (reconcile).",
          path: ["handoffs"],
        });
        break;
      }
    }
  });
export type AgentRoleOrchestrationContract = z.infer<typeof agentRoleOrchestrationContractSchema>;
