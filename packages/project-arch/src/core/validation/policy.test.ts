import path from "path";
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
} from "../../fs";

describe.sequential("core/validation/policy", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 45_000);

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
});
