import { z } from "zod";
import { agentIsoDateTimeSchema } from "./agentContractCommon";
import { agentRuntimeIdSchema } from "./agentRuntimeAdapter";
import { runtimeReadinessDiagnosticSchema } from "./runtimeInventoryReadiness";

export const runtimeScanCandidateConfidenceSchema = z.enum(["high", "medium", "low"]);
export type RuntimeScanCandidateConfidence = z.infer<typeof runtimeScanCandidateConfidenceSchema>;

export const runtimeScanCandidateSourceSchema = z.enum([
  "adapter-registry",
  "adapter-probe",
  "environment-variable",
  "system-path",
  "config-file",
]);
export type RuntimeScanCandidateSource = z.infer<typeof runtimeScanCandidateSourceSchema>;

export const runtimeDiscoveredCandidateSchema = z
  .object({
    runtime: agentRuntimeIdSchema,
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(500).optional(),
    confidence: runtimeScanCandidateConfidenceSchema,
    source: runtimeScanCandidateSourceSchema,
    suggestedModel: z.string().min(1).max(120).optional(),
    suggestedLabel: z.string().min(1).max(120).optional(),
    diagnostics: z.array(runtimeReadinessDiagnosticSchema),
  })
  .strict();
export type RuntimeDiscoveredCandidate = z.infer<typeof runtimeDiscoveredCandidateSchema>;

export const runtimeScanResultStatusSchema = z.enum(["success", "partial", "failed"]);
export type RuntimeScanResultStatus = z.infer<typeof runtimeScanResultStatusSchema>;

export const runtimeScanResultSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    status: z.literal("runtime-scan"),
    scanStatus: runtimeScanResultStatusSchema,
    scannedAt: agentIsoDateTimeSchema,
    candidates: z.array(runtimeDiscoveredCandidateSchema),
    diagnostics: z.array(runtimeReadinessDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scanStatus === "failed" && value.diagnostics.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diagnostics"],
        message: "Failed scan results must include at least one diagnostic.",
      });
    }

    if (value.scanStatus === "success" && value.candidates.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message: "Successful scan results must include at least one candidate.",
      });
    }

    if (value.scanStatus === "partial" && value.candidates.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message:
          "Partial scan results must include at least one candidate with recovery diagnostics.",
      });
    }

    for (const [index, candidate] of value.candidates.entries()) {
      if (
        candidate.source === "adapter-probe" &&
        candidate.diagnostics.length === 0 &&
        candidate.confidence !== "high"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index],
          message:
            "Non-high-confidence adapter-probe candidates should include diagnostics explaining uncertainty.",
        });
      }
    }
  });
export type RuntimeScanResult = z.infer<typeof runtimeScanResultSchema>;

export function parseRuntimeScanResult(input: unknown): RuntimeScanResult {
  return runtimeScanResultSchema.parse(input);
}

export function safeParseRuntimeScanResult(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeScanResult> {
  return runtimeScanResultSchema.safeParse(input);
}
