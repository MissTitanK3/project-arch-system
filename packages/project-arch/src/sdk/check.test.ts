import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkRun } from "./check";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("sdk/check", () => {
  let context: TestProjectContext;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    context = await createTestProject(originalCwd);
  }, 45_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should run checks and return structured result", async () => {
    const result = await checkRun();

    resultAssertions.assertSuccess(result);
    expect(typeof result.data.ok).toBe("boolean");
    expect(Array.isArray(result.data.errors)).toBe(true);
    expect(Array.isArray(result.data.warnings)).toBe(true);
    expect(Array.isArray(result.data.diagnostics)).toBe(true);
  }, 60_000);
});
