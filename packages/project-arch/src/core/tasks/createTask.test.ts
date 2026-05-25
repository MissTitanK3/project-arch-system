import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createTask } from "./createTask";
import * as graphManifests from "../../graph/manifests";

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
        "projects",
        "shared",
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
      expect(taskPath).toContain(
        path.join(
          "roadmap",
          "projects",
          "shared",
          "phases",
          "phase-1",
          "milestones",
          "milestone-1-setup",
          "tasks",
          "planned",
        ),
      );

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

    it("should not write a legacy mirror by default", async () => {
      const taskPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const legacyTaskPath = path.join(
        tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
        path.basename(taskPath),
      );

      expect(await fs.pathExists(taskPath)).toBe(true);
      expect(await fs.pathExists(legacyTaskPath)).toBe(false);
    });

    it("should not write a legacy mirror for discovered tasks by default", async () => {
      // First create a planned task to discover from
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

      const legacyDiscoveredPath = path.join(
        tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "discovered",
        path.basename(discoveredPath),
      );

      expect(await fs.pathExists(discoveredPath)).toBe(true);
      expect(await fs.pathExists(legacyDiscoveredPath)).toBe(false);
    });

    it("should not write a legacy mirror for backlog/idea tasks by default", async () => {
      const ideaPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "backlog",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const legacyIdeaPath = path.join(
        tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "backlog",
        path.basename(ideaPath),
      );

      expect(await fs.pathExists(ideaPath)).toBe(true);
      expect(await fs.pathExists(legacyIdeaPath)).toBe(false);
    });

    it("should write both canonical and legacy when compatibilityLegacyWrite is true", async () => {
      const taskPath = await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        discoveredFromTask: null,
        compatibilityLegacyWrite: true,
        cwd: tempDir,
      });

      const legacyTaskPath = path.join(
        tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
        path.basename(taskPath),
      );

      expect(await fs.pathExists(taskPath)).toBe(true);
      expect(await fs.pathExists(legacyTaskPath)).toBe(true);

      // Both files should contain the same frontmatter
      const canonicalContent = await fs.readFile(taskPath, "utf8");
      const legacyContent = await fs.readFile(legacyTaskPath, "utf8");
      expect(canonicalContent).toEqual(legacyContent);
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

    it("should roll back both canonical and legacy files when graph sync fails with compatibilityLegacyWrite", async () => {
      const plannedDir = path.join(
        tempDir,
        "roadmap",
        "projects",
        "shared",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
      );

      const legacyPlannedDir = path.join(
        tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
      );

      const beforeCanonical = (await fs.pathExists(plannedDir)) ? await fs.readdir(plannedDir) : [];
      const beforeLegacy = (await fs.pathExists(legacyPlannedDir))
        ? await fs.readdir(legacyPlannedDir)
        : [];

      const graphSpy = vi
        .spyOn(graphManifests, "rebuildArchitectureGraph")
        .mockRejectedValue(new Error("injected graph failure"));

      try {
        await expect(
          createTask({
            phaseId: "phase-1",
            milestoneId: "milestone-1-setup",
            lane: "planned",
            discoveredFromTask: null,
            compatibilityLegacyWrite: true,
            cwd: tempDir,
          }),
        ).rejects.toThrow(/\.arch\/graph|rollback succeeded/i);
      } finally {
        graphSpy.mockRestore();
      }

      const afterCanonical = (await fs.pathExists(plannedDir)) ? await fs.readdir(plannedDir) : [];
      const afterLegacy = (await fs.pathExists(legacyPlannedDir))
        ? await fs.readdir(legacyPlannedDir)
        : [];

      // Both canonical and legacy should have been rolled back
      expect(afterCanonical.length).toBe(beforeCanonical.length);
      expect(afterLegacy.length).toBe(beforeLegacy.length);
    });

    it("should roll back roadmap task file when graph sync fails during create", async () => {
      const plannedDir = path.join(
        tempDir,
        "roadmap",
        "projects",
        "shared",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
      );

      const before = (await fs.pathExists(plannedDir)) ? await fs.readdir(plannedDir) : [];

      const graphSpy = vi
        .spyOn(graphManifests, "rebuildArchitectureGraph")
        .mockRejectedValue(new Error("injected graph failure"));

      try {
        await expect(
          createTask({
            phaseId: "phase-1",
            milestoneId: "milestone-1-setup",
            lane: "planned",
            discoveredFromTask: null,
            cwd: tempDir,
          }),
        ).rejects.toThrow(/\.arch\/graph|rollback succeeded/i);
      } finally {
        graphSpy.mockRestore();
      }

      const after = (await fs.pathExists(plannedDir)) ? await fs.readdir(plannedDir) : [];
      expect(after.length).toBe(before.length);
    });
  });

  describe("Ownership resolution failures", () => {
    it("should fail clearly when phase does not exist in manifest", async () => {
      await expect(
        createTask({
          phaseId: "phase-missing",
          milestoneId: "milestone-1-setup",
          lane: "planned",
          discoveredFromTask: null,
          cwd: tempDir,
        }),
      ).rejects.toThrow("does not exist in roadmap/manifest.json");
    });

    it("should fail clearly when phase ownership maps to missing project manifest", async () => {
      const manifestPath = path.join(tempDir, "roadmap", "manifest.json");
      const manifest = await fs.readJson(manifestPath);
      manifest.phases = manifest.phases.map((phase: { id: string; projectId: string }) =>
        phase.id === "phase-1" ? { ...phase, projectId: "ghost-project" } : phase,
      );
      await fs.writeJson(manifestPath, manifest, { spaces: 2 });

      const sharedPlannedDir = path.join(
        tempDir,
        "roadmap",
        "projects",
        "shared",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
      );
      const sharedBefore = (await fs.pathExists(sharedPlannedDir))
        ? await fs.readdir(sharedPlannedDir)
        : [];

      await expect(
        createTask({
          phaseId: "phase-1",
          milestoneId: "milestone-1-setup",
          lane: "planned",
          discoveredFromTask: null,
          cwd: tempDir,
        }),
      ).rejects.toThrow(/ownership project 'ghost-project' is invalid|Missing project manifest/);

      const sharedAfter = (await fs.pathExists(sharedPlannedDir))
        ? await fs.readdir(sharedPlannedDir)
        : [];
      expect(sharedAfter.length).toBe(sharedBefore.length);

      const ghostProjectDir = path.join(tempDir, "roadmap", "projects", "ghost-project");
      expect(await fs.pathExists(ghostProjectDir)).toBe(false);
    });
  });
});
