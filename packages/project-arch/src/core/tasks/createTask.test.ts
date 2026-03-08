import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createTask } from "./createTask";

describe("createTask - Reliability and Safety", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe("Regression: legacy decision validation", () => {
    it("should succeed when legacy decision exists (skip invalid decisions)", async () => {
      // Create a legacy decision with missing required fields
      const legacyDecisionPath = path.join(
        tempDir,
        "roadmap",
        "decisions",
        "001-legacy-decision.md",
      );

      // Ensure the decisions directory exists
      await fs.ensureDir(path.dirname(legacyDecisionPath));

      // This simulates an old decision format that's missing some required fields
      // Missing: schemaVersion, type, scope, drivers, decision, alternatives, consequences, links
      const legacyContent = `---
id: "001"
title: "Legacy Decision"
status: "accepted"
---

# Legacy Decision

This is an old decision that doesn't conform to current schema.
`;

      await fs.writeFile(legacyDecisionPath, legacyContent);

      // Task creation should now SUCCEED because graph rebuild is resilient
      const taskPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "discovered",
        discoveredFromTask: "001",
        cwd: tempDir,
      });

      // Task file should be created
      expect(await fs.pathExists(taskPath)).toBe(true);
    });

    it("should not leave partial files when task creation succeeds despite invalid decisions", async () => {
      // Create a legacy decision that will be skipped due to invalid schema
      const legacyDecisionPath = path.join(tempDir, "roadmap", "decisions", "001-bad-decision.md");

      await fs.ensureDir(path.dirname(legacyDecisionPath));

      const badContent = `---
id: "001"
title: "Bad Decision"
---

Missing required fields.
`;

      await fs.writeFile(legacyDecisionPath, badContent);

      const tasksDir = path.join(
        tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
      );

      // Count files before attempt
      const filesBefore = (await fs.pathExists(tasksDir)) ? await fs.readdir(tasksDir) : [];

      // Create a task - should succeed now
      const taskPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Task should be created
      expect(await fs.pathExists(taskPath)).toBe(true);

      // Count files after attempt
      const filesAfter = await fs.readdir(tasksDir);

      // Should have exactly one more file than before
      expect(filesAfter.length).toBe(filesBefore.length + 1);
    });
  });

  describe("Error reporting", () => {
    it("should log warning with file path when decision parsing fails", async () => {
      const badDecisionPath = path.join(tempDir, "roadmap", "decisions", "002-malformed.md");

      await fs.ensureDir(path.dirname(badDecisionPath));

      await fs.writeFile(
        badDecisionPath,
        `---
id: "002"
---

Missing required title field.
`,
      );

      // Capture console.warn output
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };

      try {
        // Task creation should succeed but log warning
        const taskPath = await createTask({
          phaseId: "phase-1",
          milestoneId: "milestone-1-setup",
          lane: "planned",
          discoveredFromTask: null,
          cwd: tempDir,
        });
        expect(await fs.pathExists(taskPath)).toBe(true);

        // Warning should include the problematic file path
        const warningText = warnings.join("\n");
        expect(warningText).toContain("002-malformed.md");
        expect(warningText).toContain("Skipping decision with invalid schema");
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe("Transactional behavior", () => {
    it("should successfully create task when no legacy decisions exist", async () => {
      const taskPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      expect(await fs.pathExists(taskPath)).toBe(true);
      const content = await fs.readFile(taskPath, "utf8");
      expect(content).toContain("id:");
      expect(content).toContain("lane: planned");
    });

    it("should successfully create discovered task with --from", async () => {
      // First create a planned task
      await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Then create a discovered task from it
      const discoveredPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "discovered",
        discoveredFromTask: "001",
        cwd: tempDir,
      });

      expect(await fs.pathExists(discoveredPath)).toBe(true);
      const content = await fs.readFile(discoveredPath, "utf8");
      expect(content).toContain("discoveredFromTask:");
      expect(content).toContain("001");
      expect(content).toContain("lane: discovered");
    });
  });
});
