import { z } from "zod";

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
  }),
  z.object({
    kind: z.literal("phase"),
    phaseId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("milestone"),
    phaseId: z.string().min(1),
    milestoneId: z.string().min(1),
  }),
]);

export const decisionStatusSchema = z.enum(["proposed", "accepted", "rejected", "superseded"]);

export const decisionSchema = z.object({
  schemaVersion: z.literal("1.0"),
  type: z.literal("decision"),
  id: z.string().min(1),
  title: z.string().min(1),
  status: decisionStatusSchema,
  scope: scopeSchema,
  drivers: z.array(z.string()),
  decision: z.object({
    summary: z.string(),
  }),
  alternatives: z.array(z.string()),
  consequences: z.object({
    positive: z.array(z.string()),
    negative: z.array(z.string()),
  }),
  links: z.object({
    tasks: z.array(z.string()),
    codeTargets: z.array(z.string()),
    publicDocs: z.array(z.string()),
  }),
  supersedes: z.array(z.string()).optional(),
});

export type DecisionFrontmatter = z.infer<typeof decisionSchema>;
