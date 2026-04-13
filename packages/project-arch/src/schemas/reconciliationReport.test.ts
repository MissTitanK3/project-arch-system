import { describe, it, expect } from "vitest";
import {
  reconciliationReportSchema,
  reconciliationStatusSchema,
  reconciliationTypeSchema,
  type ReconciliationReport,
} from "./reconciliationReport";

describe("schemas/reconciliationReport", () => {
  describe("reconciliationStatusSchema", () => {
    it("should accept all four valid status values", () => {
      expect(reconciliationStatusSchema.parse("no reconciliation needed")).toBe(
        "no reconciliation needed",
      );
      expect(reconciliationStatusSchema.parse("reconciliation suggested")).toBe(
        "reconciliation suggested",
      );
      expect(reconciliationStatusSchema.parse("reconciliation required")).toBe(
        "reconciliation required",
      );
      expect(reconciliationStatusSchema.parse("reconciliation complete")).toBe(
        "reconciliation complete",
      );
    });

    it("should reject invalid status values", () => {
      expect(() => reconciliationStatusSchema.parse("complete")).toThrow();
      expect(() => reconciliationStatusSchema.parse("done")).toThrow();
      expect(() => reconciliationStatusSchema.parse("")).toThrow();
      expect(() => reconciliationStatusSchema.parse(null)).toThrow();
    });
  });

  describe("reconciliationTypeSchema", () => {
    it("should accept valid type values", () => {
      expect(reconciliationTypeSchema.parse("local-reconciliation")).toBe("local-reconciliation");
      expect(reconciliationTypeSchema.parse("tooling-feedback")).toBe("tooling-feedback");
    });

    it("should reject invalid type values", () => {
      expect(() => reconciliationTypeSchema.parse("local")).toThrow();
      expect(() => reconciliationTypeSchema.parse("feedback")).toThrow();
      expect(() => reconciliationTypeSchema.parse("")).toThrow();
      expect(() => reconciliationTypeSchema.parse(123)).toThrow();
    });
  });

  describe("reconciliationReportSchema", () => {
    const validLocalReport: ReconciliationReport = {
      schemaVersion: "2.0",
      id: "reconcile-001",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "008",
      runId: "run-2026-03-31-001",
      date: "2026-03-12",
      changedFiles: ["architecture/workflows/implementation-reconciliation.md"],
      affectedAreas: ["architecture/workflows"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: ["Update arch-model/modules.json to reflect new workflow module"],
      feedbackCandidates: [],
    };

    it("should accept a valid local-reconciliation report with all required fields", () => {
      const result = reconciliationReportSchema.parse(validLocalReport);
      expect(result).toEqual(validLocalReport);
    });

    it("should allow runId to be omitted for non-agent reconciliation flows", () => {
      const withoutRunId = {
        ...validLocalReport,
      };
      delete (withoutRunId as { runId?: string }).runId;

      const result = reconciliationReportSchema.parse(withoutRunId);
      expect(result.runId).toBeUndefined();
    });

    it("should accept a valid local-reconciliation report with all optional fields", () => {
      const full: ReconciliationReport = {
        ...validLocalReport,
        author: "agent",
        summary: "Implemented reconciliation workflow doc and registered schema.",
        notes: "No blocking drift detected.",
      };
      const result = reconciliationReportSchema.parse(full);
      expect(result.author).toBe("agent");
      expect(result.summary).toBe("Implemented reconciliation workflow doc and registered schema.");
      expect(result.notes).toBe("No blocking drift detected.");
    });

    it("should accept a valid tooling-feedback report", () => {
      const feedbackReport: ReconciliationReport = {
        schemaVersion: "2.0",
        id: "feedback-001",
        type: "tooling-feedback",
        status: "reconciliation suggested",
        taskId: "005",
        date: "2026-03-12",
        changedFiles: ["packages/project-arch/src/core/triggers.ts"],
        affectedAreas: ["project-arch/cli", "project-arch/schemas"],
        missingUpdates: ["CLI does not expose reconciliation trigger detection"],
        missingTraceLinks: [],
        decisionCandidates: ["Adopt trigger-based reconciliation enforcement in pa CLI"],
        standardsGaps: ["No standard for reconciliation trigger declaration"],
        proposedActions: ["Open project-arch issue: add reconciliation trigger config"],
        feedbackCandidates: ["pa reconcile --trigger-check flag is not yet available"],
        notes: "Recurring gap across two milestones.",
      };
      const result = reconciliationReportSchema.parse(feedbackReport);
      expect(result.type).toBe("tooling-feedback");
      expect(result.feedbackCandidates).toHaveLength(1);
    });

    it("should reject an unknown type value", () => {
      const invalid = { ...validLocalReport, type: "unknown-type" };
      expect(() => reconciliationReportSchema.parse(invalid)).toThrow();
    });

    it("should reject an unknown status value", () => {
      const invalid = { ...validLocalReport, status: "completed" };
      expect(() => reconciliationReportSchema.parse(invalid)).toThrow();
    });

    it("should reject a report missing required fields", () => {
      const withoutTaskId = Object.fromEntries(
        Object.entries(validLocalReport).filter(([key]) => key !== "taskId"),
      );
      expect(() => reconciliationReportSchema.parse(withoutTaskId)).toThrow();
    });

    it("should reject a report with an invalid date format", () => {
      const invalid = { ...validLocalReport, date: "12-03-2026" };
      expect(() => reconciliationReportSchema.parse(invalid)).toThrow();
    });

    it("should reject a report with wrong schemaVersion", () => {
      const invalid = { ...validLocalReport, schemaVersion: "9.9" };
      expect(() => reconciliationReportSchema.parse(invalid)).toThrow();
    });

    it("should accept a report where all array fields are empty", () => {
      const minimal: ReconciliationReport = {
        schemaVersion: "2.0",
        id: "reconcile-002",
        type: "local-reconciliation",
        status: "no reconciliation needed",
        taskId: "001",
        date: "2026-03-12",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      };
      const result = reconciliationReportSchema.parse(minimal);
      expect(result.status).toBe("no reconciliation needed");
    });
  });
});
