import { describe, it, expect } from "vitest";
import {
  normalizeTaskStatus,
  taskStatusSchema,
  validateTaskStatus,
  isValidTaskStatus,
  formatTaskStatusForDisplay,
  parseTaskStatusInput,
  CANONICAL_TASK_STATUSES,
} from "./statusNormalization";

describe("statusNormalization", () => {
  describe("normalizeTaskStatus", () => {
    it("should normalize canonical underscored formats", () => {
      expect(normalizeTaskStatus("todo")).toBe("todo");
      expect(normalizeTaskStatus("in_progress")).toBe("in_progress");
      expect(normalizeTaskStatus("done")).toBe("done");
      expect(normalizeTaskStatus("blocked")).toBe("blocked");
    });

    it("should normalize legacy hyphenated format", () => {
      expect(normalizeTaskStatus("in-progress")).toBe("in_progress");
    });

    it("should handle case variations", () => {
      expect(normalizeTaskStatus("TODO")).toBe("todo");
      expect(normalizeTaskStatus("In-Progress")).toBe("in_progress");
      expect(normalizeTaskStatus("DONE")).toBe("done");
      expect(normalizeTaskStatus("BLOCKED")).toBe("blocked");
    });

    it("should handle whitespace", () => {
      expect(normalizeTaskStatus("  todo  ")).toBe("todo");
      expect(normalizeTaskStatus(" in-progress ")).toBe("in_progress");
    });

    it("should return null for invalid statuses", () => {
      expect(normalizeTaskStatus("pending")).toBeNull();
      expect(normalizeTaskStatus("completed")).toBeNull();
      expect(normalizeTaskStatus("invalid")).toBeNull();
      expect(normalizeTaskStatus("")).toBeNull();
    });
  });

  describe("taskStatusSchema", () => {
    it("should accept canonical statuses", () => {
      expect(taskStatusSchema.parse("todo")).toBe("todo");
      expect(taskStatusSchema.parse("in_progress")).toBe("in_progress");
      expect(taskStatusSchema.parse("done")).toBe("done");
      expect(taskStatusSchema.parse("blocked")).toBe("blocked");
    });

    it("should normalize and accept legacy formats", () => {
      expect(taskStatusSchema.parse("in-progress")).toBe("in_progress");
    });

    it("should reject invalid statuses", () => {
      expect(() => taskStatusSchema.parse("pending")).toThrow();
      expect(() => taskStatusSchema.parse("completed")).toThrow();
      expect(() => taskStatusSchema.parse("invalid")).toThrow();
    });

    it("should reject non-string values", () => {
      expect(() => taskStatusSchema.parse(123)).toThrow();
      expect(() => taskStatusSchema.parse(null)).toThrow();
      expect(() => taskStatusSchema.parse(undefined)).toThrow();
    });
  });

  describe("validateTaskStatus", () => {
    it("should validate and return canonical format", () => {
      expect(validateTaskStatus("todo")).toBe("todo");
      expect(validateTaskStatus("in-progress")).toBe("in_progress");
      expect(validateTaskStatus("done")).toBe("done");
    });

    it("should throw for invalid statuses", () => {
      expect(() => validateTaskStatus("invalid")).toThrow();
      expect(() => validateTaskStatus("pending")).toThrow();
    });
  });

  describe("isValidTaskStatus", () => {
    it("should return true for canonical statuses", () => {
      expect(isValidTaskStatus("todo")).toBe(true);
      expect(isValidTaskStatus("in_progress")).toBe(true);
      expect(isValidTaskStatus("done")).toBe(true);
      expect(isValidTaskStatus("blocked")).toBe(true);
    });

    it("should return true for legacy formats", () => {
      expect(isValidTaskStatus("in-progress")).toBe(true);
    });

    it("should return false for invalid statuses", () => {
      expect(isValidTaskStatus("pending")).toBe(false);
      expect(isValidTaskStatus("completed")).toBe(false);
      expect(isValidTaskStatus("invalid")).toBe(false);
    });
  });

  describe("formatTaskStatusForDisplay", () => {
    it("should format in_progress with hyphen for readability", () => {
      expect(formatTaskStatusForDisplay("in_progress")).toBe("in-progress");
    });

    it("should leave other statuses unchanged", () => {
      expect(formatTaskStatusForDisplay("todo")).toBe("todo");
      expect(formatTaskStatusForDisplay("done")).toBe("done");
      expect(formatTaskStatusForDisplay("blocked")).toBe("blocked");
    });
  });

  describe("parseTaskStatusInput", () => {
    it("should parse canonical statuses", () => {
      expect(parseTaskStatusInput("todo")).toBe("todo");
      expect(parseTaskStatusInput("in_progress")).toBe("in_progress");
      expect(parseTaskStatusInput("done")).toBe("done");
      expect(parseTaskStatusInput("blocked")).toBe("blocked");
    });

    it("should parse legacy formats", () => {
      expect(parseTaskStatusInput("in-progress")).toBe("in_progress");
    });

    it("should throw with helpful message for invalid input", () => {
      expect(() => parseTaskStatusInput("invalid")).toThrow(/Invalid status/);
      expect(() => parseTaskStatusInput("invalid")).toThrow(/todo/);
    });
  });

  describe("CANONICAL_TASK_STATUSES", () => {
    it("should define exactly 4 statuses", () => {
      expect(CANONICAL_TASK_STATUSES).toHaveLength(4);
    });

    it("should include all expected statuses", () => {
      expect(CANONICAL_TASK_STATUSES).toContain("todo");
      expect(CANONICAL_TASK_STATUSES).toContain("in_progress");
      expect(CANONICAL_TASK_STATUSES).toContain("done");
      expect(CANONICAL_TASK_STATUSES).toContain("blocked");
    });
  });

  describe("integration: full migration scenario", () => {
    it("should migrate legacy task frontmatter through schema validation", () => {
      const legacyFrontmatter = {
        schemaVersion: "2.0",
        id: "001",
        slug: "example",
        title: "Example Task",
        lane: "planned",
        status: "in-progress", // Legacy hyphenated format
        createdAt: "2026-03-08",
        updatedAt: "2026-03-08",
        discoveredFromTask: null,
        tags: [],
        codeTargets: [],
        publicDocs: [],
        decisions: [],
        completionCriteria: [],
      };

      // Schema should normalize the status
      const parsedStatus = taskStatusSchema.parse(legacyFrontmatter.status);
      expect(parsedStatus).toBe("in_progress");
    });

    it("should reject truly invalid legacy statuses", () => {
      expect(() => taskStatusSchema.parse("pending")).toThrow();
      expect(() => taskStatusSchema.parse("wip")).toThrow();
      expect(() => taskStatusSchema.parse("complete")).toThrow();
    });
  });

  describe("backwards compatibility", () => {
    it("should maintain existing canonical behavior", () => {
      // Ensures that all existing code using canonical format continues to work
      const statuses: Array<"todo" | "in_progress" | "done" | "blocked"> = [
        "todo",
        "in_progress",
        "done",
        "blocked",
      ];

      for (const status of statuses) {
        expect(taskStatusSchema.parse(status)).toBe(status);
      }
    });
  });
});
