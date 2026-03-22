import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "fs";
import { taskCreate, taskCreateInLane, taskDiscover, taskIdea, taskStatus } from "./tasks";
import { phaseCreate } from "./phases";
import { milestoneCreate } from "./milestones";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

function extractTaskIdFromPath(taskPath: string): string {
  const match = taskPath.match(/\/(\d{3})-[^/]+\.md$/);
  if (!match) {
    throw new Error(`Could not extract task id from path: ${taskPath}`);
  }
  return match[1];
}

describe.sequential("SDK Tasks", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  let testDir: string;

  beforeEach(async () => {
    context = await createTestProject(originalCwd, undefined, { setCwd: false });
    testDir = context.tempDir;
    await phaseCreate({ id: "phase-1", cwd: testDir });
    await milestoneCreate({ phase: "phase-1", milestone: "milestone-1-setup", cwd: testDir });
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  }, 120_000);

  describe("taskCreate", () => {
    it("should create a planned task successfully", async () => {
      const result = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toBeDefined();
      expect(result.data.path).toContain("planned");
      expect(existsSync(result.data.path)).toBe(true);
      expect(Number(extractTaskIdFromPath(result.data.path))).toBeGreaterThanOrEqual(1);
    });

    it("should create multiple planned tasks with incremented IDs", async () => {
      const result1 = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });
      const result2 = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result2.success) {
        const firstId = Number(extractTaskIdFromPath(result1.data!.path));
        const secondId = Number(extractTaskIdFromPath(result2.data!.path));
        expect(secondId).toBe(firstId + 1);
      }
    });

    it("should create task with custom title", async () => {
      const result = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        title: "Custom Task Title",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("custom-task-title");
    });

    it("should fail if milestone does not exist", async () => {
      const result = await taskCreate({
        phase: "phase-1",
        milestone: "nonexistent-milestone",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should fail if phase does not exist", async () => {
      const result = await taskCreate({
        phase: "phase-999",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("taskDiscover", () => {
    it("should create a discovered task linked to planned task", async () => {
      const planned = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(planned);
      const fromTaskId = extractTaskIdFromPath(planned.data.path);

      const result = await taskDiscover({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        from: fromTaskId,
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("101");
      expect(result.data.path).toContain("discovered");
      expect(existsSync(result.data.path)).toBe(true);
    });

    it("should create multiple discovered tasks with incremented IDs", async () => {
      await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      const result1 = await taskDiscover({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        from: "001",
        cwd: testDir,
      });
      const result2 = await taskDiscover({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        from: "001",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result1);
      resultAssertions.assertSuccess(result2);
      expect(result1.data.path).toContain("101");
      expect(result2.data.path).toContain("102");
    });

    it("should create discovered task with custom title", async () => {
      await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      const result = await taskDiscover({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        from: "001",
        title: "Discovered Issue",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("discovered-issue");
    }, 15000);

    it("should require from parameter", async () => {
      const result = await taskDiscover({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        from: "",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("taskIdea", () => {
    it("should create a backlog idea successfully", async () => {
      const result = await taskIdea({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("901");
      expect(result.data.path).toContain("backlog");
      expect(existsSync(result.data.path)).toBe(true);
    });

    it("should create multiple backlog ideas with incremented IDs", async () => {
      const result1 = await taskIdea({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });
      const result2 = await taskIdea({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result1);
      resultAssertions.assertSuccess(result2);
      const firstId = Number(extractTaskIdFromPath(result1.data.path));
      const secondId = Number(extractTaskIdFromPath(result2.data.path));
      expect(secondId).toBe(firstId + 1);
    }, 15000);

    it("should create idea with custom title", async () => {
      const result = await taskIdea({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        title: "Future Enhancement",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("future-enhancement");
    });
  });

  describe("taskStatus", () => {
    it("should get status of existing task", async () => {
      const created = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(created);
      const createdId = extractTaskIdFromPath(created.data.path);

      const result = await taskStatus({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        taskId: createdId,
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBeDefined();
      expect(["todo", "in-progress", "blocked", "done"]).toContain(result.data.status);
    });

    it("should fail for nonexistent task", async () => {
      const result = await taskStatus({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        taskId: "999",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should fail for nonexistent milestone", async () => {
      const result = await taskStatus({
        phase: "phase-1",
        milestone: "nonexistent",
        taskId: "001",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("Lane Separation", () => {
    it("should keep planned, discovered, and backlog tasks separate", async () => {
      const planned = await taskCreate({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });
      const discovered = await taskDiscover({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        from: "001",
        cwd: testDir,
      });
      const backlog = await taskIdea({
        phase: "phase-1",
        milestone: "milestone-1-setup",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(planned);
      resultAssertions.assertSuccess(discovered);
      resultAssertions.assertSuccess(backlog);

      expect(planned.data.path).toContain("planned");
      expect(discovered.data.path).toContain("discovered");
      expect(backlog.data.path).toContain("backlog");

      expect(Number(extractTaskIdFromPath(planned.data.path))).toBeGreaterThanOrEqual(1);
      expect(Number(extractTaskIdFromPath(discovered.data.path))).toBeGreaterThanOrEqual(101);
      expect(Number(extractTaskIdFromPath(backlog.data.path))).toBeGreaterThanOrEqual(901);
    }, 15000);
  });

  describe("taskCreateInLane", () => {
    it("should create a task in an explicit lane", async () => {
      const result = await taskCreateInLane({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        discoveredFromTask: null,
        title: "Explicit Lane Task",
        slugBase: "explicit-lane-task",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("planned");
      expect(existsSync(result.data.path)).toBe(true);
    });
  });
});
