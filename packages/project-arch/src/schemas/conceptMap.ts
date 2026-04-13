import { z } from "zod";

export const conceptImplementationSurfaceSchema = z.object({
  type: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
});

export const conceptEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  owningDomain: z.string().min(1),
  moduleResponsibilities: z.array(z.string().min(1)),
  implementationSurfaces: z.array(conceptImplementationSurfaceSchema),
  dependencies: z.array(z.string().min(1)),
});

export const domainModuleMappingEntrySchema = z.object({
  domain: z.string().min(1),
  module: z.string().min(1),
  responsibility: z.string().min(1),
});

export const implementationChecklistEntrySchema = z.object({
  conceptId: z.string().min(1),
  checks: z.array(z.string().min(1)),
});

export const conceptMapSchema = z.object({
  schemaVersion: z.literal("2.0"),
  concepts: z.array(conceptEntrySchema),
  domainModuleMapping: z.array(domainModuleMappingEntrySchema),
  implementationChecklist: z.array(implementationChecklistEntrySchema),
});

export type ConceptMap = z.infer<typeof conceptMapSchema>;
