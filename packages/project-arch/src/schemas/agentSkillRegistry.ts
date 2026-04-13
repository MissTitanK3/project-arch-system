import { z } from "zod";
import { agentSkillRegistryEntrySchema } from "./agentSkill";

const generatedAtSchema = z.string().datetime({ offset: true });

export const agentSkillRegistrySchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    generatedAt: generatedAtSchema,
    skills: z.array(agentSkillRegistryEntrySchema),
  })
  .superRefine((value, ctx) => {
    const ids = value.skills.map((skill) => skill.id);

    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate skill id in registry: ${id}`,
        });
      }
      seen.add(id);
    }

    const sorted = [...ids].sort((left, right) => left.localeCompare(right));
    const isSorted = ids.every((id, index) => id === sorted[index]);

    if (!isSorted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Registry skills must be sorted by id in ascending order.",
      });
    }
  });

export type AgentSkillRegistry = z.infer<typeof agentSkillRegistrySchema>;
