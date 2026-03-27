import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import {
  ensureDir,
  pathExists,
  readMarkdownWithFrontmatter,
  writeJsonDeterministic,
  writeMarkdownWithFrontmatter,
} from "../../utils/fs";
import { taskSchema } from "../../schemas/task";
import { detectReconciliationTriggers } from "../reconciliation/triggerDetection";
import { reconciliationReportSchema } from "../../schemas/reconciliationReport";
import { currentDateISO } from "../../utils/date";
import { assertSafeId } from "../../utils/safeId";
import { assertWithinRoot } from "../../utils/assertWithinRoot";
import {
  milestoneDir,
  projectDocsRoot,
  projectMilestoneDecisionsRoot,
  projectMilestoneDir,
  projectMilestoneOverviewPath,
  projectMilestoneTaskLaneDir,
  projectMilestoneTargetsPath,
} from "../../utils/paths";
import {
  calculateDiscoveredRatioPercent,
  formatPercent,
  resolveDiscoveredLoadThresholdPercent,
} from "../../core/governance/discoveredLoad";
import {
  ensureDecisionIndex,
  loadPhaseManifest,
  milestoneOverviewPath,
  rebuildArchitectureGraph,
  resolvePhaseProjectId,
  savePhaseManifest,
} from "../../graph/manifests";
import {
  getMilestoneDependencyStatuses,
  type MilestoneTaskDependencyStatus,
} from "../tasks/dependencyStatus";
import {
  milestoneTaskGlob,
  resolveMilestoneRuntimePaths,
  resolvePreferredMilestoneDir,
} from "../runtime/projectPaths";
import { assertSupportedRuntimeCompatibility } from "../runtime/compatibility";

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  if (!(await pathExists(projectDocsRoot(cwd)))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
  await assertSupportedRuntimeCompatibility("Milestone runtime", cwd);
}

export async function createMilestone(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  assertSafeId(phaseId, "phaseId");
  assertSafeId(milestoneId, "milestoneId");
  await assertInitialized(cwd);

  const manifest = await loadPhaseManifest(cwd);
  const phaseExists = manifest.phases.some((phase) => phase.id === phaseId);
  if (!phaseExists) {
    throw new Error(`Phase '${phaseId}' does not exist`);
  }

  const projectId = resolvePhaseProjectId(manifest, phaseId);
  const canonicalMilestoneDir = projectMilestoneDir(projectId, phaseId, milestoneId, cwd);
  const legacyMilestoneDir = milestoneDir(phaseId, milestoneId, cwd);
  assertWithinRoot(canonicalMilestoneDir, cwd, "milestone directory");
  if (
    (await pathExists(canonicalMilestoneDir)) ||
    (await pathExists(legacyMilestoneDir))
  ) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' already exists`);
  }

  await ensureDir(projectMilestoneTaskLaneDir(projectId, phaseId, milestoneId, "planned", cwd));
  await ensureDir(projectMilestoneTaskLaneDir(projectId, phaseId, milestoneId, "discovered", cwd));
  await ensureDir(projectMilestoneTaskLaneDir(projectId, phaseId, milestoneId, "backlog", cwd));
  await ensureDir(projectMilestoneDecisionsRoot(projectId, phaseId, milestoneId, cwd));
  await ensureDecisionIndex(projectMilestoneDecisionsRoot(projectId, phaseId, milestoneId, cwd));

  await ensureDir(path.join(legacyMilestoneDir, "tasks", "planned"));
  await ensureDir(path.join(legacyMilestoneDir, "tasks", "discovered"));
  await ensureDir(path.join(legacyMilestoneDir, "tasks", "backlog"));
  await ensureDir(path.join(legacyMilestoneDir, "decisions"));
  await ensureDecisionIndex(path.join(legacyMilestoneDir, "decisions"));

  const now = currentDateISO();
  const milestoneManifest = {
    schemaVersion: "1.0",
    id: milestoneId,
    phaseId,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonDeterministic(path.join(canonicalMilestoneDir, "manifest.json"), milestoneManifest);
  await writeJsonDeterministic(path.join(legacyMilestoneDir, "manifest.json"), milestoneManifest);

  await writeMarkdownWithFrontmatter(
    projectMilestoneOverviewPath(projectId, phaseId, milestoneId, cwd),
    {
      schemaVersion: "1.0",
      type: "milestone-overview",
      id: milestoneId,
      phaseId,
      createdAt: now,
      updatedAt: now,
    },
    milestoneOverviewTemplate(phaseId, milestoneId),
  );
  await writeMarkdownWithFrontmatter(
    milestoneOverviewPath(phaseId, milestoneId, cwd),
    {
      schemaVersion: "1.0",
      type: "milestone-overview",
      id: milestoneId,
      phaseId,
      createdAt: now,
      updatedAt: now,
    },
    milestoneOverviewTemplate(phaseId, milestoneId),
  );

  const targetsPath = projectMilestoneTargetsPath(projectId, phaseId, milestoneId, cwd);
  if (!(await pathExists(targetsPath))) {
    await fs.writeFile(targetsPath, `${milestoneTargetsTemplate()}\n`, "utf8");
  }
  const legacyTargetsPath = path.join(legacyMilestoneDir, "targets.md");
  if (!(await pathExists(legacyTargetsPath))) {
    await fs.writeFile(legacyTargetsPath, `${milestoneTargetsTemplate()}\n`, "utf8");
  }

  await rebuildArchitectureGraph(cwd);
}

export async function listMilestones(cwd = process.cwd()): Promise<string[]> {
  await assertInitialized(cwd);
  const manifest = await loadPhaseManifest(cwd);
  const milestoneIds = new Set<string>();

  for (const phase of manifest.phases) {
    const phaseMilestoneRoot = path.join(
      cwd,
      "roadmap",
      "projects",
      phase.projectId,
      "phases",
      phase.id,
      "milestones",
    );
    const legacyMilestoneRoot = path.join(cwd, "roadmap", "phases", phase.id, "milestones");
    const milestoneRoot = (await pathExists(phaseMilestoneRoot))
      ? phaseMilestoneRoot
      : legacyMilestoneRoot;
    const dirs = await fg(path.join(milestoneRoot, "*").replace(/\\/g, "/"), {
      onlyDirectories: true,
      absolute: true,
    });

    for (const dir of dirs) {
      milestoneIds.add(`${phase.id}/${path.basename(dir)}`);
    }
  }

  return [...milestoneIds].sort();
}

export async function activateMilestone(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  await assertInitialized(cwd);

  const paths = await resolveMilestoneRuntimePaths(phaseId, milestoneId, cwd);
  const mDir = (await pathExists(paths.canonicalMilestoneDir))
    ? paths.canonicalMilestoneDir
    : paths.legacyMilestoneDir;
  if (!(await pathExists(mDir))) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' does not exist`);
  }

  const diagnostics: string[] = [];

  const plannedTasks = await fg(
    path.join(mDir, "tasks", "planned", "*.md").replace(/\\/g, "/"),
    { onlyFiles: true, absolute: true },
  );
  if (plannedTasks.length === 0) {
    diagnostics.push(
      "at least one planned task is required in roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/tasks/planned",
    );
  }

  const targetsPath = path.join(mDir, "targets.md");
  if (!(await pathExists(targetsPath))) {
    diagnostics.push(
      "targets file is required: roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/targets.md",
    );
  }

  const overviewPath = path.join(mDir, "overview.md");
  if (!(await pathExists(overviewPath))) {
    diagnostics.push(
      "overview file is required: roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/overview.md",
    );
  } else {
    const overview = await fs.readFile(overviewPath, "utf8");
    if (!hasSuccessCriteriaOrChecklist(overview)) {
      diagnostics.push(
        "success criteria/checklist is required in milestone overview (add a 'Success Criteria' section or markdown checklist items '- [ ] ...')",
      );
    }
  }

  if (diagnostics.length > 0) {
    throw new Error(
      [
        `Milestone activation blocked for '${phaseId}/${milestoneId}' due to missing readiness prerequisites:`,
        ...diagnostics.map((item) => `- ${item}`),
      ].join("\n"),
    );
  }

  const manifest = await loadPhaseManifest(cwd);
  manifest.activePhase = phaseId;
  manifest.activeProject = paths.projectId;
  manifest.activeMilestone = milestoneId;
  await savePhaseManifest(manifest, cwd);
  await rebuildArchitectureGraph(cwd);
}

export async function completeMilestone(
  phaseId: string,
  milestoneId: string,
  options: { forceReason?: string } = {},
  cwd = process.cwd(),
): Promise<{ warnings: string[]; overrideLogPath: string | null }> {
  await assertInitialized(cwd);

  const mDir = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  if (!(await pathExists(mDir))) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' does not exist`);
  }

  const reconciliationGate = await evaluateMilestoneReconciliationGate(phaseId, milestoneId, cwd);

  let overrideLogPath: string | null = null;
  if (reconciliationGate.blockers.length > 0) {
    if (!options.forceReason) {
      throw new Error(
        [
          `Milestone completion blocked for '${phaseId}/${milestoneId}' due to reconciliation requirements:`,
          ...reconciliationGate.blockers.map((item) => `- ${item}`),
          'Use --force "<reason>" to bypass and record an override.',
        ].join("\n"),
      );
    }

    overrideLogPath = await appendReconciliationOverrideLog({
      phaseId,
      milestoneId,
      reason: options.forceReason,
      blockers: reconciliationGate.blockers,
      cwd,
    });
  }

  const plannedTasks = await fg(path.join(mDir, "tasks", "planned", "*.md").replace(/\\/g, "/"), {
    onlyFiles: true,
    absolute: true,
  });
  const discoveredTasks = await fg(
    path.join(mDir, "tasks", "discovered", "*.md").replace(/\\/g, "/"),
    {
      onlyFiles: true,
      absolute: true,
    },
  );

  const discoveredRatio = calculateDiscoveredRatioPercent(
    plannedTasks.length,
    discoveredTasks.length,
  );
  const threshold = await resolveDiscoveredLoadThresholdPercent(cwd);

  if (discoveredRatio > threshold) {
    const checkpointPath = path.join(mDir, "replan-checkpoint.md");
    if (!(await pathExists(checkpointPath))) {
      throw new Error(
        [
          `Milestone completion blocked for '${phaseId}/${milestoneId}'.`,
          `Discovered load ratio ${formatPercent(discoveredRatio)} exceeds threshold ${formatPercent(threshold)}.`,
          `Add explicit replan checkpoint marker: roadmap/projects/<project>/phases/${phaseId}/milestones/${milestoneId}/replan-checkpoint.md`,
        ].join("\n"),
      );
    }
  }

  const manifest = await loadPhaseManifest(cwd);
  if (manifest.activePhase === phaseId && manifest.activeMilestone === milestoneId) {
    manifest.activeMilestone = null;
    await savePhaseManifest(manifest, cwd);
  }

  await rebuildArchitectureGraph(cwd);

  return {
    warnings: reconciliationGate.warnings,
    overrideLogPath,
  };
}

export async function getMilestoneStatus(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<MilestoneTaskDependencyStatus[]> {
  await assertInitialized(cwd);

  const mDir = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  if (!(await pathExists(mDir))) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' does not exist`);
  }

  return getMilestoneDependencyStatuses(phaseId, milestoneId, cwd);
}

interface TaskReconciliationState {
  taskId: string;
  title: string;
  status:
    | "no reconciliation needed"
    | "reconciliation suggested"
    | "reconciliation required"
    | "reconciliation complete";
}

interface MilestoneReconciliationGateResult {
  blockers: string[];
  warnings: string[];
}

async function evaluateMilestoneReconciliationGate(
  phaseId: string,
  milestoneId: string,
  cwd: string,
): Promise<MilestoneReconciliationGateResult> {
  const mDir = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  const taskFiles = await fg(milestoneTaskGlob(mDir), {
    absolute: true,
    onlyFiles: true,
  });

  const latestReportByTask = await loadLatestReconciliationReportStatus(cwd);
  const taskStates: TaskReconciliationState[] = [];

  for (const taskFile of taskFiles.sort()) {
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    const task = taskSchema.parse(data);

    const reportStatus = latestReportByTask.get(task.id);
    if (reportStatus) {
      taskStates.push({
        taskId: task.id,
        title: task.title,
        status: reportStatus,
      });
      continue;
    }

    const detection = await detectReconciliationTriggers(
      {
        changedFiles: task.codeTargets,
        taskStatus: task.status,
        codeTargets: task.codeTargets,
        traceLinks: task.traceLinks ?? [],
        evidence: task.evidence ?? [],
        tags: task.tags,
      },
      cwd,
    );

    taskStates.push({
      taskId: task.id,
      title: task.title,
      status: detection.status,
    });
  }

  const blockers = taskStates
    .filter((item) => item.status === "reconciliation required")
    .map((item) => `Task ${item.taskId} (${item.title}) requires reconciliation completion.`);

  const warnings = taskStates
    .filter((item) => item.status === "reconciliation suggested")
    .map((item) => `Task ${item.taskId} (${item.title}) has reconciliation suggested.`);

  return { blockers, warnings };
}

async function loadLatestReconciliationReportStatus(
  cwd: string,
): Promise<
  Map<
    string,
    | "no reconciliation needed"
    | "reconciliation suggested"
    | "reconciliation required"
    | "reconciliation complete"
  >
> {
  const reportFiles = await fg(".project-arch/reconcile/*.json", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  const statusByTask = new Map<
    string,
    {
      status:
        | "no reconciliation needed"
        | "reconciliation suggested"
        | "reconciliation required"
        | "reconciliation complete";
      date: string;
      path: string;
    }
  >();

  for (const reportFile of reportFiles.sort()) {
    try {
      const raw = await fs.readJson(reportFile);
      const parsed = reconciliationReportSchema.safeParse(raw);
      if (!parsed.success || parsed.data.type !== "local-reconciliation") {
        continue;
      }

      const existing = statusByTask.get(parsed.data.taskId);
      const relativePath = path.relative(cwd, reportFile);
      if (!existing) {
        statusByTask.set(parsed.data.taskId, {
          status: parsed.data.status,
          date: parsed.data.date,
          path: relativePath,
        });
      } else {
        const shouldReplace =
          parsed.data.date > existing.date ||
          (parsed.data.date === existing.date && relativePath > existing.path);

        if (shouldReplace) {
          statusByTask.set(parsed.data.taskId, {
            status: parsed.data.status,
            date: parsed.data.date,
            path: relativePath,
          });
        }
      }
    } catch {
      continue;
    }
  }

  const reduced = new Map<
    string,
    | "no reconciliation needed"
    | "reconciliation suggested"
    | "reconciliation required"
    | "reconciliation complete"
  >();

  for (const [taskId, entry] of statusByTask.entries()) {
    reduced.set(taskId, entry.status);
  }

  return reduced;
}

async function appendReconciliationOverrideLog(input: {
  phaseId: string;
  milestoneId: string;
  reason: string;
  blockers: string[];
  cwd: string;
}): Promise<string> {
  const overridesPath = path.join(input.cwd, ".project-arch", "reconcile", "overrides.json");
  await fs.ensureDir(path.dirname(overridesPath));

  const payload = {
    schemaVersion: "1.0",
    overrides: [] as Array<{
      date: string;
      phaseId: string;
      milestoneId: string;
      reason: string;
      blockers: string[];
    }>,
  };

  if (await pathExists(overridesPath)) {
    try {
      const existing = await fs.readJson(overridesPath);
      if (existing && typeof existing === "object" && Array.isArray(existing.overrides)) {
        payload.overrides = existing.overrides;
      }
    } catch {
      // If override log is invalid JSON, rewrite with fresh valid payload.
    }
  }

  payload.overrides.push({
    date: currentDateISO(),
    phaseId: input.phaseId,
    milestoneId: input.milestoneId,
    reason: input.reason,
    blockers: input.blockers,
  });

  await fs.writeJson(overridesPath, payload, { spaces: 2 });
  return overridesPath;
}

function hasSuccessCriteriaOrChecklist(content: string): boolean {
  const hasChecklistItem = /^\s*-\s*\[(?: |x|X)\]\s+.+/m.test(content);
  const hasSuccessCriteriaHeading = /(?:^|\n)#+\s*success criteria\b/i.test(content);
  return hasChecklistItem || hasSuccessCriteriaHeading;
}

function milestoneOverviewTemplate(phaseId: string, milestoneId: string): string {
  if (phaseId === "phase-1" && milestoneId.includes("setup")) {
    return [
      "## Overview",
      "",
      "This milestone prepares the repository, CLI workflow, and docs structure for implementation work.",
      "",
      "## Focus Areas",
      "",
      "- Confirm deterministic CLI generation paths.",
      "- Validate task lanes and ID allocation behavior.",
      "- Ensure decision/documentation linking works and passes checks.",
      "",
    ].join("\n");
  }

  return "## Overview\n\n...\n";
}

function milestoneTargetsTemplate(): string {
  return [
    "# Implementation Targets",
    "",
    "This document defines where implementation for this milestone must occur.",
    "",
    "Agents must consult this file before writing code.",
    "",
    "---",
    "",
    "## Runtime Surfaces",
    "",
    "User-facing functionality must be implemented in:",
    "",
    "- `apps/web`",
    "",
    "Documentation UI must be implemented in:",
    "",
    "- `apps/docs`",
    "",
    "---",
    "",
    "## Shared Modules",
    "",
    "Reusable logic must be implemented in `packages/`.",
    "",
    "- `packages/ui`: UI components and visual primitives.",
    "- `packages/types`: Shared types.",
    "- `packages/database`: Database access.",
    "- `packages/api`: API clients and server adapters.",
    "- `packages/config`: Shared configuration.",
    "",
    "---",
    "",
    "## Placement Rules",
    "",
    "1. UI components: `packages/ui`",
    "2. Shared types: `packages/types`",
    "3. Business logic: `packages/api` or domain packages",
    "4. Database logic: `packages/database`",
    "5. Application routing: `apps/web`",
    "6. Documentation content: `apps/docs`",
    "",
    "---",
    "",
    "## Forbidden Placement",
    "",
    "Agents must not:",
    "",
    "- implement reusable code inside `apps/`",
    "- place UI components inside `packages/api`",
    "- implement database logic inside `apps/`",
    "",
    "Reusable functionality must live in `packages/`.",
    "",
    "---",
    "",
    "## Example Task Mapping",
    "",
    "Example task:",
    "",
    "- `005-complete-architecture-foundation.md`",
    "",
    "Expected changes:",
    "",
    "- `architecture/foundation/*`",
    "- `apps/docs/*`",
    "",
    "Example UI feature:",
    "",
    "- New dashboard component",
    "",
    "Expected implementation:",
    "",
    "- `packages/ui/components/dashboard`",
    "- `apps/web/app/dashboard`",
    "",
  ].join("\n");
}
