import path from "path";

export function repoRoot(cwd = process.cwd()): string {
  return cwd;
}

export function projectDocsRoot(cwd = process.cwd()): string {
  return path.join(repoRoot(cwd), "roadmap");
}

export function projectsRoot(cwd = process.cwd()): string {
  return path.join(projectDocsRoot(cwd), "projects");
}

export function projectDir(projectId: string, cwd = process.cwd()): string {
  return path.join(projectsRoot(cwd), projectId);
}

export function projectManifestPath(projectId: string, cwd = process.cwd()): string {
  return path.join(projectDir(projectId, cwd), "manifest.json");
}

export function projectOverviewPath(projectId: string, cwd = process.cwd()): string {
  return path.join(projectDir(projectId, cwd), "overview.md");
}

export function projectPhasesRoot(projectId: string, cwd = process.cwd()): string {
  return path.join(projectDir(projectId, cwd), "phases");
}

export function projectPhaseDir(projectId: string, phaseId: string, cwd = process.cwd()): string {
  return path.join(projectPhasesRoot(projectId, cwd), phaseId);
}

export function projectPhaseOverviewPath(
  projectId: string,
  phaseId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectPhaseDir(projectId, phaseId, cwd), "overview.md");
}

export function projectPhaseValidationContractPath(
  projectId: string,
  phaseId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectPhaseDir(projectId, phaseId, cwd), "validation-contract.json");
}

export function projectPhaseMilestonesDir(
  projectId: string,
  phaseId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectPhaseDir(projectId, phaseId, cwd), "milestones");
}

export function projectPhaseDecisionsRoot(
  projectId: string,
  phaseId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectPhaseDir(projectId, phaseId, cwd), "decisions");
}

export function projectMilestoneDir(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectPhaseMilestonesDir(projectId, phaseId, cwd), milestoneId);
}

export function projectMilestoneOverviewPath(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectMilestoneDir(projectId, phaseId, milestoneId, cwd), "overview.md");
}

export function projectMilestoneTargetsPath(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectMilestoneDir(projectId, phaseId, milestoneId, cwd), "targets.md");
}

export function projectMilestoneTasksRoot(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectMilestoneDir(projectId, phaseId, milestoneId, cwd), "tasks");
}

export function projectMilestoneTaskLaneDir(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  lane: "planned" | "discovered" | "backlog",
  cwd = process.cwd(),
): string {
  return path.join(projectMilestoneTasksRoot(projectId, phaseId, milestoneId, cwd), lane);
}

export function projectMilestoneDecisionsRoot(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(projectMilestoneDir(projectId, phaseId, milestoneId, cwd), "decisions");
}

export function phasesRoot(cwd = process.cwd()): string {
  return path.join(projectDocsRoot(cwd), "phases");
}

export function decisionsRoot(cwd = process.cwd()): string {
  return path.join(projectDocsRoot(cwd), "decisions");
}

export function phaseDir(phaseId: string, cwd = process.cwd()): string {
  return path.join(phasesRoot(cwd), phaseId);
}

export function phaseMilestonesDir(phaseId: string, cwd = process.cwd()): string {
  return path.join(phaseDir(phaseId, cwd), "milestones");
}

export function milestoneDir(phaseId: string, milestoneId: string, cwd = process.cwd()): string {
  return path.join(phaseMilestonesDir(phaseId, cwd), milestoneId);
}

export function milestoneTasksRoot(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(milestoneDir(phaseId, milestoneId, cwd), "tasks");
}

export function milestoneTaskLaneDir(
  phaseId: string,
  milestoneId: string,
  lane: "planned" | "discovered" | "backlog",
  cwd = process.cwd(),
): string {
  return path.join(milestoneTasksRoot(phaseId, milestoneId, cwd), lane);
}

export function milestoneDecisionsRoot(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(milestoneDir(phaseId, milestoneId, cwd), "decisions");
}

export function phaseDecisionsRoot(phaseId: string, cwd = process.cwd()): string {
  return path.join(phaseDir(phaseId, cwd), "decisions");
}
