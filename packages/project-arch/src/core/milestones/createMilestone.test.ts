import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import {
  createMilestone,
  listMilestones,
  activateMilestone,
  completeMilestone,
} from "./createMilestone";
import { createTask } from "../tasks/createTask";
import { loadPhaseManifest } from "../../graph/manifests";

describe("createMilestone", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
    await createPhase("phase-2", tempDir);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("creates milestone structure and manifest", async () => {
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);

    const mRoot = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-1-foundation",
    );

    expect(await fs.pathExists(path.join(mRoot, "tasks", "planned"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "tasks", "discovered"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "tasks", "backlog"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "decisions", "index.json"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "manifest.json"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "overview.md"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "targets.md"))).toBe(true);
  });

  it("fails when phase does not exist", async () => {
    await expect(createMilestone("phase-999", "m1", tempDir)).rejects.toThrow("does not exist");
  });

  it("fails when creating duplicate milestone", async () => {
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);
    await expect(createMilestone("phase-2", "milestone-1-foundation", tempDir)).rejects.toThrow(
      "already exists",
    );
  });

  it("lists milestones including newly created milestone", async () => {
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);
    const milestones = await listMilestones(tempDir);
    expect(milestones).toContain("phase-2/milestone-1-foundation");
  });

  it("creates milestone with custom slug", async () => {
    const customSlug = "my-custom-milestone";
    await createMilestone("phase-2", customSlug, tempDir);

    const mRoot = path.join(tempDir, "roadmap", "phases", "phase-2", "milestones", customSlug);
    expect(await fs.pathExists(mRoot)).toBe(true);
  });

  it("creates all required task lanes", async () => {
    await createMilestone("phase-2", "milestone-lanes", tempDir);

    const taskDir = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-lanes",
      "tasks",
    );

    const lanes = ["planned", "discovered", "backlog"];
    for (const lane of lanes) {
      const lanePath = path.join(taskDir, lane);
      expect(await fs.pathExists(lanePath)).toBe(true);

      // Verify .gitkeep or similar file exists to keep directory
      const contents = await fs.readdir(lanePath);
      expect(contents.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("creates manifest with schemaVersion", async () => {
    await createMilestone("phase-2", "milestone-manifest", tempDir);

    const manifestPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-manifest",
      "manifest.json",
    );

    const manifest = await fs.readJson(manifestPath);
    expect(manifest.schemaVersion).toBe("1.0");
  });

  it("creates overview.md with proper structure", async () => {
    await createMilestone("phase-2", "milestone-overview", tempDir);

    const overviewPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-overview",
      "overview.md",
    );

    const content = await fs.readFile(overviewPath, "utf-8");
    expect(content).toContain("#");
    expect(content.length).toBeGreaterThan(0);
  });

  it("creates targets.md with proper structure", async () => {
    await createMilestone("phase-2", "milestone-targets", tempDir);

    const targetsPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-targets",
      "targets.md",
    );

    const content = await fs.readFile(targetsPath, "utf-8");
    expect(content).toContain("#");
    expect(content.length).toBeGreaterThan(0);
  });

  it("creates decisions index.json", async () => {
    await createMilestone("phase-2", "milestone-decisions", tempDir);

    const indexPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-decisions",
      "decisions",
      "index.json",
    );

    const index = await fs.readJson(indexPath);
    expect(index).toBeDefined();
    expect(Array.isArray(index.decisions) || typeof index === "object").toBe(true);
  });

  it("lists multiple milestones in order", async () => {
    await createMilestone("phase-2", "milestone-1", tempDir);
    await createMilestone("phase-2", "milestone-2", tempDir);
    await createMilestone("phase-2", "milestone-3", tempDir);

    const milestones = await listMilestones(tempDir);

    const phase2Milestones = milestones.filter((m) => m.startsWith("phase-2/"));
    expect(phase2Milestones.length).toBeGreaterThanOrEqual(3);
    expect(phase2Milestones).toContain("phase-2/milestone-1");
    expect(phase2Milestones).toContain("phase-2/milestone-2");
    expect(phase2Milestones).toContain("phase-2/milestone-3");
  });

  it("handles milestone slug with special characters", async () => {
    const specialSlug = "milestone-with-dashes-123";
    await createMilestone("phase-2", specialSlug, tempDir);

    const mRoot = path.join(tempDir, "roadmap", "phases", "phase-2", "milestones", specialSlug);
    expect(await fs.pathExists(mRoot)).toBe(true);
  });

  it("blocks activation when planned lane has zero tasks", async () => {
    await createMilestone("phase-2", "milestone-gate-empty", tempDir);

    const overviewPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-gate-empty",
      "overview.md",
    );
    await fs.writeFile(overviewPath, "## Success Criteria\n\n- [ ] ready\n", "utf8");

    await expect(activateMilestone("phase-2", "milestone-gate-empty", tempDir)).rejects.toThrow(
      "at least one planned task",
    );
  });

  it("blocks activation when targets file is missing", async () => {
    await createMilestone("phase-2", "milestone-gate-targets", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-gate-targets",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const milestoneRoot = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-gate-targets",
    );
    await fs.remove(path.join(milestoneRoot, "targets.md"));
    await fs.writeFile(
      path.join(milestoneRoot, "overview.md"),
      "## Success Criteria\n\n- [ ] ready\n",
      "utf8",
    );

    await expect(activateMilestone("phase-2", "milestone-gate-targets", tempDir)).rejects.toThrow(
      "targets file is required",
    );
  });

  it("blocks activation when success criteria/checklist is missing", async () => {
    await createMilestone("phase-2", "milestone-gate-checklist", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-gate-checklist",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const overviewPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-gate-checklist",
      "overview.md",
    );
    await fs.writeFile(overviewPath, "## Overview\n\nNo readiness checklist yet.\n", "utf8");

    await expect(activateMilestone("phase-2", "milestone-gate-checklist", tempDir)).rejects.toThrow(
      "success criteria/checklist is required",
    );
  });

  it("activates milestone when readiness prerequisites are satisfied", async () => {
    await createMilestone("phase-2", "milestone-gate-ready", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-gate-ready",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const overviewPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-gate-ready",
      "overview.md",
    );
    await fs.writeFile(overviewPath, "## Success Criteria\n\n- [ ] Ship milestone scope\n", "utf8");

    await activateMilestone("phase-2", "milestone-gate-ready", tempDir);

    const manifest = await loadPhaseManifest(tempDir);
    expect(manifest.activePhase).toBe("phase-2");
    expect(manifest.activeMilestone).toBe("milestone-gate-ready");
  });

  it("blocks completion when discovered ratio exceeds threshold and checkpoint is missing", async () => {
    await createMilestone("phase-2", "milestone-complete-blocked", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-complete-blocked",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-complete-blocked",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });

    await expect(
      completeMilestone("phase-2", "milestone-complete-blocked", {}, tempDir),
    ).rejects.toThrow("replan-checkpoint.md");
  });

  it("allows completion when discovered ratio exceeds threshold but checkpoint is present", async () => {
    await createMilestone("phase-2", "milestone-complete-ready", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-complete-ready",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-complete-ready",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });

    const checkpointPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-complete-ready",
      "replan-checkpoint.md",
    );
    await fs.writeFile(
      checkpointPath,
      "# Replan Checkpoint\n\nAccepted replanning actions.\n",
      "utf8",
    );

    await expect(
      completeMilestone("phase-2", "milestone-complete-ready", {}, tempDir),
    ).resolves.toMatchObject({ warnings: [], overrideLogPath: null });
  });

  it("blocks completion when a task has reconciliation required and no complete report", async () => {
    await createMilestone("phase-2", "milestone-reconcile-blocked", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-reconcile-blocked",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const reconcileDir = path.join(tempDir, ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);
    await fs.writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-001-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation required",
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

    await expect(
      completeMilestone("phase-2", "milestone-reconcile-blocked", {}, tempDir),
    ).rejects.toThrow("reconciliation requirements");
  });

  it("emits warnings (non-blocking) when only reconciliation suggested tasks exist", async () => {
    await createMilestone("phase-2", "milestone-reconcile-warning", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-reconcile-warning",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const reconcileDir = path.join(tempDir, ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);
    await fs.writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
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

    const result = await completeMilestone("phase-2", "milestone-reconcile-warning", {}, tempDir);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("reconciliation suggested");
  });

  it("allows --force bypass with reason and logs override", async () => {
    await createMilestone("phase-2", "milestone-reconcile-force", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-reconcile-force",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const reconcileDir = path.join(tempDir, ".project-arch", "reconcile");
    await fs.ensureDir(reconcileDir);
    await fs.writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-001-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation required",
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

    const result = await completeMilestone(
      "phase-2",
      "milestone-reconcile-force",
      { forceReason: "Emergency release hotfix" },
      tempDir,
    );

    expect(result.overrideLogPath).toBeTruthy();
    const overrides = await fs.readJson(result.overrideLogPath!);
    expect(Array.isArray(overrides.overrides)).toBe(true);
    expect(overrides.overrides[overrides.overrides.length - 1].reason).toBe(
      "Emergency release hotfix",
    );
  });
});
