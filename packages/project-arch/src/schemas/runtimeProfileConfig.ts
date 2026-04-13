import { z } from "zod";
import { agentIsoDateTimeSchema } from "./agentContractCommon";
import { agentRuntimeIdSchema } from "./agentRuntimeAdapter";

export const runtimeProfileConfigSchemaVersionSchema = z.literal("2.0");
export type RuntimeProfileConfigSchemaVersion = z.infer<
  typeof runtimeProfileConfigSchemaVersionSchema
>;

export const runtimeProfileIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export type RuntimeProfileId = z.infer<typeof runtimeProfileIdSchema>;

export const runtimeProfileReasoningEffortSchema = z.enum(["low", "medium", "high"]);
export type RuntimeProfileReasoningEffort = z.infer<typeof runtimeProfileReasoningEffortSchema>;

export const runtimeProfilePreferredForSchema = z.enum(["run", "orchestrate", "review"]);
export type RuntimeProfilePreferredFor = z.infer<typeof runtimeProfilePreferredForSchema>;

export const runtimeProfileCommonParametersSchema = z
  .object({
    reasoningEffort: runtimeProfileReasoningEffortSchema.optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(200_000).optional(),
  })
  .strict();
export type RuntimeProfileCommonParameters = z.infer<typeof runtimeProfileCommonParametersSchema>;

export type RuntimeProfileAdapterOptionValue =
  | string
  | number
  | boolean
  | null
  | RuntimeProfileAdapterOptionValue[]
  | { [key: string]: RuntimeProfileAdapterOptionValue };

export const runtimeProfileAdapterOptionValueSchema: z.ZodType<RuntimeProfileAdapterOptionValue> =
  z.lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(runtimeProfileAdapterOptionValueSchema),
      z.record(runtimeProfileAdapterOptionValueSchema),
    ]),
  );

export const runtimeProfileAdapterOptionsSchema = z.record(runtimeProfileAdapterOptionValueSchema);
export type RuntimeProfileAdapterOptions = z.infer<typeof runtimeProfileAdapterOptionsSchema>;

const blockedKeyFragments = [
  "secret",
  "token",
  "apikey",
  "password",
  "credential",
  "privatekey",
  "command",
  "executable",
  "script",
  "shell",
  "binarypath",
] as const;

function normalizeOptionKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function findBlockedOptionKeyPaths(
  value: RuntimeProfileAdapterOptionValue,
  currentPath: (string | number)[] = [],
): (string | number)[][] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findBlockedOptionKeyPaths(entry, [...currentPath, index]),
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const blockedPaths: (string | number)[][] = [];

  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizeOptionKey(key);
    if (blockedKeyFragments.some((fragment) => normalized.includes(fragment))) {
      blockedPaths.push([...currentPath, key]);
    }

    blockedPaths.push(...findBlockedOptionKeyPaths(nested, [...currentPath, key]));
  }

  return blockedPaths;
}

export const runtimeProfileSchema = z
  .object({
    id: runtimeProfileIdSchema,
    runtime: agentRuntimeIdSchema,
    enabled: z.boolean().default(true),
    label: z.string().min(1).max(120).optional(),
    purpose: z.string().min(1).max(500).optional(),
    preferredFor: z.array(runtimeProfilePreferredForSchema).max(3).optional(),
    model: z.string().min(1).max(120),
    parameters: runtimeProfileCommonParametersSchema.optional(),
    adapterOptions: runtimeProfileAdapterOptionsSchema.optional(),
    updatedAt: agentIsoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.preferredFor) {
      const seen = new Map<RuntimeProfilePreferredFor, number>();

      value.preferredFor.forEach((entry, index) => {
        if (seen.has(entry)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["preferredFor", index],
            message: `Duplicate preferredFor value '${entry}' is not allowed.`,
          });
          return;
        }

        seen.set(entry, index);
      });
    }

    if (value.adapterOptions) {
      const blockedPaths = findBlockedOptionKeyPaths(value.adapterOptions);
      for (const blockedPath of blockedPaths) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["adapterOptions", ...blockedPath],
          message:
            "adapterOptions cannot include secret-oriented fields or executable adapter definitions.",
        });
      }
    }
  });
export type RuntimeProfile = z.infer<typeof runtimeProfileSchema>;

export const runtimeProfileConfigSchema = z
  .object({
    schemaVersion: runtimeProfileConfigSchemaVersionSchema,
    defaultProfile: runtimeProfileIdSchema.optional(),
    profiles: z.array(runtimeProfileSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const profileIds = value.profiles.map((profile) => profile.id);
    const seen = new Map<string, number>();

    profileIds.forEach((profileId, index) => {
      if (seen.has(profileId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["profiles", index, "id"],
          message: `Duplicate runtime profile id '${profileId}' is not allowed.`,
        });
        return;
      }

      seen.set(profileId, index);
    });

    if (value.defaultProfile && !profileIds.includes(value.defaultProfile)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultProfile"],
        message: "defaultProfile must reference an id from profiles.",
      });
    }
  });
export type RuntimeProfileConfig = z.infer<typeof runtimeProfileConfigSchema>;
