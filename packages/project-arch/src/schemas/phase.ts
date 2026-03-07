import { z } from "zod";

export const phaseManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  phases: z.array(
    z.object({
      id: z.string().min(1),
      createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
  activePhase: z.string().nullable(),
});

export type PhaseManifest = z.infer<typeof phaseManifestSchema>;
