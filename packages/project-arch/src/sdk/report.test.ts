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
  }, 60_000);

  it("should support verbose mode option", async () => {
    const result = await reportGenerate({ verbose: true });

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("Metric");
    expect(result.data.text).toContain("Roadmap-Graph Parity Check");
  }, 60_000);

  it("should include provenance annotations", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("[source:");
    expect(result.data.text).toContain("roadmap/manifest.json");
  }, 60_000);

  it("should include graph sync status", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("graph sync status");
  }, 60_000);

  it("should include parity check summary", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("Roadmap-Graph Parity Check");
    expect(result.data.text).toContain("Status:");
    expect(result.data.text).toContain("Tasks checked:");
    expect(result.data.text).toContain("Status mismatches:");
  }, 60_000);
});
