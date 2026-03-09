import { describe, it, expect } from "vitest";
import { taskSchema, laneSchema, taskStatusSchema, type TaskFrontmatter } from "./task";

describe("schemas/task", () => {
  describe("laneSchema", () => {
    it("should accept valid lane values", () => {
      expect(laneSchema.parse("planned")).toBe("planned");
      expect(laneSchema.parse("discovered")).toBe("discovered");
      expect(laneSchema.parse("backlog")).toBe("backlog");
    });

    it("should reject invalid lane values", () => {
      expect(() => laneSchema.parse("invalid")).toThrow();
      expect(() => laneSchema.parse("")).toThrow();
      expect(() => laneSchema.parse(123)).toThrow();
    });
  });

  describe("taskStatusSchema", () => {
    it("should accept valid status values", () => {
      expect(taskStatusSchema.parse("todo")).toBe("todo");
      expect(taskStatusSchema.parse("in_progress")).toBe("in_progress");
      expect(taskStatusSchema.parse("done")).toBe("done");
      expect(taskStatusSchema.parse("blocked")).toBe("blocked");
    });

    it("should reject invalid status values", () => {
      expect(() => taskStatusSchema.parse("pending")).toThrow();
      expect(() => taskStatusSchema.parse("completed")).toThrow();
      expect(() => taskStatusSchema.parse("")).toThrow();
    });
  });

  describe("taskSchema", () => {
    const validTask: TaskFrontmatter = {
      schemaVersion: "1.0",
      id: "042",
      slug: "implement-feature-x",
      title: "Implement Feature X",
      lane: "planned",
      status: "todo",
      createdAt: "2026-03-07",
      updatedAt: "2026-03-07",
      discoveredFromTask: null,
      tags: ["feature", "priority-high"],
      codeTargets: ["src/features/x.ts"],
      publicDocs: ["docs/features/x.md"],
      decisions: ["project:20260307:decision"],
      completionCriteria: ["Feature X is implemented", "Tests pass"],
    };

    it("should accept valid task with all required fields", () => {
      const result = taskSchema.parse(validTask);
      expect(result).toEqual(validTask);
    });

    it("should accept valid task with optional fields", () => {
      const taskWithOptional: TaskFrontmatter = {
        ...validTask,
        scope: "phase-1",
        acceptanceChecks: ["Manual testing completed"],
        evidence: ["evidence/screenshot.png"],
        traceLinks: ["JIRA-123"],
        dependsOn: ["041"],
        blocks: ["043"],
      };

      const result = taskSchema.parse(taskWithOptional);
      expect(result).toEqual(taskWithOptional);
    });

    it("should accept discoveredFromTask as string or null", () => {
      const withString = { ...validTask, discoveredFromTask: "041" };
      const withNull = { ...validTask, discoveredFromTask: null };

      expect(taskSchema.parse(withString).discoveredFromTask).toBe("041");
      expect(taskSchema.parse(withNull).discoveredFromTask).toBeNull();
    });

    it("should reject task with invalid schemaVersion", () => {
      const invalid = { ...validTask, schemaVersion: "2.0" };
      expect(() => taskSchema.parse(invalid)).toThrow();
    });

    it("should reject task with invalid ID format", () => {
      // ID must be exactly 3 digits
      expect(() => taskSchema.parse({ ...validTask, id: "1" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, id: "1234" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, id: "abc" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, id: "" })).toThrow();
    });

    it("should reject task with empty required strings", () => {
      expect(() => taskSchema.parse({ ...validTask, slug: "" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, title: "" })).toThrow();
    });

    it("should reject task with invalid lane", () => {
      expect(() => taskSchema.parse({ ...validTask, lane: "unknown" })).toThrow();
    });

    it("should reject task with invalid status", () => {
      expect(() => taskSchema.parse({ ...validTask, status: "pending" })).toThrow();
    });

    it("should reject task with invalid date format", () => {
      // Must be YYYY-MM-DD format
      expect(() => taskSchema.parse({ ...validTask, createdAt: "2026/03/07" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, createdAt: "07-03-2026" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, createdAt: "2026-3-7" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, updatedAt: "invalid" })).toThrow();
    });

    it("should reject task with invalid discoveredFromTask format", () => {
      // Must be 3 digits or null
      expect(() => taskSchema.parse({ ...validTask, discoveredFromTask: "1" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, discoveredFromTask: "1234" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, discoveredFromTask: "abc" })).toThrow();
    });

    it("should reject task with non-array fields", () => {
      expect(() => taskSchema.parse({ ...validTask, tags: "tag1" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, codeTargets: "target1" })).toThrow();
      expect(() => taskSchema.parse({ ...validTask, decisions: {} })).toThrow();
    });

    it("should reject task with missing required fields", () => {
      const missingId = Object.fromEntries(
        Object.entries(validTask).filter(([key]) => key !== "id"),
      );
      expect(() => taskSchema.parse(missingId)).toThrow();

      const missingTitle = Object.fromEntries(
        Object.entries(validTask).filter(([key]) => key !== "title"),
      );
      expect(() => taskSchema.parse(missingTitle)).toThrow();

      const missingCreatedAt = Object.fromEntries(
        Object.entries(validTask).filter(([key]) => key !== "createdAt"),
      );
      expect(() => taskSchema.parse(missingCreatedAt)).toThrow();
    });

    it("should accept task with empty arrays for optional array fields", () => {
      const minimalTask = {
        ...validTask,
        tags: [],
        codeTargets: [],
        publicDocs: [],
        decisions: [],
        completionCriteria: [],
      };

      const result = taskSchema.parse(minimalTask);
      expect(result.tags).toEqual([]);
      expect(result.codeTargets).toEqual([]);
    });

    it("should handle all lane types", () => {
      const planned = { ...validTask, lane: "planned" as const };
      const discovered = { ...validTask, lane: "discovered" as const, discoveredFromTask: "041" };
      const backlog = { ...validTask, lane: "backlog" as const };

      expect(taskSchema.parse(planned).lane).toBe("planned");
      expect(taskSchema.parse(discovered).lane).toBe("discovered");
      expect(taskSchema.parse(backlog).lane).toBe("backlog");
    });

    it("should handle all status types", () => {
      expect(taskSchema.parse({ ...validTask, status: "todo" }).status).toBe("todo");
      expect(taskSchema.parse({ ...validTask, status: "in_progress" }).status).toBe("in_progress");
      expect(taskSchema.parse({ ...validTask, status: "done" }).status).toBe("done");
      expect(taskSchema.parse({ ...validTask, status: "blocked" }).status).toBe("blocked");
    });

    describe("legacy status format migration", () => {
      it("should normalize legacy hyphenated status to canonical format", () => {
        const legacyTask = { ...validTask, status: "in-progress" };
        const parsed = taskSchema.parse(legacyTask);
        expect(parsed.status).toBe("in_progress");
      });

      it("should accept mixed case legacy formats", () => {
        const legacyTask = { ...validTask, status: "In-Progress" };
        const parsed = taskSchema.parse(legacyTask);
        expect(parsed.status).toBe("in_progress");
      });

      it("should preserve canonical format without modification", () => {
        // Ensures backward compatibility with existing tasks
        const canonicalTask = { ...validTask, status: "in_progress" };
        const parsed = taskSchema.parse(canonicalTask);
        expect(parsed.status).toBe("in_progress");
      });

      it("should still reject truly invalid legacy statuses", () => {
        expect(() => taskSchema.parse({ ...validTask, status: "pending" })).toThrow();
        expect(() => taskSchema.parse({ ...validTask, status: "wip" })).toThrow();
        expect(() => taskSchema.parse({ ...validTask, status: "completed" })).toThrow();
      });
    });
  });
});
