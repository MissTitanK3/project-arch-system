import path from "path";
import fs from "fs-extra";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { policyCheck, policyExplain, policyResolved, policySetup } from "./policy";
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

  it("returns effective resolved policy profile", async () => {
    const result = await policyResolved();

    resultAssertions.assertSuccess(result);
    expect(result.data.profileName).toBe("default");
    expect(result.data.source).toBe("file");
    expect(result.data.policyPath.endsWith("roadmap/policy.json")).toBe(true);
    expect(result.data.profile.timing.phase.skipDoneIfCompletedContainer).toBe(true);
  });

  it("creates policy.json when project is initialized but file is missing", async () => {
    const policyPath = path.join(context.tempDir, "roadmap", "policy.json");
    await fs.remove(policyPath);

    const setupResult = await policySetup();
    resultAssertions.assertSuccess(setupResult);
    expect(setupResult.data.created).toBe(true);
    expect(await fs.pathExists(policyPath)).toBe(true);

    const secondResult = await policySetup();
    resultAssertions.assertSuccess(secondResult);
    expect(secondResult.data.created).toBe(false);
  });
});
