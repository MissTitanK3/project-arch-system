import path from "path";
import fs from "fs-extra";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";
import { createTempDir, createTestProject } from "../../test/helpers";
import { resolveNextWorkflow } from "./next";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../utils/fs";
import { rebuildArchitectureGraph } from "../../graph/manifests";

async function seedReconciliationArtifact(
  cwd: string,
  taskId: string,
  date: string,
): Promise<void> {
  const reconcileDir = path.join(cwd, ".project-arch", "reconcile");
  await fs.ensureDir(reconcileDir);
  const jsonPath = path.join(reconcileDir, `${taskId}-${date}.json`);

  await fs.writeJson(jsonPath, {
    schemaVersion: "1.0",
    id: `${taskId}-${date}`,
    type: "local-reconciliation",
    status: "reconciliation complete",
    taskId,
    date,
    changedFiles: [],
    affectedAreas: [],
    missingUpdates: [],
    missingTraceLinks: [],
    decisionCandidates: [],
    standardsGaps: [],
    proposedActions: [],
    feedbackCandidates: [],
  });
}

describe("core/workflow/next", () => {
  const originalCwd = process.cwd();

  it("routes to init when initialization artifacts are missing", async () => {
    const context = await createTempDir();
    try {
      const decision = await resolveNextWorkflow(context.tempDir);
      expect(decision.status).toBe("needs_init");
      expect(decision.recommendedCommand).toBe("pa init");
    } finally {
      await context.cleanup();
    }
  });

  it("routes to check when critical validations fail", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const [brokenTaskPath] = await fg("roadmap/phases/*/milestones/*/tasks/planned/*.md", {
        cwd: context.tempDir,
        absolute: true,
      });
      expect(brokenTaskPath).toBeDefined();

      await fs.writeFile(brokenTaskPath, "---\ninvalid yaml\n", "utf8");

      const decision = await resolveNextWorkflow(context.tempDir);
      expect(decision.status).toBe("needs_check");
      expect(decision.recommendedCommand).toBe("pa check");
    } finally {
      await context.cleanup();
    }
  });

  it("routes to report when planned tasks exist without verification evidence", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const decision = await resolveNextWorkflow(context.tempDir);
      expect(decision.status).toBe("needs_verification");
      expect(decision.recommendedCommand).toBe("pa report");
    } finally {
      await context.cleanup();
    }
  });

  it("routes to reconcile when done tasks are unreconciled", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      await seedReconciliationArtifact(context.tempDir, "002", "2026-03-22");

      const [taskPath] = await fg("roadmap/phases/*/milestones/*/tasks/planned/*.md", {
        cwd: context.tempDir,
        absolute: true,
      });
      expect(taskPath).toBeDefined();

      const task = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
      const updated = {
        ...task.data,
        status: "done",
      };
      await writeMarkdownWithFrontmatter(taskPath, updated, task.content);
      await rebuildArchitectureGraph(context.tempDir);

      const decision = await resolveNextWorkflow(context.tempDir);
      expect(decision.status).toBe("needs_reconciliation");
      expect(decision.recommendedCommand).toBe("pa reconcile");
      expect(decision.evidence.some((line) => line.includes("001"))).toBe(true);
    } finally {
      await context.cleanup();
    }
  });

  it("returns healthy no-op when checks pass and evidence is present", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      await seedReconciliationArtifact(context.tempDir, "001", "2026-03-22");

      const decision = await resolveNextWorkflow(context.tempDir);
      expect(decision.status).toBe("healthy_noop");
      expect(decision.recommendedCommand).toBe("none");
    } finally {
      await context.cleanup();
    }
  });
});
