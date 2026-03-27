import { z } from "zod";

export const DEFAULT_PHASE_PROJECT_ID = "shared" as const;

export const phaseManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  phases: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1).optional().default(DEFAULT_PHASE_PROJECT_ID),
      createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
  activeProject: z.string().nullable().optional().default(null),
  activePhase: z.string().nullable(),
  activeMilestone: z.string().nullable().optional().default(null),
});

export type PhaseManifest = z.infer<typeof phaseManifestSchema>;
