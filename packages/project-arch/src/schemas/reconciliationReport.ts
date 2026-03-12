import { z } from "zod";

export const reconciliationStatusSchema = z.enum([
  "no reconciliation needed",
  "reconciliation suggested",
  "reconciliation required",
  "reconciliation complete",
]);
export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;

export const reconciliationTypeSchema = z.enum(["local-reconciliation", "tooling-feedback"]);
export type ReconciliationType = z.infer<typeof reconciliationTypeSchema>;

export const reconciliationReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  type: reconciliationTypeSchema,
  status: reconciliationStatusSchema,
  taskId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  author: z.string().optional(),
  summary: z.string().optional(),
  changedFiles: z.array(z.string()),
  affectedAreas: z.array(z.string()),
  missingUpdates: z.array(z.string()),
  missingTraceLinks: z.array(z.string()),
  decisionCandidates: z.array(z.string()),
  standardsGaps: z.array(z.string()),
  proposedActions: z.array(z.string()),
  feedbackCandidates: z.array(z.string()),
  notes: z.string().optional(),
});

export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;
