import { z } from "zod";

export const milestoneManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  phaseId: z.string().min(1),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type MilestoneManifest = z.infer<typeof milestoneManifestSchema>;
