import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { exportToolingFeedbackFromReconciliation } from "./feedbackExport";
import { reconciliationReportSchema } from "../../schemas/reconciliationReport";

describe("core/reconciliation/feedbackExport", () => {
  const originalCwd = process.cwd();
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 120_000);

  it("exports one tooling-feedback report per feedbackCandidate", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);

    const sourcePath = path.join(reconcileDir, "001-2026-03-12.json");
    await fs.writeJson(sourcePath, {
      schemaVersion: "1.0",
      id: "reconcile-001-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "001",
      date: "2026-03-12",
      changedFiles: ["packages/project-arch/src/cli/commands/reconcile.ts"],
      affectedAreas: ["packages/project-arch/src/cli"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: [
        "Expose pa reconcile trigger-check in CLI",
        "Add reconciliation schema docs for onboarding",
      ],
    });

    const result = await exportToolingFeedbackFromReconciliation({
      reconciliationId: "reconcile-001-2026-03-12",
      cwd: process.cwd(),
    });

    expect(result.generatedCount).toBe(2);
    expect(result.jsonPaths).toHaveLength(2);
    expect(result.markdownPaths).toHaveLength(2);

    for (const jsonPath of result.jsonPaths) {
      expect(await fs.pathExists(jsonPath)).toBe(true);
      const parsed = reconciliationReportSchema.parse(await fs.readJson(jsonPath));
      expect(parsed.type).toBe("tooling-feedback");
      expect(parsed.affectedAreas.every((area) => area.startsWith("project-arch/"))).toBe(true);
    }

    for (const markdownPath of result.markdownPaths) {
      expect(await fs.pathExists(markdownPath)).toBe(true);
      const markdown = await fs.readFile(markdownPath, "utf8");
      expect(markdown).toContain("## Summary");
      expect(markdown).toContain("## Feedback Candidates");
      expect(markdown).toContain("**Type**: tooling-feedback");
    }
  });

  it("excludes sensitive changedFiles by default", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);

    await fs.writeJson(path.join(reconcileDir, "003-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-003-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "003",
      date: "2026-03-12",
      changedFiles: [
        "packages/project-arch/src/core/reconciliation/runReconcile.ts",
        ".env.local",
        "secrets.txt",
      ],
      affectedAreas: ["packages/project-arch/src/core/reconciliation"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: ["Improve export summaries"],
    });

    const result = await exportToolingFeedbackFromReconciliation({
      reconciliationId: "reconcile-003-2026-03-12",
      cwd: process.cwd(),
    });

    expect(result.excludedSensitivePaths).toEqual([".env.local", "secrets.txt"]);

    const exported = reconciliationReportSchema.parse(await fs.readJson(result.jsonPaths[0]));
    expect(exported.changedFiles).toEqual([
      "packages/project-arch/src/core/reconciliation/runReconcile.ts",
    ]);
  });

  it("includes sensitive changedFiles only when explicitly opted in", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);

    await fs.writeJson(path.join(reconcileDir, "004-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-004-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "004",
      date: "2026-03-12",
      changedFiles: [".env", "packages/project-arch/src/core/reports/generateReport.ts"],
      affectedAreas: ["packages/project-arch/src/core/reports"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: ["Investigate report classification"],
    });

    const result = await exportToolingFeedbackFromReconciliation({
      reconciliationId: "reconcile-004-2026-03-12",
      cwd: process.cwd(),
      includeSensitivePaths: true,
    });

    expect(result.excludedSensitivePaths).toEqual([]);

    const exported = reconciliationReportSchema.parse(await fs.readJson(result.jsonPaths[0]));
    expect(exported.changedFiles).toEqual([
      ".env",
      "packages/project-arch/src/core/reports/generateReport.ts",
    ]);
  });

  it("returns empty result when reconciliation report has no feedbackCandidates", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);

    const sourcePath = path.join(reconcileDir, "002-2026-03-12.json");
    await fs.writeJson(sourcePath, {
      schemaVersion: "1.0",
      id: "reconcile-002-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "002",
      date: "2026-03-12",
      changedFiles: [],
      affectedAreas: [],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: [],
    });

    const result = await exportToolingFeedbackFromReconciliation({
      reconciliationId: "reconcile-002-2026-03-12",
      cwd: process.cwd(),
    });

    expect(result.generatedCount).toBe(0);
    expect(result.jsonPaths).toEqual([]);
    expect(result.markdownPaths).toEqual([]);
  });
});
