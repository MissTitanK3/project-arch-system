import { z } from "zod";

export const knownTaskTypeValues = [
  "implementation",
  "spec",
  "ui",
  "research",
  "validation",
  "integration",
  "refactor",
  "migration",
] as const;

export const knownTaskTypeSchema = z.enum(knownTaskTypeValues);
export type KnownTaskType = z.infer<typeof knownTaskTypeSchema>;

export const taskTypeSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const taskWorkflowSchemaVersionSchema = z.literal("2.0");
export type TaskWorkflowSchemaVersion = z.infer<typeof taskWorkflowSchemaVersionSchema>;

export const taskWorkflowIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type TaskWorkflowId = z.infer<typeof taskWorkflowIdSchema>;

export const taskWorkflowTemplateSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type TaskWorkflowTemplate = z.infer<typeof taskWorkflowTemplateSchema>;

export const taskWorkflowRuntimePreferenceSchema = z.enum([
  "deterministic",
  "local",
  "cloud",
  "hybrid",
]);
export type TaskWorkflowRuntimePreference = z.infer<typeof taskWorkflowRuntimePreferenceSchema>;

export const taskWorkflowItemStatusSchema = z.enum([
  "planned",
  "in_progress",
  "done",
  "blocked",
  "skipped",
]);
export type TaskWorkflowItemStatus = z.infer<typeof taskWorkflowItemStatusSchema>;

export const taskWorkflowEvidencePathSchema = z.string().min(1);
export type TaskWorkflowEvidencePath = z.infer<typeof taskWorkflowEvidencePathSchema>;

export const taskWorkflowItemSchema = z
  .object({
    id: taskWorkflowIdSchema,
    label: z.string().min(1),
    status: taskWorkflowItemStatusSchema,
    notes: z.string().min(1).optional(),
    commandHint: z.string().min(1).optional(),
    evidencePaths: z.array(taskWorkflowEvidencePathSchema).optional(),
  })
  .strict();
export type TaskWorkflowItem = z.infer<typeof taskWorkflowItemSchema>;

export const taskWorkflowStageSchema = z
  .object({
    id: taskWorkflowIdSchema,
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    runtimePreference: taskWorkflowRuntimePreferenceSchema,
    items: z.array(taskWorkflowItemSchema).min(1),
  })
  .strict();
export type TaskWorkflowStage = z.infer<typeof taskWorkflowStageSchema>;

export const taskWorkflowMetadataSchema = z
  .object({
    schemaVersion: taskWorkflowSchemaVersionSchema,
    template: taskWorkflowTemplateSchema,
    stages: z.array(taskWorkflowStageSchema).min(1),
  })
  .strict()
  .superRefine((workflow, ctx) => {
    const stageIds = new Set<string>();
    const itemIds = new Set<string>();

    workflow.stages.forEach((stage, stageIndex) => {
      if (stageIds.has(stage.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate workflow stage id '${stage.id}'.`,
          path: ["stages", stageIndex, "id"],
        });
      }
      stageIds.add(stage.id);

      stage.items.forEach((item, itemIndex) => {
        if (itemIds.has(item.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate workflow item id '${item.id}'.`,
            path: ["stages", stageIndex, "items", itemIndex, "id"],
          });
        }
        itemIds.add(item.id);
      });
    });
  });
export type TaskWorkflowMetadata = z.infer<typeof taskWorkflowMetadataSchema>;

const completionCountSchema = z.number().int().nonnegative();

export const taskWorkflowCompletionSummarySchema = z
  .object({
    total: completionCountSchema,
    planned: completionCountSchema,
    inProgress: completionCountSchema,
    done: completionCountSchema,
    blocked: completionCountSchema,
    skipped: completionCountSchema,
    completionRatio: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const computedTotal =
      summary.planned + summary.inProgress + summary.done + summary.blocked + summary.skipped;

    if (computedTotal !== summary.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Workflow completion summary counts must add up to total.",
        path: ["total"],
      });
    }
  });
export type TaskWorkflowCompletionSummary = z.infer<typeof taskWorkflowCompletionSummarySchema>;

export const normalizedTaskWorkflowStageStateSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "blocked",
]);
export type NormalizedTaskWorkflowStageState = z.infer<
  typeof normalizedTaskWorkflowStageStateSchema
>;

export const normalizedTaskWorkflowLaneSchema = z.enum(["planned", "discovered", "backlog"]);
export type NormalizedTaskWorkflowLane = z.infer<typeof normalizedTaskWorkflowLaneSchema>;

export const normalizedTaskWorkflowBodySectionKindSchema = z.enum([
  "scope",
  "objective",
  "acceptance-checks",
  "implementation-plan",
  "verification",
  "evidence",
  "trace-links",
  "dependencies",
  "workflow-mirror",
  "explicit-checklist",
]);
export type NormalizedTaskWorkflowBodySectionKind = z.infer<
  typeof normalizedTaskWorkflowBodySectionKindSchema
>;

export const normalizedTaskWorkflowBodySectionRefSchema = z
  .object({
    kind: normalizedTaskWorkflowBodySectionKindSchema,
    heading: z.string().min(1),
  })
  .strict();
export type NormalizedTaskWorkflowBodySectionRef = z.infer<
  typeof normalizedTaskWorkflowBodySectionRefSchema
>;

export const normalizedTaskWorkflowNodeSourceSchema = z.enum([
  "frontmatter",
  "markdown-body",
  "task-type-default",
]);
export type NormalizedTaskWorkflowNodeSource = z.infer<
  typeof normalizedTaskWorkflowNodeSourceSchema
>;

export const normalizedTaskWorkflowAuthoritativeSourceSchema = z.enum([
  "frontmatter",
  "markdown-body",
  "task-type-default",
  "mixed",
]);
export type NormalizedTaskWorkflowAuthoritativeSource = z.infer<
  typeof normalizedTaskWorkflowAuthoritativeSourceSchema
>;

export const normalizedTaskWorkflowMirrorStateSchema = z.enum(["absent", "present"]);
export type NormalizedTaskWorkflowMirrorState = z.infer<
  typeof normalizedTaskWorkflowMirrorStateSchema
>;

export const normalizedTaskWorkflowItemSchema = z
  .object({
    id: taskWorkflowIdSchema,
    label: z.string().min(1),
    status: taskWorkflowItemStatusSchema,
    runtimePreference: taskWorkflowRuntimePreferenceSchema,
    source: normalizedTaskWorkflowNodeSourceSchema,
    notes: z.string().min(1).optional(),
    commandHint: z.string().min(1).optional(),
    evidencePaths: z.array(taskWorkflowEvidencePathSchema),
    bodySection: normalizedTaskWorkflowBodySectionRefSchema.optional(),
  })
  .strict();
export type NormalizedTaskWorkflowItem = z.infer<typeof normalizedTaskWorkflowItemSchema>;

export const normalizedTaskWorkflowStageSchema = z
  .object({
    id: taskWorkflowIdSchema,
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    runtimePreference: taskWorkflowRuntimePreferenceSchema,
    source: normalizedTaskWorkflowNodeSourceSchema,
    bodySection: normalizedTaskWorkflowBodySectionRefSchema.optional(),
    items: z.array(normalizedTaskWorkflowItemSchema).min(1),
    summary: taskWorkflowCompletionSummarySchema,
    state: normalizedTaskWorkflowStageStateSchema,
  })
  .strict();
export type NormalizedTaskWorkflowStage = z.infer<typeof normalizedTaskWorkflowStageSchema>;

export const normalizedTaskWorkflowSummarySchema = z
  .object({
    totalStages: completionCountSchema,
    notStartedStages: completionCountSchema,
    inProgressStages: completionCountSchema,
    completedStages: completionCountSchema,
    blockedStages: completionCountSchema,
    overallState: normalizedTaskWorkflowStageStateSchema,
    items: taskWorkflowCompletionSummarySchema,
  })
  .strict()
  .superRefine((summary, ctx) => {
    const computedTotal =
      summary.notStartedStages +
      summary.inProgressStages +
      summary.completedStages +
      summary.blockedStages;

    if (computedTotal !== summary.totalStages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Normalized workflow stage counts must add up to totalStages.",
        path: ["totalStages"],
      });
    }
  });
export type NormalizedTaskWorkflowSummary = z.infer<typeof normalizedTaskWorkflowSummarySchema>;

export const normalizedTaskWorkflowSchema = z
  .object({
    task: z
      .object({
        id: z.string().regex(/^\d{3}$/),
        slug: z.string().min(1),
        title: z.string().min(1),
        lane: normalizedTaskWorkflowLaneSchema,
        status: z.string().min(1),
        taskType: taskTypeSchema,
      })
      .strict(),
    workflow: z
      .object({
        schemaVersion: taskWorkflowSchemaVersionSchema,
        template: taskWorkflowTemplateSchema,
        sources: z
          .object({
            authoritativeWorkflow: normalizedTaskWorkflowAuthoritativeSourceSchema,
            authoritativeCompletion: normalizedTaskWorkflowAuthoritativeSourceSchema,
            supportingMarkdownMirror: normalizedTaskWorkflowMirrorStateSchema,
            supportingSections: z.array(normalizedTaskWorkflowBodySectionRefSchema),
          })
          .strict(),
        stages: z.array(normalizedTaskWorkflowStageSchema).min(1),
        summary: normalizedTaskWorkflowSummarySchema,
      })
      .strict(),
  })
  .strict();
export type NormalizedTaskWorkflow = z.infer<typeof normalizedTaskWorkflowSchema>;

export function summarizeTaskWorkflowItemStatuses(
  statuses: readonly TaskWorkflowItemStatus[],
): TaskWorkflowCompletionSummary {
  const summary = {
    total: statuses.length,
    planned: 0,
    inProgress: 0,
    done: 0,
    blocked: 0,
    skipped: 0,
    completionRatio: 0,
  };

  for (const status of statuses) {
    switch (status) {
      case "planned":
        summary.planned += 1;
        break;
      case "in_progress":
        summary.inProgress += 1;
        break;
      case "done":
        summary.done += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
    }
  }

  summary.completionRatio =
    summary.total === 0 ? 0 : (summary.done + summary.skipped) / summary.total;
  return summary;
}

export function summarizeTaskWorkflowItems(
  items: readonly Pick<TaskWorkflowItem, "status">[],
): TaskWorkflowCompletionSummary {
  return summarizeTaskWorkflowItemStatuses(items.map((item) => item.status));
}

export function deriveNormalizedTaskWorkflowStageState(
  summary: TaskWorkflowCompletionSummary,
): NormalizedTaskWorkflowStageState {
  if (summary.total === 0) {
    return "not_started";
  }

  if (summary.done + summary.skipped === summary.total) {
    return "completed";
  }

  if (summary.blocked > 0) {
    return "blocked";
  }

  if (summary.inProgress > 0 || summary.done > 0 || summary.skipped > 0) {
    return "in_progress";
  }

  return "not_started";
}

export function summarizeNormalizedTaskWorkflowStages(
  stages: readonly Pick<NormalizedTaskWorkflowStage, "state" | "summary">[],
): NormalizedTaskWorkflowSummary {
  const summary: NormalizedTaskWorkflowSummary = {
    totalStages: stages.length,
    notStartedStages: 0,
    inProgressStages: 0,
    completedStages: 0,
    blockedStages: 0,
    overallState: "not_started",
    items: {
      total: 0,
      planned: 0,
      inProgress: 0,
      done: 0,
      blocked: 0,
      skipped: 0,
      completionRatio: 0,
    },
  };

  for (const stage of stages) {
    switch (stage.state) {
      case "not_started":
        summary.notStartedStages += 1;
        break;
      case "in_progress":
        summary.inProgressStages += 1;
        break;
      case "completed":
        summary.completedStages += 1;
        break;
      case "blocked":
        summary.blockedStages += 1;
        break;
    }

    summary.items.total += stage.summary.total;
    summary.items.planned += stage.summary.planned;
    summary.items.inProgress += stage.summary.inProgress;
    summary.items.done += stage.summary.done;
    summary.items.blocked += stage.summary.blocked;
    summary.items.skipped += stage.summary.skipped;
  }

  summary.items.completionRatio =
    summary.items.total === 0
      ? 0
      : (summary.items.done + summary.items.skipped) / summary.items.total;

  if (summary.totalStages === 0) {
    summary.overallState = "not_started";
  } else if (summary.completedStages === summary.totalStages) {
    summary.overallState = "completed";
  } else if (summary.blockedStages > 0) {
    summary.overallState = "blocked";
  } else if (summary.inProgressStages > 0 || summary.completedStages > 0) {
    summary.overallState = "in_progress";
  } else {
    summary.overallState = "not_started";
  }

  return summary;
}
