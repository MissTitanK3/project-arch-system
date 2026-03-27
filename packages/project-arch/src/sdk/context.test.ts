import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { contextResolve } from "./context";
import { createTempDir, createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("sdk/context", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should resolve context as a successful operation result", async () => {
    const result = await contextResolve();

    resultAssertions.assertSuccess(result);
    expect(result.data.version).toBe("1.0");
    expect(result.data.active.phase.id).toBe("phase-1");
    expect(result.data.active.milestone.id).toBe("milestone-1-setup");
    expect(result.data.active.task.id).toContain("001-define-project-overview");
    expect(result.data.recommended?.action.command).toBeDefined();
  }, 120_000);

  it("should return an error result when repository is not initialized", async () => {
    const emptyContext = await createTempDir();
    try {
      const result = await contextResolve({ cwd: emptyContext.tempDir });
      resultAssertions.assertErrorContains(result, "roadmap not found");
    } finally {
      await emptyContext.cleanup();
    }
  });
});
