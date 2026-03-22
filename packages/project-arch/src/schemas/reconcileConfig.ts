import { z } from "zod";
import { workflowProfileSchema } from "./workflowProfile";

export const triggerNameSchema = z.enum([
  "architecture-surface",
  "module-boundary",
  "schema-contract",
  "terminology",
  "milestone-target",
  "unresolved-drift",
]);

export const ruleStatusSchema = z.enum(["required", "suggested", "none"]);

export const changeTypeSchema = z.enum([
  "architecture",
  "module-boundary",
  "schema-contract",
  "terminology",
  "milestone",
  "drift",
  "docs",
  "code",
]);

const baseTriggerMatchRuleSchema = z.object({
  trigger: triggerNameSchema.optional(),
  pathPattern: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  changeType: changeTypeSchema.optional(),
});

function hasRuleMatchers(value: {
  trigger?: unknown;
  pathPattern?: unknown;
  domain?: unknown;
  changeType?: unknown;
}): boolean {
  return (
    Boolean(value.trigger) ||
    Boolean(value.pathPattern) ||
    Boolean(value.domain) ||
    Boolean(value.changeType)
  );
}

export const includeRuleSchema = baseTriggerMatchRuleSchema
  .extend({
    status: z.enum(["required", "suggested"]).optional(),
  })
  .refine(hasRuleMatchers, {
    message:
      "At least one of trigger, pathPattern, domain, or changeType must be provided in a rule.",
  });

export const excludeRuleSchema = baseTriggerMatchRuleSchema
  .extend({
    downgradeTo: z.enum(["suggested", "none"]).default("suggested"),
  })
  .refine(hasRuleMatchers, {
    message:
      "At least one of trigger, pathPattern, domain, or changeType must be provided in a rule.",
  });

export const overrideRuleSchema = z.object({
  trigger: triggerNameSchema,
  status: ruleStatusSchema,
});

export const reconciliationLifecycleModeSchema = z.enum([
  "append-only-history",
  "current-state-record",
]);

export const reconcileConfigSchema = z
  .object({
    schemaVersion: z.literal("1.0").default("1.0"),
    extends: z.literal("default"),
    workflowProfile: workflowProfileSchema.optional(),
    lifecycle: z
      .object({
        mode: reconciliationLifecycleModeSchema.default("append-only-history"),
        writeCanonicalPointers: z.boolean().default(false),
      })
      .default({ mode: "append-only-history", writeCanonicalPointers: false }),
    triggers: z
      .object({
        include: z.array(includeRuleSchema).optional().default([]),
        exclude: z.array(excludeRuleSchema).optional().default([]),
        overrides: z.array(overrideRuleSchema).optional().default([]),
      })
      .default({ include: [], exclude: [], overrides: [] }),
  })
  .superRefine((value, ctx) => {
    const disabledTriggers = new Set(
      (value.triggers.overrides ?? [])
        .filter((rule) => rule.status === "none")
        .map((rule) => rule.trigger),
    );

    if (disabledTriggers.size === triggerNameSchema.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Repo config cannot disable all default triggers. Keep at least one default trigger active.",
      });
    }
  });

export type TriggerName = z.infer<typeof triggerNameSchema>;
export type RuleStatus = z.infer<typeof ruleStatusSchema>;
export type ChangeType = z.infer<typeof changeTypeSchema>;
export type ReconcileConfig = z.infer<typeof reconcileConfigSchema>;
export type IncludeRule = z.infer<typeof includeRuleSchema>;
export type ExcludeRule = z.infer<typeof excludeRuleSchema>;
export type OverrideRule = z.infer<typeof overrideRuleSchema>;
export type ReconciliationLifecycleMode = z.infer<typeof reconciliationLifecycleModeSchema>;
