import { z } from "zod";
import { agentContractSchemaVersionSchema } from "./agentContractCommon";
import { agentRuntimeIdSchema } from "./agentRuntimeAdapter";
import { runtimeScanCandidateSourceSchema } from "./runtimeScanResult";

export const agentRuntimeAdapterScanProbeInputSchema = z
  .object({
    schemaVersion: agentContractSchemaVersionSchema,
    runtime: agentRuntimeIdSchema,
  })
  .strict();
export type AgentRuntimeAdapterScanProbeInput = z.infer<
  typeof agentRuntimeAdapterScanProbeInputSchema
>;

export const agentRuntimeAdapterScanProbeResultCandidateSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(500).optional(),
    confidence: z.enum(["high", "medium", "low"]),
    source: runtimeScanCandidateSourceSchema.optional(),
    suggestedModel: z.string().min(1).max(120).optional(),
    suggestedLabel: z.string().min(1).max(120).optional(),
  })
  .strict();
export type AgentRuntimeAdapterScanProbeCandidateResult = z.infer<
  typeof agentRuntimeAdapterScanProbeResultCandidateSchema
>;

export const agentRuntimeAdapterScanProbeResultSchema = z
  .object({
    schemaVersion: agentContractSchemaVersionSchema,
    runtime: agentRuntimeIdSchema,
    status: z.enum(["found", "not-found", "error"]),
    candidates: z.array(agentRuntimeAdapterScanProbeResultCandidateSchema),
    errorMessage: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "found" && value.candidates.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message: "'found' status must include at least one candidate.",
      });
    }

    if (value.status === "error" && !value.errorMessage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errorMessage"],
        message: "'error' status must include an errorMessage.",
      });
    }

    if (value.status === "not-found" && value.candidates.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message: "'not-found' status must not include candidates.",
      });
    }
  });
export type AgentRuntimeAdapterScanProbeResult = z.infer<
  typeof agentRuntimeAdapterScanProbeResultSchema
>;
