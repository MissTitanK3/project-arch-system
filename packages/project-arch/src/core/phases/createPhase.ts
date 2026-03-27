import path from "path";
import { ensureDir, pathExists, writeMarkdownWithFrontmatter } from "../../utils/fs";
import { currentDateISO } from "../../utils/date";
import { assertSafeId } from "../../utils/safeId";
import { assertWithinRoot } from "../../utils/assertWithinRoot";
import { phaseDir, projectDocsRoot } from "../../utils/paths";
import {
  ensureDecisionIndex,
  loadPhaseManifest,
  phaseOverviewPath,
  rebuildArchitectureGraph,
  savePhaseManifest,
} from "../../graph/manifests";

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  const docsRoot = projectDocsRoot(cwd);
  if (!(await pathExists(docsRoot))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
}

export async function createPhase(id: string, cwd = process.cwd()): Promise<void> {
  assertSafeId(id, "phaseId");
  await assertInitialized(cwd);

  const manifest = await loadPhaseManifest(cwd);
  if (manifest.phases.some((phase) => phase.id === id)) {
    throw new Error(`Phase '${id}' already exists`);
  }

  const now = currentDateISO();
  manifest.phases.push({ id, createdAt: now });
  manifest.phases.sort((a, b) => a.id.localeCompare(b.id));
  if (!manifest.activePhase) {
    manifest.activePhase = id;
  }
  await savePhaseManifest(manifest, cwd);

  const pDir = phaseDir(id, cwd);
  assertWithinRoot(pDir, cwd, "phase directory");
  await ensureDir(path.join(pDir, "milestones"));
  await ensureDir(path.join(pDir, "decisions"));
  await ensureDecisionIndex(path.join(pDir, "decisions"));

  await writeMarkdownWithFrontmatter(
    phaseOverviewPath(id, cwd),
    {
      schemaVersion: "1.0",
      type: "phase-overview",
      id,
      createdAt: now,
      updatedAt: now,
    },
    phaseOverviewTemplate(id),
  );

  await rebuildArchitectureGraph(cwd);
}

export async function listPhases(
  cwd = process.cwd(),
): Promise<Array<{ id: string; active: boolean }>> {
  await assertInitialized(cwd);
  const manifest = await loadPhaseManifest(cwd);
  return manifest.phases
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((phase) => ({ id: phase.id, active: manifest.activePhase === phase.id }));
}

function phaseOverviewTemplate(phaseId: string): string {
  if (phaseId === "phase-1") {
    return [
      "## Overview",
      "",
      "Phase 1 establishes a working project baseline so implementation can start safely and predictably.",
      "",
      "## Outcomes",
      "",
      "- Repository structure is initialized and consistent.",
      "- CLI workflows are validated end-to-end.",
      "- Core documentation paths exist and are linked from tasks/decisions.",
      "",
      "## Exit Criteria",
      "",
      "- `pa check` passes with no errors.",
      "- At least one setup milestone is complete.",
      "- Team can begin feature milestones using the same process.",
      "",
    ].join("\n");
  }

  return "## Overview\n\n...\n";
}
