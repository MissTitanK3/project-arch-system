import { z } from "zod";
import { agentRuntimeIdSchema } from "./agentRuntimeAdapter";

export const runtimeAdapterUserConfigSchemaVersionSchema = z.literal("2.0");
export type RuntimeAdapterUserConfigSchemaVersion = z.infer<
  typeof runtimeAdapterUserConfigSchemaVersionSchema
>;

export const runtimeAdapterUserProbeTypeSchema = z.enum(["http-endpoint", "binary-path"]);
export type RuntimeAdapterUserProbeType = z.infer<typeof runtimeAdapterUserProbeTypeSchema>;

const runtimeAdapterHttpProbeTargetSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "probeTarget must be a valid URL.",
      });
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "http-endpoint probeTarget must use http or https.",
      });
    }

    if (parsed.username || parsed.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "http-endpoint probeTarget must not include embedded credentials.",
      });
    }
  });

const runtimeAdapterBinaryProbeTargetSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message:
      "binary-path probeTarget must be an executable name (letters, numbers, dot, underscore, hyphen) with no spaces or path separators.",
  });

const runtimeAdapterUserCommonFieldsSchema = z.object({
  runtime: agentRuntimeIdSchema,
  displayName: z.string().min(1).max(120),
  suggestedModel: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).optional(),
});

const runtimeAdapterUserHttpEndpointSchema = runtimeAdapterUserCommonFieldsSchema
  .extend({
    probeType: z.literal("http-endpoint"),
    probeTarget: runtimeAdapterHttpProbeTargetSchema,
  })
  .strict();

const runtimeAdapterUserBinaryPathSchema = runtimeAdapterUserCommonFieldsSchema
  .extend({
    probeType: z.literal("binary-path"),
    probeTarget: runtimeAdapterBinaryProbeTargetSchema,
  })
  .strict();

export const runtimeAdapterUserEntrySchema = z.discriminatedUnion("probeType", [
  runtimeAdapterUserHttpEndpointSchema,
  runtimeAdapterUserBinaryPathSchema,
]);
export type RuntimeAdapterUserEntry = z.infer<typeof runtimeAdapterUserEntrySchema>;

export const runtimeAdapterUserConfigSchema = z
  .object({
    schemaVersion: runtimeAdapterUserConfigSchemaVersionSchema,
    adapters: z.array(runtimeAdapterUserEntrySchema),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Map<string, number>();

    for (const [index, adapter] of value.adapters.entries()) {
      const previous = seen.get(adapter.runtime);
      if (previous !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["adapters", index, "runtime"],
          message: `Duplicate adapter runtime id '${adapter.runtime}' is not allowed.`,
        });
        continue;
      }

      seen.set(adapter.runtime, index);
    }
  });
export type RuntimeAdapterUserConfig = z.infer<typeof runtimeAdapterUserConfigSchema>;
