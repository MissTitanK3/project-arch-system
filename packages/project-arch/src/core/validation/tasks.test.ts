import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { collectTaskRecords } from "./tasks";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createTask } from "../tasks/createTask";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { writeFile } from "../../fs";

describe("core/validation/tasks", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("collectTaskRecords", () => {
    it("should collect all task records from initialized project", async () => {
      const records = await collectTaskRecords(tempDir);

      // Initialized project has seeded tasks
      expect(records.length).toBeGreaterThan(0);

      // Each record should have required fields
      for (const record of records) {
        expect(record.phaseId).toBeDefined();
        expect(record.milestoneId).toBeDefined();
        expect(record.lane).toMatch(/^(planned|discovered|backlog)$/);
        expect(record.filePath).toBeDefined();
        expect(record.frontmatter).toBeDefined();
        expect(record.frontmatter.id).toBeDefined();
        expect(record.frontmatter.lane).toBe(record.lane);
      }
    });

    it("should include newly created tasks in collection", async () => {
      await createPhase("test-phase", tempDir);
      await createMilestone("test-phase", "test-milestone", tempDir);

      await createTask({
        phaseId: "test-phase",
        milestoneId: "test-milestone",
        lane: "planned",
        title: "Test Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const records = await collectTaskRecords(tempDir);
      const testTask = records.find(
        (r) => r.phaseId === "test-phase" && r.milestoneId === "test-milestone",
      );

      expect(testTask).toBeDefined();
      expect(testTask?.frontmatter.title).toBe("Test Task");
      expect(testTask?.lane).toBe("planned");
    }, 10_000);

    it("should throw on task ID out of lane range", async () => {
      await createPhase("invalid-phase", tempDir);
      await createMilestone("invalid-phase", "invalid-milestone", tempDir);

      // Create a task with ID out of planned lane range (001-099)
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/invalid-phase/milestones/invalid-milestone/tasks/planned",
      );
      const invalidTaskPath = path.join(taskDir, "500-invalid-task.md");

      await writeFile(
        invalidTaskPath,
        `---
schemaVersion: "1.0"
id: "500"
slug: invalid-task
lane: planned
title: Invalid Task
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Invalid Task

This task has an ID out of range for the planned lane.
`,
      );

      await expect(collectTaskRecords(tempDir)).rejects.toThrow(/out of range for lane/);
    }, 10_000);

    it("should throw on task filename not matching ID prefix", async () => {
      await createPhase("mismatch-phase", tempDir);
      await createMilestone("mismatch-phase", "mismatch-milestone", tempDir);

      // Create a task with filename that doesn't start with ID prefix
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/mismatch-phase/milestones/mismatch-milestone/tasks/planned",
      );
      const mismatchTaskPath = path.join(taskDir, "wrong-prefix.md");

      await writeFile(
        mismatchTaskPath,
        `---
schemaVersion: "1.0"
id: "042"
slug: wrong-prefix
lane: planned
title: Mismatched Task
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Mismatched Task

This task filename doesn't match the ID prefix.
`,
      );

      await expect(collectTaskRecords(tempDir)).rejects.toThrow(/must start with '042-'/);
    }, 10_000);

    it("should throw on lane mismatch between frontmatter and directory", async () => {
      await createPhase("lane-mismatch-phase", tempDir);
      await createMilestone("lane-mismatch-phase", "lane-mismatch-milestone", tempDir);

      // Create a task in planned directory but with discovered lane in frontmatter
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/lane-mismatch-phase/milestones/lane-mismatch-milestone/tasks/planned",
      );
      const mismatchTaskPath = path.join(taskDir, "043-lane-mismatch.md");

      await writeFile(
        mismatchTaskPath,
        `---
schemaVersion: "1.0"
id: "043"
slug: lane-mismatch
lane: discovered
title: Lane Mismatch Task
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Lane Mismatch Task

This task has a lane mismatch.
`,
      );

      await expect(collectTaskRecords(tempDir)).rejects.toThrow(/lane mismatch/);
    }, 10_000);

    it("should sort tasks consistently across multiple collections", async () => {
      const records1 = await collectTaskRecords(tempDir);
      const records2 = await collectTaskRecords(tempDir);

      expect(records1.length).toBe(records2.length);
      for (let i = 0; i < records1.length; i++) {
        expect(records1[i].filePath).toBe(records2[i].filePath);
      }
    });
  });
});
