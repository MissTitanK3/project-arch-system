import { z } from "zod";
import { agentContractSchemaVersionSchema } from "./agentContractCommon";
import { agentRuntimeIdSchema } from "./agentRuntimeAdapter";
import {
  runtimeProfileAdapterOptionsSchema,
  runtimeProfileCommonParametersSchema,
  runtimeProfileIdSchema,
} from "./runtimeProfileConfig";
import { runtimeReadinessDiagnosticSchema } from "./runtimeInventoryReadiness";

export const agentRuntimeAdapterReadinessStatusSchema = z.enum([
  "ready",
  "missing-auth",
  "missing-binary",
  "invalid-config",
  "adapter-check-failed",
]);
export type AgentRuntimeAdapterReadinessStatus = z.infer<
  typeof agentRuntimeAdapterReadinessStatusSchema
>;

export const agentRuntimeAdapterOptionValidationStatusSchema = z.enum(["valid", "invalid"]);
export type AgentRuntimeAdapterOptionValidationStatus = z.infer<
  typeof agentRuntimeAdapterOptionValidationStatusSchema
>;

export const agentRuntimeAdapterConfigurationInputSchema = z
  .object({
    schemaVersion: agentContractSchemaVersionSchema,
    runtime: agentRuntimeIdSchema,
    profileId: runtimeProfileIdSchema,
    model: z.string().min(1).max(120).optional(),
    parameters: runtimeProfileCommonParametersSchema.optional(),
    adapterOptions: runtimeProfileAdapterOptionsSchema.optional(),
  })
  .strict();
export type AgentRuntimeAdapterConfigurationInput = z.infer<
  typeof agentRuntimeAdapterConfigurationInputSchema
>;

export const agentRuntimeAdapterReadinessInputSchema = agentRuntimeAdapterConfigurationInputSchema;
export type AgentRuntimeAdapterReadinessInput = z.infer<
  typeof agentRuntimeAdapterReadinessInputSchema
>;

export const agentRuntimeAdapterOptionValidationInputSchema =
  agentRuntimeAdapterConfigurationInputSchema;
export type AgentRuntimeAdapterOptionValidationInput = z.infer<
  typeof agentRuntimeAdapterOptionValidationInputSchema
>;

export const agentRuntimeAdapterReadinessResultSchema = z
  .object({
    schemaVersion: agentContractSchemaVersionSchema,
    runtime: agentRuntimeIdSchema,
    profileId: runtimeProfileIdSchema,
    status: agentRuntimeAdapterReadinessStatusSchema,
    diagnostics: z.array(runtimeReadinessDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status !== "ready" && value.diagnostics.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diagnostics"],
        message: "Non-ready adapter readiness results must include at least one diagnostic.",
      });
    }

    for (const [index, diagnostic] of value.diagnostics.entries()) {
      if (value.status === "ready" && diagnostic.severity === "error") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["diagnostics", index, "severity"],
          message: "Ready adapter readiness results cannot include error-severity diagnostics.",
        });
      }

      if (
        value.status !== "ready" &&
        value.status !== "adapter-check-failed" &&
        diagnostic.code !== value.status
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["diagnostics", index, "code"],
          message:
            "Diagnostic code must align with adapter readiness status unless status=adapter-check-failed.",
        });
      }
    }
  });
export type AgentRuntimeAdapterReadinessResult = z.infer<
  typeof agentRuntimeAdapterReadinessResultSchema
>;

export const agentRuntimeAdapterOptionValidationResultSchema = z
  .object({
    schemaVersion: agentContractSchemaVersionSchema,
    runtime: agentRuntimeIdSchema,
    profileId: runtimeProfileIdSchema,
    status: agentRuntimeAdapterOptionValidationStatusSchema,
    diagnostics: z.array(runtimeReadinessDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "invalid" && value.diagnostics.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diagnostics"],
        message: "Invalid adapter option validation results must include at least one diagnostic.",
      });
    }

    for (const [index, diagnostic] of value.diagnostics.entries()) {
      if (value.status === "valid" && diagnostic.severity === "error") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["diagnostics", index, "severity"],
          message:
            "Valid adapter option validation results cannot include error-severity diagnostics.",
        });
      }

      if (value.status === "invalid" && diagnostic.code !== "invalid-config") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["diagnostics", index, "code"],
          message: "Invalid adapter option validation diagnostics must use code='invalid-config'.",
        });
      }
    }
  });
export type AgentRuntimeAdapterOptionValidationResult = z.infer<
  typeof agentRuntimeAdapterOptionValidationResultSchema
>;

export const agentRuntimeAdapterReadinessSupportedStatuses =
  agentRuntimeAdapterReadinessStatusSchema.options;
export const agentRuntimeAdapterOptionValidationSupportedStatuses =
  agentRuntimeAdapterOptionValidationStatusSchema.options;
