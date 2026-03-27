import {
  activateMilestone,
  completeMilestone,
  createMilestone,
  getMilestoneStatus,
  listMilestones,
} from "../core/milestones/createMilestone";
import { loadPhaseManifest, resolvePhaseProjectId } from "../graph/manifests";
import { OperationResult } from "../types/result";
import { assertSafeId } from "../utils/safeId";
import { wrap } from "./_utils";

async function resolveMilestoneProjectId(
  phaseId: string,
  cwd?: string,
  expectedProjectId?: string,
): Promise<string> {
  const manifest = await loadPhaseManifest(cwd);
  const projectId = resolvePhaseProjectId(manifest, phaseId);
  if (expectedProjectId && expectedProjectId !== projectId) {
    throw new Error(
      `Phase '${phaseId}' belongs to project '${projectId}', not '${expectedProjectId}'`,
    );
  }
  return projectId;
}

export async function milestoneCreate(input: {
  phase: string;
  milestone: string;
  project?: string;
  cwd?: string;
}): Promise<OperationResult<{ projectId: string; phase: string; milestone: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    if (input.project) {
      assertSafeId(input.project, "projectId");
    }
    const projectId = await resolveMilestoneProjectId(input.phase, input.cwd, input.project);
    await createMilestone(input.phase, input.milestone, input.cwd);
    return { projectId, phase: input.phase, milestone: input.milestone };
  });
}

export async function milestoneList(input?: {
  project?: string;
  cwd?: string;
}): Promise<
  OperationResult<Array<{ projectId: string; phaseId: string; milestoneId: string }>>
> {
  return wrap(async () => {
    if (input?.project) {
      assertSafeId(input.project, "projectId");
    }
    const manifest = await loadPhaseManifest(input?.cwd);
    const milestones = await listMilestones(input?.cwd);
    return milestones
      .map((entry) => {
        const [phaseId, milestoneId] = entry.split("/", 2);
        const projectId = resolvePhaseProjectId(manifest, phaseId);
        return { projectId, phaseId, milestoneId };
      })
      .filter((entry) => input?.project === undefined || entry.projectId === input.project);
  });
}

export async function milestoneStatus(input: {
  project?: string;
  phase: string;
  milestone: string;
  cwd?: string;
}): Promise<
  OperationResult<{
    projectId: string;
    phase: string;
    milestone: string;
    tasks: Array<{
      id: string;
      title: string;
      lane: "planned" | "discovered" | "backlog";
      status: "todo" | "in_progress" | "blocked" | "done";
      effectiveStatus: "todo" | "in_progress" | "blocked" | "done";
      dependsOn: string[];
      unresolvedDependsOn: string[];
    }>;
  }>
> {
  return wrap(async () => {
    if (input.project) {
      assertSafeId(input.project, "projectId");
    }
    const projectId = await resolveMilestoneProjectId(input.phase, input.cwd, input.project);
    const tasks = await getMilestoneStatus(input.phase, input.milestone, input.cwd);
    return {
      projectId,
      phase: input.phase,
      milestone: input.milestone,
      tasks,
    };
  });
}

export async function milestoneActivate(input: {
  project?: string;
  phase: string;
  milestone: string;
  cwd?: string;
}): Promise<OperationResult<{ projectId: string; phase: string; milestone: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    if (input.project) {
      assertSafeId(input.project, "projectId");
    }
    const projectId = await resolveMilestoneProjectId(input.phase, input.cwd, input.project);
    await activateMilestone(input.phase, input.milestone, input.cwd);
    return { projectId, phase: input.phase, milestone: input.milestone };
  });
}

export async function milestoneComplete(input: {
  project?: string;
  phase: string;
  milestone: string;
  forceReason?: string;
  cwd?: string;
}): Promise<
  OperationResult<{
    projectId: string;
    phase: string;
    milestone: string;
    warnings: string[];
    overrideLogPath: string | null;
  }>
> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    if (input.project) {
      assertSafeId(input.project, "projectId");
    }
    const projectId = await resolveMilestoneProjectId(input.phase, input.cwd, input.project);
    const result = await completeMilestone(
      input.phase,
      input.milestone,
      { forceReason: input.forceReason },
      input.cwd,
    );
    return {
      projectId,
      phase: input.phase,
      milestone: input.milestone,
      warnings: result.warnings,
      overrideLogPath: result.overrideLogPath,
    };
  });
}
