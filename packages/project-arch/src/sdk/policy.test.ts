import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { policyCheck, policyExplain } from "./policy";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("sdk/policy", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 45_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns deterministic machine-readable policy check result", async () => {
    const result = await policyCheck();

    resultAssertions.assertSuccess(result);
    expect(typeof result.data.ok).toBe("boolean");
    expect(Array.isArray(result.data.conflicts)).toBe(true);
  });

  it("returns explain output with rationale/remediation text", async () => {
    const result = await policyExplain();

    resultAssertions.assertSuccess(result);
    expect(typeof result.data.text).toBe("string");
    expect(Array.isArray(result.data.conflicts)).toBe(true);
  });
});
