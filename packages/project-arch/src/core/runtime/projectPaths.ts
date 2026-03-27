import path from "path";
import { loadPhaseManifest, resolvePhaseProjectId, resolvePhaseRecord } from "../manifests";
import { assertSupportedRuntimeCompatibility } from "./compatibility";
import {
  milestoneDir,
  milestoneTaskLaneDir,
  phaseDir,
  projectMilestoneDir,
  projectMilestoneTaskLaneDir,
  projectPhaseDir,
} from "../../utils/paths";
import { pathExists } from "../../utils/fs";
import type { TaskLane } from "../../schemas/task";

export interface PhaseRuntimePaths {
  projectId: string;
  canonicalPhaseDir: string;
  legacyPhaseDir: string;
}

export interface MilestoneRuntimePaths extends PhaseRuntimePaths {
  canonicalMilestoneDir: string;
  legacyMilestoneDir: string;
}

export async function resolvePhaseRuntimePaths(
  phaseId: string,
  cwd = process.cwd(),
): Promise<PhaseRuntimePaths> {
  await assertSupportedRuntimeCompatibility("Phase runtime resolution", cwd);
  const manifest = await loadPhaseManifest(cwd);
  const phaseRecord = resolvePhaseRecord(manifest, phaseId);
  if (!phaseRecord) {
    throw new Error(`Phase '${phaseId}' does not exist in roadmap/manifest.json`);
  }

  const projectId = resolvePhaseProjectId(manifest, phaseId);
  return {
    projectId,
    canonicalPhaseDir: projectPhaseDir(projectId, phaseId, cwd),
    legacyPhaseDir: phaseDir(phaseId, cwd),
  };
}

export async function resolveMilestoneRuntimePaths(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<MilestoneRuntimePaths> {
  const phasePaths = await resolvePhaseRuntimePaths(phaseId, cwd);
  return {
    ...phasePaths,
    canonicalMilestoneDir: projectMilestoneDir(phasePaths.projectId, phaseId, milestoneId, cwd),
    legacyMilestoneDir: milestoneDir(phaseId, milestoneId, cwd),
  };
}

export async function resolvePreferredMilestoneDir(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<string> {
  const paths = await resolveMilestoneRuntimePaths(phaseId, milestoneId, cwd);
  if (await pathExists(paths.canonicalMilestoneDir)) {
    return paths.canonicalMilestoneDir;
  }
  return paths.legacyMilestoneDir;
}

export async function resolvePreferredTaskLaneDir(
  phaseId: string,
  milestoneId: string,
  lane: TaskLane,
  cwd = process.cwd(),
): Promise<string> {
  const paths = await resolveMilestoneRuntimePaths(phaseId, milestoneId, cwd);
  const canonicalLaneDir = projectMilestoneTaskLaneDir(
    paths.projectId,
    phaseId,
    milestoneId,
    lane,
    cwd,
  );
  if (await pathExists(canonicalLaneDir)) {
    return canonicalLaneDir;
  }
  return milestoneTaskLaneDir(phaseId, milestoneId, lane, cwd);
}

export function milestoneTaskGlob(milestoneRoot: string): string {
  return path.join(milestoneRoot, "tasks", "*", "*.md").replace(/\\/g, "/");
}

export function taskIdGlob(milestoneRoot: string, taskId: string): string {
  return path.join(milestoneRoot, "tasks", "*", `${taskId}-*.md`).replace(/\\/g, "/");
}
