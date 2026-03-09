import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import {
  ensureDir,
  pathExists,
  writeJsonDeterministic,
  writeMarkdownWithFrontmatter,
} from "../../fs";
import { currentDateISO } from "../../utils/date";
import { milestoneDir, phaseDir, projectDocsRoot } from "../../utils/paths";
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
  savePhaseManifest,
} from "../../graph/manifests";

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  if (!(await pathExists(projectDocsRoot(cwd)))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
}

export async function createMilestone(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  await assertInitialized(cwd);

  const pDir = phaseDir(phaseId, cwd);
  if (!(await pathExists(pDir))) {
    throw new Error(`Phase '${phaseId}' does not exist`);
  }

  const mDir = milestoneDir(phaseId, milestoneId, cwd);
  if (await pathExists(mDir)) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' already exists`);
  }

  await ensureDir(path.join(mDir, "tasks", "planned"));
  await ensureDir(path.join(mDir, "tasks", "discovered"));
  await ensureDir(path.join(mDir, "tasks", "backlog"));
  await ensureDir(path.join(mDir, "decisions"));
  await ensureDecisionIndex(path.join(mDir, "decisions"));

  const now = currentDateISO();
  await writeJsonDeterministic(path.join(mDir, "manifest.json"), {
    schemaVersion: "1.0",
    id: milestoneId,
    phaseId,
    createdAt: now,
    updatedAt: now,
  });

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

  const targetsPath = path.join(mDir, "targets.md");
  if (!(await pathExists(targetsPath))) {
    await fs.writeFile(targetsPath, `${milestoneTargetsTemplate()}\n`, "utf8");
  }

  await rebuildArchitectureGraph(cwd);
}

export async function listMilestones(cwd = process.cwd()): Promise<string[]> {
  await assertInitialized(cwd);
  const milestoneDirs = await fg("roadmap/phases/*/milestones/*", { cwd, onlyDirectories: true });
  return milestoneDirs.sort().map((item) => {
    const parts = item.split("/");
    return `${parts[2]}/${parts[4]}`;
  });
}

export async function activateMilestone(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  await assertInitialized(cwd);

  const mDir = milestoneDir(phaseId, milestoneId, cwd);
  if (!(await pathExists(mDir))) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' does not exist`);
  }

  const diagnostics: string[] = [];

  const plannedTasks = await fg(
    `roadmap/phases/${phaseId}/milestones/${milestoneId}/tasks/planned/*.md`,
    {
      cwd,
      onlyFiles: true,
    },
  );
  if (plannedTasks.length === 0) {
    diagnostics.push(
      "at least one planned task is required in roadmap/phases/<phase>/milestones/<milestone>/tasks/planned",
    );
  }

  const targetsPath = path.join(mDir, "targets.md");
  if (!(await pathExists(targetsPath))) {
    diagnostics.push(
      "targets file is required: roadmap/phases/<phase>/milestones/<milestone>/targets.md",
    );
  }

  const overviewPath = milestoneOverviewPath(phaseId, milestoneId, cwd);
  if (!(await pathExists(overviewPath))) {
    diagnostics.push(
      "overview file is required: roadmap/phases/<phase>/milestones/<milestone>/overview.md",
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
  const phaseExists = manifest.phases.some((phase) => phase.id === phaseId);
  if (!phaseExists) {
    throw new Error(`Phase '${phaseId}' does not exist in roadmap/manifest.json`);
  }

  manifest.activePhase = phaseId;
  manifest.activeMilestone = milestoneId;
  await savePhaseManifest(manifest, cwd);
  await rebuildArchitectureGraph(cwd);
}

export async function completeMilestone(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  await assertInitialized(cwd);

  const mDir = milestoneDir(phaseId, milestoneId, cwd);
  if (!(await pathExists(mDir))) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' does not exist`);
  }

  const plannedTasks = await fg(
    `roadmap/phases/${phaseId}/milestones/${milestoneId}/tasks/planned/*.md`,
    {
      cwd,
      onlyFiles: true,
    },
  );
  const discoveredTasks = await fg(
    `roadmap/phases/${phaseId}/milestones/${milestoneId}/tasks/discovered/*.md`,
    {
      cwd,
      onlyFiles: true,
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
          `Add explicit replan checkpoint marker: roadmap/phases/${phaseId}/milestones/${milestoneId}/replan-checkpoint.md`,
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
