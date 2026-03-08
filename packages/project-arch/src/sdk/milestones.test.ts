import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { milestoneCreate, milestoneList } from "./milestones";
import { phaseCreate } from "./phases";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("SDK Milestones", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  let testDir: string;

  beforeEach(async () => {
    context = await createTestProject(originalCwd, undefined, { setCwd: false });
    testDir = context.tempDir;
  }, 45000);

  afterEach(async () => {
    await context.cleanup();
  }, 30000);

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
});
