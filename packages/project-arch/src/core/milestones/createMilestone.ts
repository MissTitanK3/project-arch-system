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
  ensureDecisionIndex,
  milestoneOverviewPath,
  rebuildArchitectureGraph,
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
