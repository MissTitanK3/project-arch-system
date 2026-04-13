import { z } from "zod";
import { agentIsoDateTimeSchema } from "./agentContractCommon";
import { agentRuntimeIdSchema } from "./agentRuntimeAdapter";
import { runtimeProfileIdSchema } from "./runtimeProfileConfig";

export const runtimeInventoryAvailabilitySourceSchema = z.enum(["adapter-registry", "config-file"]);
export type RuntimeInventoryAvailabilitySource = z.infer<
  typeof runtimeInventoryAvailabilitySourceSchema
>;

export const runtimeProfileReadinessStatusSchema = z.enum([
  "ready",
  "runtime-unavailable",
  "missing-model",
  "missing-auth",
  "missing-binary",
  "invalid-config",
  "adapter-check-failed",
  "disabled",
]);
export type RuntimeProfileReadinessStatus = z.infer<typeof runtimeProfileReadinessStatusSchema>;

export const runtimeProfileInventoryStatusSchema = z.enum(["ready", "not-ready", "disabled"]);
export type RuntimeProfileInventoryStatus = z.infer<typeof runtimeProfileInventoryStatusSchema>;

export const runtimeReadinessDiagnosticSeveritySchema = z.enum(["error", "warning"]);
export type RuntimeReadinessDiagnosticSeverity = z.infer<
  typeof runtimeReadinessDiagnosticSeveritySchema
>;

export const runtimeReadinessDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    severity: runtimeReadinessDiagnosticSeveritySchema,
    message: z.string().min(1),
    nextStep: z.string().min(1),
    docsHint: z.string().min(1).optional(),
  })
  .strict();
export type RuntimeReadinessDiagnostic = z.infer<typeof runtimeReadinessDiagnosticSchema>;

export const runtimeInventoryRuntimeEntrySchema = z
  .object({
    runtime: agentRuntimeIdSchema,
    displayName: z.string().min(1),
    description: z.string().min(1).optional(),
    available: z.boolean(),
    availabilitySource: runtimeInventoryAvailabilitySourceSchema,
    profiles: z.array(runtimeProfileIdSchema),
  })
  .strict();
export type RuntimeInventoryRuntimeEntry = z.infer<typeof runtimeInventoryRuntimeEntrySchema>;

export const runtimeInventoryProfileEntrySchema = z
  .object({
    id: runtimeProfileIdSchema,
    runtime: agentRuntimeIdSchema,
    label: z.string().min(1).optional(),
    purpose: z.string().min(1).optional(),
    model: z.string().min(1).nullable().optional(),
    enabled: z.boolean(),
    default: z.boolean(),
    linked: z.boolean(),
    available: z.boolean(),
    readiness: runtimeProfileReadinessStatusSchema,
    status: runtimeProfileInventoryStatusSchema,
    diagnostics: z.array(runtimeReadinessDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "disabled" && value.enabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["enabled"],
        message: "Disabled profiles must set enabled=false.",
      });
    }

    if (value.status === "disabled" && value.readiness !== "disabled") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["readiness"],
        message: "Disabled profiles must report readiness='disabled'.",
      });
    }
  });
export type RuntimeInventoryProfileEntry = z.infer<typeof runtimeInventoryProfileEntrySchema>;

export const runtimeInventoryListResultSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    status: z.literal("runtime-inventory"),
    defaultProfile: runtimeProfileIdSchema.optional(),
    runtimes: z.array(runtimeInventoryRuntimeEntrySchema),
    profiles: z.array(runtimeInventoryProfileEntrySchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.defaultProfile &&
      !value.profiles.some((profile) => profile.id === value.defaultProfile)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultProfile"],
        message: "defaultProfile must reference an id from profiles.",
      });
    }
  });
export type RuntimeInventoryListResult = z.infer<typeof runtimeInventoryListResultSchema>;

export const runtimeReadinessCheckResultSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    status: z.literal("runtime-readiness-check"),
    checkedAt: agentIsoDateTimeSchema,
    profileId: runtimeProfileIdSchema.optional(),
    profiles: z.array(runtimeInventoryProfileEntrySchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.profileId) {
      if (value.profiles.length !== 1 || value.profiles[0]?.id !== value.profileId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["profiles"],
          message: "profileId-scoped readiness checks must return exactly one matching profile.",
        });
      }
    }
  });
export type RuntimeReadinessCheckResult = z.infer<typeof runtimeReadinessCheckResultSchema>;
