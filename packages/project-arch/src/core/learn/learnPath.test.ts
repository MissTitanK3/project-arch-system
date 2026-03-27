import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { learnPath, renderLearnReport } from "./learnPath";

describe.sequential("core/learn/learnPath", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd, undefined, { setCwd: false });
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns a path-scoped learn report with findings and suggested commands", async () => {
    const report = await learnPath({ paths: ["architecture/governance"] }, context.tempDir);

    expect(report.schemaVersion).toBe("1.0");
    expect(report.analyzedPaths).toEqual(["architecture/governance"]);
    expect(report.summary.totalGaps).toBeGreaterThan(0);
    expect(Object.keys(report.summary.byCategory).length).toBeGreaterThan(0);
    expect(report.suggestedCommands.length).toBeGreaterThan(0);
  }, 120_000);

  it("supports multiple explicit paths in one report", async () => {
    const report = await learnPath(
      { paths: ["architecture/governance", "architecture/product-framing/project-overview.md"] },
      context.tempDir,
    );

    expect(report.analyzedPaths).toEqual([
      "architecture/governance",
      "architecture/product-framing/project-overview.md",
    ]);
  }, 120_000);

  it("records missing paths as scope findings instead of mutating state", async () => {
    const report = await learnPath({ paths: ["packages/does-not-exist"] }, context.tempDir);

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "scope",
          severity: "error",
          pathScope: "packages/does-not-exist",
        }),
      ]),
    );
  }, 120_000);

  it("renders a human-readable learn report", async () => {
    const report = await learnPath({ paths: ["architecture/governance"] }, context.tempDir);
    const text = renderLearnReport(report);

    expect(text).toContain("Scope");
    expect(text).toContain("Findings");
    expect(text).toContain("Recommended Follow-Up");
    expect(text).toContain("Summary");
  }, 120_000);
});
