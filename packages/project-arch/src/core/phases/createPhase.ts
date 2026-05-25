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

type PhaseWritePlan = {
  now: string;
  projectId: string;
  phaseId: string;
  canonicalPhaseDir: string;
  legacyPhaseDir: string;
};

function planPhaseWrite(input: {
  phaseId: string;
  projectId: string;
  cwd: string;
  now: string;
}): PhaseWritePlan {
  return {
    now: input.now,
    projectId: input.projectId,
    phaseId: input.phaseId,
    canonicalPhaseDir: projectPhaseDir(input.projectId, input.phaseId, input.cwd),
    legacyPhaseDir: phaseDir(input.phaseId, input.cwd),
  };
}

async function writeCanonicalPhaseScaffold(plan: PhaseWritePlan, cwd: string): Promise<void> {
  assertWithinRoot(plan.canonicalPhaseDir, cwd, "phase directory");
  await ensureDir(projectPhasesRoot(plan.projectId, cwd));
  await ensureDir(projectPhaseMilestonesDir(plan.projectId, plan.phaseId, cwd));
  await ensureDir(projectPhaseDecisionsRoot(plan.projectId, plan.phaseId, cwd));
  await ensureDecisionIndex(projectPhaseDecisionsRoot(plan.projectId, plan.phaseId, cwd));

  await writeMarkdownWithFrontmatter(
    projectPhaseOverviewPath(plan.projectId, plan.phaseId, cwd),
    {
      schemaVersion: "2.0",
      type: "phase-overview",
      id: plan.phaseId,
      createdAt: plan.now,
      updatedAt: plan.now,
    },
    phaseOverviewTemplate(plan.phaseId),
  );
}

async function writeCompatibilityPhaseScaffold(plan: PhaseWritePlan, cwd: string): Promise<void> {
  assertWithinRoot(plan.legacyPhaseDir, cwd, "phase directory");
  await ensureDir(path.join(plan.legacyPhaseDir, "milestones"));
  await ensureDir(phaseDecisionsRoot(plan.phaseId, cwd));
  await ensureDecisionIndex(phaseDecisionsRoot(plan.phaseId, cwd));

  await writeMarkdownWithFrontmatter(
    path.join(plan.legacyPhaseDir, "overview.md"),
    {
      schemaVersion: "2.0",
      type: "phase-overview",
      id: plan.phaseId,
      createdAt: plan.now,
      updatedAt: plan.now,
    },
    phaseOverviewTemplate(plan.phaseId),
  );
}

export async function createPhase(
  id: string,
  cwd = process.cwd(),
  options: { projectId?: string; compatibilityLegacyWrite?: boolean } = {},
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

  const plan = planPhaseWrite({ phaseId: id, projectId, cwd, now });
  const shouldWriteCompatibilityLegacy = options.compatibilityLegacyWrite ?? false;

  await writeCanonicalPhaseScaffold(plan, cwd);
  if (shouldWriteCompatibilityLegacy) {
    await writeCompatibilityPhaseScaffold(plan, cwd);
  }

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
