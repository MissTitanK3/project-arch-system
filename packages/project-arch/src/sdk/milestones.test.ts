import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { milestoneActivate, milestoneComplete, milestoneCreate, milestoneList } from "./milestones";
import { phaseCreate } from "./phases";
import { taskCreate, taskDiscover } from "./tasks";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";
import fs from "fs-extra";
import path from "path";

describe.sequential("SDK Milestones", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  let testDir: string;

  beforeEach(async () => {
    context = await createTestProject(originalCwd, undefined, { setCwd: false });
    testDir = context.tempDir;
  }, 90_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("milestoneCreate", () => {
    it("should create a milestone successfully", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });

      const result = await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-1-foundation",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.phase).toBe("phase-2");
      expect(result.data.milestone).toBe("milestone-1-foundation");
    });

    it("should create multiple milestones in same phase", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });

      const result1 = await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-1-foundation",
        cwd: testDir,
      });
      const result2 = await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-2-build",
        cwd: testDir,
      });

      expect(result1.success).toBe(true);
      resultAssertions.assertSuccess(result1);
      resultAssertions.assertSuccess(result2);
    });

    it("should create milestones in different phases", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });

      const result1 = await milestoneCreate({
        phase: "phase-1",
        milestone: "m1",
        cwd: testDir,
      });
      const result2 = await milestoneCreate({
        phase: "phase-2",
        milestone: "m1",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result1);
      resultAssertions.assertSuccess(result2);
    });

    it("should fail if phase does not exist", async () => {
      const result = await milestoneCreate({
        phase: "phase-999",
        milestone: "m1",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should fail for duplicate milestone ID", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-1-foundation",
        cwd: testDir,
      });

      const result = await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-1-foundation",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("milestoneList", () => {
    it("should list milestones in empty project", async () => {
      const result = await milestoneList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should list created milestones", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-1-foundation",
        cwd: testDir,
      });
      await milestoneCreate({
        phase: "phase-2",
        milestone: "milestone-2-build",
        cwd: testDir,
      });

      const result = await milestoneList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      expect(result.data).toContain("phase-2/milestone-1-foundation");
      expect(result.data).toContain("phase-2/milestone-2-build");
    });

    it("should list milestones from multiple phases", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });
      await milestoneCreate({ phase: "phase-2", milestone: "m1", cwd: testDir });

      const result = await milestoneList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(result.data).toContain("phase-1/m1");
      expect(result.data).toContain("phase-2/m1");
    });
  });

  describe("milestoneActivate", () => {
    it("should fail activation when readiness prerequisites are missing", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({ phase: "phase-2", milestone: "m-activation-fail", cwd: testDir });

      const result = await milestoneActivate({
        phase: "phase-2",
        milestone: "m-activation-fail",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should activate milestone when prerequisites are present", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({ phase: "phase-2", milestone: "m-activation-ok", cwd: testDir });
      await taskCreate({
        phase: "phase-2",
        milestone: "m-activation-ok",
        title: "Ready task",
        cwd: testDir,
      });

      const overviewPath = path.join(
        testDir,
        "roadmap",
        "phases",
        "phase-2",
        "milestones",
        "m-activation-ok",
        "overview.md",
      );
      await fs.writeFile(overviewPath, "## Success Criteria\n\n- [ ] Ready\n", "utf8");

      const result = await milestoneActivate({
        phase: "phase-2",
        milestone: "m-activation-ok",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.phase).toBe("phase-2");
      expect(result.data.milestone).toBe("m-activation-ok");
    });
  });

  describe("milestoneComplete", () => {
    it("should fail completion when threshold is breached and checkpoint is missing", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({ phase: "phase-2", milestone: "m-complete-fail", cwd: testDir });
      await taskCreate({
        phase: "phase-2",
        milestone: "m-complete-fail",
        title: "Planned",
        cwd: testDir,
      });
      await taskDiscover({
        phase: "phase-2",
        milestone: "m-complete-fail",
        from: "001",
        title: "Discovered",
        cwd: testDir,
      });

      const result = await milestoneComplete({
        phase: "phase-2",
        milestone: "m-complete-fail",
        cwd: testDir,
      });
      resultAssertions.assertError(result);
    });

    it("should complete when checkpoint is present", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await milestoneCreate({ phase: "phase-2", milestone: "m-complete-ok", cwd: testDir });
      await taskCreate({
        phase: "phase-2",
        milestone: "m-complete-ok",
        title: "Planned",
        cwd: testDir,
      });
      await taskDiscover({
        phase: "phase-2",
        milestone: "m-complete-ok",
        from: "001",
        title: "Discovered",
        cwd: testDir,
      });

      await fs.writeFile(
        path.join(
          testDir,
          "roadmap",
          "phases",
          "phase-2",
          "milestones",
          "m-complete-ok",
          "replan-checkpoint.md",
        ),
        "# Replan Checkpoint\n\nActions accepted.\n",
        "utf8",
      );

      const result = await milestoneComplete({
        phase: "phase-2",
        milestone: "m-complete-ok",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(result);
    });
  });
});
