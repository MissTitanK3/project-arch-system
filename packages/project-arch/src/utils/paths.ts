import path from "path";

export function repoRoot(cwd = process.cwd()): string {
  return cwd;
}

export function projectDocsRoot(cwd = process.cwd()): string {
  return path.join(repoRoot(cwd), "roadmap");
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
