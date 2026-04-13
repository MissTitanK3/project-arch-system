import { z } from "zod";
import { taskStatusSchema, type TaskStatus } from "./statusNormalization";
import { taskTypeSchema, taskWorkflowMetadataSchema } from "./taskWorkflow";

export const laneSchema = z.enum(["planned", "discovered", "backlog"]);
export type TaskLane = z.infer<typeof laneSchema>;

export const taskAgentExecutionSchema = z
  .object({
    executable: z.boolean(),
  })
  .strict();
export type TaskAgentExecution = z.infer<typeof taskAgentExecutionSchema>;

// Re-export status schema and type from normalization module
export { taskStatusSchema, type TaskStatus };

export const taskSchema = z.object({
  schemaVersion: z.literal("2.0"),
  id: z.string().regex(/^\d{3}$/),
  slug: z.string().min(1),
  title: z.string().min(1),
  lane: laneSchema,
  status: taskStatusSchema,
  taskType: taskTypeSchema.optional(),
  workflow: taskWorkflowMetadataSchema.optional(),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discoveredFromTask: z.union([z.string().regex(/^\d{3}$/), z.null()]),
  tags: z.array(z.string()),
  codeTargets: z.array(z.string()),
  publicDocs: z.array(z.string()),
  decisions: z.array(z.string()),
  completionCriteria: z.array(z.string()),
  agent: taskAgentExecutionSchema.optional(),
  scope: z.string().optional(),
  acceptanceChecks: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
  traceLinks: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
});

export type TaskFrontmatter = z.infer<typeof taskSchema>;
