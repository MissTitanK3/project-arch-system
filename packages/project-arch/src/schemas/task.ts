import { z } from "zod";
import { taskStatusSchema, type TaskStatus } from "./statusNormalization";

export const laneSchema = z.enum(["planned", "discovered", "backlog"]);
export type TaskLane = z.infer<typeof laneSchema>;

// Re-export status schema and type from normalization module
export { taskStatusSchema, type TaskStatus };

export const taskSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().regex(/^\d{3}$/),
  slug: z.string().min(1),
  title: z.string().min(1),
  lane: laneSchema,
  status: taskStatusSchema,
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discoveredFromTask: z.union([z.string().regex(/^\d{3}$/), z.null()]),
  tags: z.array(z.string()),
  codeTargets: z.array(z.string()),
  publicDocs: z.array(z.string()),
  decisions: z.array(z.string()),
  completionCriteria: z.array(z.string()),
  scope: z.string().optional(),
  acceptanceChecks: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
  traceLinks: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
});

export type TaskFrontmatter = z.infer<typeof taskSchema>;
