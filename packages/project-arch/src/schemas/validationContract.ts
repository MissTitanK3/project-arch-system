import { z } from "zod";

export const validationContractCheckSchema = z.object({
  id: z.string().min(1),
  objectiveRef: z.string().min(1),
  verifyCommand: z.string().min(1),
  expectedSignal: z.string().min(1),
  owner: z.string().min(1),
  description: z.string().optional(),
});

export type ValidationContractCheck = z.infer<typeof validationContractCheckSchema>;

export const validationContractSchema = z.object({
  schemaVersion: z.literal("2.0"),
  phaseId: z.string().min(1),
  checks: z.array(validationContractCheckSchema),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ValidationContract = z.infer<typeof validationContractSchema>;
