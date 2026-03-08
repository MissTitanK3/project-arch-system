import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reportGenerate } from "./report";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("sdk/report", () => {
  let context: TestProjectContext;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    context = await createTestProject(originalCwd);
  }, 45_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should generate a report table as successful operation", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("Metric");
    expect(result.data.text).toContain("Value");
    expect(result.data.text).toContain("active phase");
  }, 15_000);
});
