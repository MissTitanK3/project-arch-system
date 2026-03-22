import { z } from "zod";

const kebabCaseIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Skill id must be kebab-case (e.g., repo-map)");

const semverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/,
    "Version must be valid semver (e.g., 1.0.0)",
  );

const nonEmptyStringArraySchema = z.array(z.string().min(1)).min(1);

const filesSchema = z.object({
  system: z.string().min(1),
  checklist: z.string().min(1),
});

export const agentSkillSourceSchema = z.enum(["builtin", "user"]);

export const agentSkillSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: kebabCaseIdSchema,
  name: z.string().min(1),
  source: agentSkillSourceSchema,
  version: semverSchema,
  summary: z.string().min(1),
  whenToUse: nonEmptyStringArraySchema,
  expectedOutputs: nonEmptyStringArraySchema,
  files: filesSchema,
  tags: z.array(z.string().min(1)).optional(),
  overrides: z.boolean().optional().default(false),
});

export const agentSkillRegistryEntrySchema = z.object({
  id: kebabCaseIdSchema,
  source: agentSkillSourceSchema,
  name: z.string().min(1),
  version: semverSchema,
  summary: z.string().min(1),
  directory: z.string().min(1),
  files: filesSchema,
  tags: z.array(z.string().min(1)).optional().default([]),
  overrides: z.boolean().optional().default(false),
});

export type AgentSkill = z.infer<typeof agentSkillSchema>;
export type AgentSkillSource = z.infer<typeof agentSkillSourceSchema>;
export type AgentSkillRegistryEntry = z.infer<typeof agentSkillRegistryEntrySchema>;
