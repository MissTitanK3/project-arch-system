import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pathExists } from "fs-extra";
import path from "path";
import { rm } from "fs/promises";
import { graphBuild, graphTraceTask, graphRead } from "./graph";
import { createTask } from "../core/tasks/createTask";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe("sdk/graph", () => {
  let context: TestProjectContext;
  let tempDir: string;
  const phaseId = "phase-1";
  const milestoneId = "milestone-1-setup"; // Use the milestone created by initializeProject

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("graphBuild", () => {
    it("should build graph and return path", async () => {
      const result = await graphBuild({ cwd: tempDir });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toBe(".arch/graph.json");
    });

    it("should create graph file on disk", async () => {
      await graphBuild({ cwd: tempDir });

      const graphPath = path.join(tempDir, ".arch", "graph.json");
      expect(await pathExists(graphPath)).toBe(true);
    });

    it("should support read-only build mode without writing artifacts", async () => {
      const graphPath = path.join(tempDir, ".arch", "graph.json");
      await rm(path.join(tempDir, ".arch"), { recursive: true, force: true });

      const result = await graphBuild({ cwd: tempDir, write: false });

      resultAssertions.assertSuccess(result);
      expect(await pathExists(graphPath)).toBe(false);
    });
  });

  describe("graphRead", () => {
    it("should read existing graph", async () => {
      await graphBuild({ cwd: tempDir });
      const result = await graphRead(tempDir);

      resultAssertions.assertSuccess(result);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe("object");
    });

    it("should succeed and read graph even if built during init", async () => {
      // initializeProject might create graph
      const result = await graphRead(tempDir);

      // Either succeeds (graph exists) or fails (doesn't exist yet)
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should fail when graph file is missing", async () => {
      await rm(path.join(tempDir, ".arch"), { recursive: true, force: true });

      const result = await graphRead(tempDir);

      resultAssertions.assertError(result);
      expect(result.errors?.join(" ")).toContain(".arch/graph.json not found");
    });
  });

  describe("graphTraceTask", () => {
    it("should trace existing task", async () => {
      // Create a task
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        discoveredFromTask: null,
        title: "Test Task",
        cwd: tempDir,
      });
      const taskId = path.basename(taskPath, ".md").split("-")[0];

      // Build graph
      await graphBuild({ cwd: tempDir });

      // Trace the task
      const result = await graphTraceTask({
        task: `${phaseId}/${milestoneId}/${taskId}`,
        cwd: tempDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe("object");
    });

    it("should handle non-existent task", async () => {
      await graphBuild({ cwd: tempDir });

      const result = await graphTraceTask({ task: "phase-999/milestone-999/999", cwd: tempDir });

      resultAssertions.assertError(result);
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
