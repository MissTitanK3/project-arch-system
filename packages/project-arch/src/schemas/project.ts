import { z } from "zod";

export const projectTypeSchema = z.enum(["application", "service", "package", "client", "shared"]);

export const projectManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  title: z.string().min(1),
  type: projectTypeSchema,
  summary: z.string().min(1),
  ownedPaths: z.array(z.string().min(1)).min(1),
  sharedDependencies: z.array(z.string().min(1)).optional().default([]),
  defaultPhase: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional().default([]),
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
