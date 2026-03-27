import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ensureDir, writeJson } from "fs-extra";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../utils/fs";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { updateTaskStatus } from "../tasks/updateTask";
import { runBackfillImplemented } from "./backfillImplemented";

async function patchTaskFrontmatter(
  taskPath: string,
  mutator: (data: Record<string, unknown>) => void,
): Promise<void> {
  const { data, content } = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
  mutator(data);
  await writeMarkdownWithFrontmatter(taskPath, data, content);
}

describe("core/reconciliation/backfillImplemented", () => {
  const originalCwd = process.cwd();
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
    await createPhase("phase-99");
    await createMilestone("phase-99", "milestone-99-backfill");
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 120_000);

  it("returns candidates for done tasks without reconciliation reports", async () => {
    const taskPath = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await patchTaskFrontmatter(taskPath, (data) => {
      data.codeTargets = ["architecture/workflows/implementation-reconciliation.md"];
      data.traceLinks = ["roadmap/phases/phase-99/milestones/milestone-99-backfill/manifest.json"];
      data.evidence = [];
    });

    await updateTaskStatus(taskPath, "done", context.tempDir);

    const result = await runBackfillImplemented({ cwd: context.tempDir });

    expect(result.totalCompletedTasks).toBe(1);
    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0]?.taskId).toBe("001");
    expect(result.candidates[0]?.status).toBe("reconciliation required");
    expect(result.candidates[0]?.source).toBe("trigger-detection");
  });

  it("excludes tasks that already have reconciliation complete reports", async () => {
    const taskPath = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await updateTaskStatus(taskPath, "done", context.tempDir);

    const reconcileDir = path.join(context.tempDir, ".project-arch", "reconcile");
    await ensureDir(reconcileDir);
    await writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-001-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "001",
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

    const result = await runBackfillImplemented({ cwd: context.tempDir });

    expect(result.totalCompletedTasks).toBe(1);
    expect(result.candidateCount).toBe(0);
    expect(result.candidates).toEqual([]);
  });

  it("includes tasks with existing report status not reconciliation complete", async () => {
    const taskPath = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await updateTaskStatus(taskPath, "done", context.tempDir);

    const reconcileDir = path.join(context.tempDir, ".project-arch", "reconcile");
    await ensureDir(reconcileDir);
    await writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-001-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation suggested",
      taskId: "001",
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

    const result = await runBackfillImplemented({ cwd: context.tempDir });

    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0]?.status).toBe("reconciliation suggested");
    expect(result.candidates[0]?.source).toBe("existing-report");
    expect(result.candidates[0]?.hasReport).toBe(true);
  });

  it("ranks candidates required first, then suggested, then none", async () => {
    const taskPath1 = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    const taskPath2 = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    const taskPath3 = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await patchTaskFrontmatter(taskPath1, (data) => {
      data.codeTargets = ["architecture/system.md"];
      data.evidence = [];
      data.traceLinks = ["roadmap/phases/phase-99/milestones/milestone-99-backfill/manifest.json"];
    });

    await patchTaskFrontmatter(taskPath2, (data) => {
      data.codeTargets = ["apps/web/src/view.tsx"];
      data.evidence = [];
      data.traceLinks = [];
    });

    await patchTaskFrontmatter(taskPath3, (data) => {
      data.codeTargets = ["apps/web/src/view.tsx"];
      data.evidence = ["Validated output"];
      data.traceLinks = [];
    });

    await updateTaskStatus(taskPath1, "done", context.tempDir);
    await updateTaskStatus(taskPath2, "done", context.tempDir);
    await updateTaskStatus(taskPath3, "done", context.tempDir);

    const result = await runBackfillImplemented({ cwd: context.tempDir });

    expect(result.candidateCount).toBe(3);
    expect(result.candidates.map((candidate) => candidate.status)).toEqual([
      "reconciliation required",
      "reconciliation suggested",
      "no reconciliation needed",
    ]);
  });

  it("writes optional backfill JSON artifact when writeJson is enabled", async () => {
    const taskPath = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await updateTaskStatus(taskPath, "done", context.tempDir);

    const result = await runBackfillImplemented({ cwd: context.tempDir, writeJson: true });

    expect(result.jsonPath).toBeDefined();
    expect(result.jsonPath).toContain(".project-arch");
    expect(result.jsonPath).toContain("backfill-");
  });
});
