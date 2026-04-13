import path from "path";
import { ensureDir, pathExists, writeMarkdownWithFrontmatter } from "../../utils/fs";
import { currentDateISO } from "../../utils/date";
import { assertSafeId } from "../../utils/safeId";
import { assertWithinRoot } from "../../utils/assertWithinRoot";
import {
  phaseDecisionsRoot,
  phaseDir,
  projectDocsRoot,
  projectPhaseDecisionsRoot,
  projectPhaseDir,
  projectPhaseMilestonesDir,
  projectPhaseOverviewPath,
  projectPhasesRoot,
} from "../../utils/paths";
import {
  ensureDecisionIndex,
  loadPhaseManifest,
  loadProjectManifest,
  rebuildArchitectureGraph,
  resolvePhaseRecord,
  savePhaseManifest,
} from "../manifests";
import { DEFAULT_PHASE_PROJECT_ID } from "../../schemas/phase";
import { assertSupportedRuntimeCompatibility } from "../runtime/compatibility";

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  const docsRoot = projectDocsRoot(cwd);
  if (!(await pathExists(docsRoot))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
  await assertSupportedRuntimeCompatibility("Phase creation", cwd);
}

export async function createPhase(
  id: string,
  cwd = process.cwd(),
  options: { projectId?: string } = {},
): Promise<void> {
  assertSafeId(id, "phaseId");
  await assertInitialized(cwd);

  const projectId = options.projectId ?? DEFAULT_PHASE_PROJECT_ID;
  await loadProjectManifest(projectId, cwd);

  const manifest = await loadPhaseManifest(cwd);
  const existingPhase = resolvePhaseRecord(manifest, id);
  if (existingPhase) {
    throw new Error(`Phase '${id}' already exists`);
  }

  const now = currentDateISO();
  manifest.phases.push({ id, projectId, createdAt: now });
  manifest.phases.sort((a, b) => a.id.localeCompare(b.id));
  if (!manifest.activePhase) {
    manifest.activeProject = projectId;
    manifest.activePhase = id;
  }
  await savePhaseManifest(manifest, cwd);

  const pDir = projectPhaseDir(projectId, id, cwd);
  assertWithinRoot(pDir, cwd, "phase directory");
  await ensureDir(projectPhasesRoot(projectId, cwd));
  await ensureDir(projectPhaseMilestonesDir(projectId, id, cwd));
  await ensureDir(projectPhaseDecisionsRoot(projectId, id, cwd));
  await ensureDecisionIndex(projectPhaseDecisionsRoot(projectId, id, cwd));

  await writeMarkdownWithFrontmatter(
    projectPhaseOverviewPath(projectId, id, cwd),
    {
      schemaVersion: "2.0",
      type: "phase-overview",
      id,
      createdAt: now,
      updatedAt: now,
    },
    phaseOverviewTemplate(id),
  );

  const legacyPhaseDir = phaseDir(id, cwd);
  assertWithinRoot(legacyPhaseDir, cwd, "phase directory");
  await ensureDir(path.join(legacyPhaseDir, "milestones"));
  await ensureDir(phaseDecisionsRoot(id, cwd));
  await ensureDecisionIndex(phaseDecisionsRoot(id, cwd));

  await writeMarkdownWithFrontmatter(
    path.join(legacyPhaseDir, "overview.md"),
    {
      schemaVersion: "2.0",
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
  options: { projectId?: string } = {},
): Promise<Array<{ id: string; projectId: string; active: boolean }>> {
  await assertInitialized(cwd);
  const manifest = await loadPhaseManifest(cwd);
  return manifest.phases
    .filter((phase) => options.projectId === undefined || phase.projectId === options.projectId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((phase) => ({
      id: phase.id,
      projectId: phase.projectId,
      active: manifest.activePhase === phase.id,
    }));
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
