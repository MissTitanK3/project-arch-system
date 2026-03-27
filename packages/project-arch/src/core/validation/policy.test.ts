import path from "path";
import fs from "fs-extra";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runPolicyChecks, renderPolicyExplanation } from "./policy";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, setDecisionStatus } from "../decisions/createDecision";
import { loadPhaseManifest, savePhaseManifest } from "../manifests";
import {
  readMarkdownWithFrontmatter,
  writeJsonDeterministic,
  writeMarkdownWithFrontmatter,
} from "../../utils/fs";

describe.sequential("core/validation/policy", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns no conflicts for initialized baseline", async () => {
    const result = await runPolicyChecks(context.tempDir);
    expect(result.ok).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(renderPolicyExplanation(result.conflicts)).toContain("No policy conflicts detected");
  });

  it("detects decision status and scope contradictions", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-2-api", context.tempDir);

    const taskPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Scoped decision mismatch",
      discoveredFromTask: null,
    });

    const decisionPath = await createDecision(
      {
        scope: "phase",
        phase: "phase-2",
        title: "Phase 2-only decision",
        slug: "phase-2-only",
      },
      context.tempDir,
    );

    const decisionId = path.basename(decisionPath, ".md");
    await setDecisionStatus(decisionId, "rejected", context.tempDir);

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    const nextFrontmatter = {
      ...parsed.data,
      decisions: [decisionId],
    };
    await writeMarkdownWithFrontmatter(absoluteTaskPath, nextFrontmatter, parsed.content);

    const result = await runPolicyChecks(context.tempDir);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c) => c.ruleId === "DECISION_STATUS_CONTRADICTION")).toBe(true);
    expect(result.conflicts.some((c) => c.ruleId === "DECISION_SCOPE_CONTRADICTION")).toBe(true);
  });

  it("detects concept creation without linked architecture decision", async () => {
    const taskPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Introduce new runtime module",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        codeTargets: ["packages/new-runtime-module/src/index.ts"],
        decisions: [],
      },
      parsed.content,
    );

    const result = await runPolicyChecks(context.tempDir);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c) => c.ruleId === "CONCEPT_CREATION_WITHOUT_DECISION")).toBe(
      true,
    );
  });

  it("detects domain ownership and architecture boundary violations", async () => {
    const domainsPath = path.join(context.tempDir, "arch-domains", "domains.json");
    await writeJsonDeterministic(domainsPath, {
      domains: [{ name: "payments", ownedPackages: ["packages/api"] }],
    });

    const taskPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Cross-domain runtime change",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        tags: ["domain:payments"],
        codeTargets: ["packages/ui/src/index.ts", "packages/undeclared-service/src/index.ts"],
      },
      parsed.content,
    );

    const result = await runPolicyChecks(context.tempDir);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c) => c.ruleId === "DOMAIN_OWNERSHIP_VIOLATION")).toBe(true);
    expect(result.conflicts.some((c) => c.ruleId === "ARCHITECTURE_BOUNDARY_VIOLATION")).toBe(true);
  });

  it("detects phase/milestone timing conflicts", async () => {
    await createMilestone("phase-1", "milestone-2-extra", context.tempDir);

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const taskPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-2-extra",
      lane: "planned",
      cwd: context.tempDir,
      title: "Work started on inactive milestone",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "in_progress",
      },
      parsed.content,
    );

    const result = await runPolicyChecks(context.tempDir);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c) => c.ruleId === "TIMING_CONFLICT")).toBe(true);
  });

  it("does not flag done task in completed non-active phase by default policy", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-1-wrapup", context.tempDir);

    const phaseOverviewPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "overview.md",
    );
    const phaseOverview =
      await readMarkdownWithFrontmatter<Record<string, unknown>>(phaseOverviewPath);
    await writeMarkdownWithFrontmatter(
      phaseOverviewPath,
      {
        ...phaseOverview.data,
        status: "completed",
      },
      phaseOverview.content,
    );

    const taskPath = await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-wrapup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Finished work in completed phase",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "done",
      },
      parsed.content,
    );

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const result = await runPolicyChecks(context.tempDir);
    const conflict = result.conflicts.find(
      (item) => item.ruleId === "TIMING_CONFLICT" && item.taskRef.startsWith("phase-2/"),
    );
    expect(conflict).toBeUndefined();
  });

  it("still flags in_progress task in non-active phase", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-2-api", context.tempDir);

    const taskPath = await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-2-api",
      lane: "planned",
      cwd: context.tempDir,
      title: "Active work in non-active phase",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "in_progress",
      },
      parsed.content,
    );

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const result = await runPolicyChecks(context.tempDir);
    expect(
      result.conflicts.some(
        (item) => item.ruleId === "TIMING_CONFLICT" && item.taskRef.startsWith("phase-2/"),
      ),
    ).toBe(true);
  });

  it("flags done task in non-completed non-active phase", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-2-api", context.tempDir);

    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-2-api",
      lane: "planned",
      cwd: context.tempDir,
      title: "Pending task keeps phase incomplete",
      discoveredFromTask: null,
    });

    const taskPath = await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-2-api",
      lane: "planned",
      cwd: context.tempDir,
      title: "Done work in incomplete non-active phase",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "done",
      },
      parsed.content,
    );

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const result = await runPolicyChecks(context.tempDir);
    expect(
      result.conflicts.some(
        (item) => item.ruleId === "TIMING_CONFLICT" && item.taskRef.startsWith("phase-2/"),
      ),
    ).toBe(true);
  });

  it("uses task-status fallback when phase overview is not completed", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-1-wrapup", context.tempDir);

    const phaseOverviewPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "overview.md",
    );
    const phaseOverview =
      await readMarkdownWithFrontmatter<Record<string, unknown>>(phaseOverviewPath);
    await writeMarkdownWithFrontmatter(
      phaseOverviewPath,
      {
        ...phaseOverview.data,
        status: "in_progress",
      },
      phaseOverview.content,
    );

    const taskPath = await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-wrapup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Done task with incomplete phase metadata",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "done",
      },
      parsed.content,
    );

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const result = await runPolicyChecks(context.tempDir);
    const conflict = result.conflicts.find(
      (item) => item.ruleId === "TIMING_CONFLICT" && item.taskRef.startsWith("phase-2/"),
    );
    expect(conflict).toBeUndefined();
  });

  it("handles malformed phase overview metadata deterministically", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-1-wrapup", context.tempDir);

    const phaseOverviewPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "overview.md",
    );
    await fs.writeFile(
      phaseOverviewPath,
      "---\nstatus: [\n---\n\n## Overview\n\nMalformed metadata for test.\n",
      "utf8",
    );

    const taskPath = await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-wrapup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Done task with malformed phase metadata",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "done",
      },
      parsed.content,
    );

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const result = await runPolicyChecks(context.tempDir);
    const conflict = result.conflicts.find(
      (item) => item.ruleId === "TIMING_CONFLICT" && item.taskRef.startsWith("phase-2/"),
    );
    expect(conflict).toBeUndefined();
  });

  it("supports policy.json profile override for strict done timing", async () => {
    await createPhase("phase-2", context.tempDir);
    await createMilestone("phase-2", "milestone-1-wrapup", context.tempDir);

    const phaseOverviewPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "overview.md",
    );
    const phaseOverview =
      await readMarkdownWithFrontmatter<Record<string, unknown>>(phaseOverviewPath);
    await writeMarkdownWithFrontmatter(
      phaseOverviewPath,
      {
        ...phaseOverview.data,
        status: "completed",
      },
      phaseOverview.content,
    );

    await writeJsonDeterministic(path.join(context.tempDir, "roadmap", "policy.json"), {
      schemaVersion: "1.0",
      defaultProfile: "strict",
      profiles: {
        strict: {
          timing: {
            phase: {
              enforceStatuses: ["in_progress", "done"],
              skipDoneIfCompletedContainer: false,
              completionMode: "metadata_or_all_tasks_done",
            },
            milestone: {
              enforceStatuses: ["in_progress", "done"],
              skipDoneIfCompletedContainer: false,
              completionMode: "metadata_or_all_tasks_done",
            },
          },
        },
      },
    });

    const taskPath = await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-wrapup",
      lane: "planned",
      cwd: context.tempDir,
      title: "Strict policy done task",
      discoveredFromTask: null,
    });

    const absoluteTaskPath = path.isAbsolute(taskPath)
      ? taskPath
      : path.join(context.tempDir, taskPath);
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(absoluteTaskPath);
    await writeMarkdownWithFrontmatter(
      absoluteTaskPath,
      {
        ...parsed.data,
        status: "done",
      },
      parsed.content,
    );

    const manifest = await loadPhaseManifest(context.tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-1",
        activeMilestone: "milestone-1-setup",
      },
      context.tempDir,
    );

    const result = await runPolicyChecks(context.tempDir);
    expect(
      result.conflicts.some(
        (item) => item.ruleId === "TIMING_CONFLICT" && item.taskRef.startsWith("phase-2/"),
      ),
    ).toBe(true);
  });
});
