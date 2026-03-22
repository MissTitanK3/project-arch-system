import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { phaseCreate, phaseList } from "./phases";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("SDK Phases", () => {
  let context: TestProjectContext;
  let testDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    testDir = context.tempDir;
  }, 120000);

  afterEach(async () => {
    await context.cleanup();
  });

  describe("phaseCreate", () => {
    it("should create a new phase successfully", async () => {
      const result = await phaseCreate({ id: "phase-2", cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(result.data.id).toBe("phase-2");
    });

    it("should create multiple phases", async () => {
      const result1 = await phaseCreate({ id: "phase-2", cwd: testDir });
      const result2 = await phaseCreate({ id: "phase-3", cwd: testDir });

      resultAssertions.assertSuccess(result1);
      resultAssertions.assertSuccess(result2);
    });

    it("should fail without initialized project", async () => {
      const uninitDir = mkdtempSync(join(tmpdir(), "pa-test-uninit-"));
      const result = await phaseCreate({ id: "phase-1", cwd: uninitDir });

      resultAssertions.assertError(result);
      rmSync(uninitDir, { recursive: true, force: true });
    });

    it("should fail for duplicate phase ID", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      const result = await phaseCreate({ id: "phase-2", cwd: testDir });

      resultAssertions.assertError(result);
      resultAssertions.assertErrorContains(result, "already exists");
    });
  });

  describe("phaseList", () => {
    it("should list phases in empty project", async () => {
      const uninitDir = mkdtempSync(join(tmpdir(), "pa-test-uninit-"));
      const result = await phaseList({ cwd: uninitDir });
      rmSync(uninitDir, { recursive: true, force: true });

      resultAssertions.assertError(result);
    });

    it("should list created phases", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });
      await phaseCreate({ id: "phase-3", cwd: testDir });

      const result = await phaseList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const phaseIds = result.data.map((p) => p.id);
      expect(phaseIds).toContain("phase-2");
      expect(phaseIds).toContain("phase-3");
    });

    it("should include active flag for phases", async () => {
      await phaseCreate({ id: "phase-2", cwd: testDir });

      const result = await phaseList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      result.data.forEach((phase) => {
        expect(phase).toHaveProperty("id");
        expect(phase).toHaveProperty("active");
        expect(typeof phase.active).toBe("boolean");
      });
    });

    it("should fail without initialized project", async () => {
      const uninitDir = mkdtempSync(join(tmpdir(), "pa-test-uninit-"));
      const result = await phaseList({ cwd: uninitDir });
      rmSync(uninitDir, { recursive: true, force: true });

      resultAssertions.assertError(result);
    });
  });
});
