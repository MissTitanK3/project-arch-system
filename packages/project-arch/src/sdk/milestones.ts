import {
  activateMilestone,
  completeMilestone,
  createMilestone,
  getMilestoneStatus,
  listMilestones,
} from "../core/milestones/createMilestone";
import { OperationResult } from "../types/result";
import { assertSafeId } from "../utils/safeId";
import { wrap } from "./_utils";

export async function milestoneCreate(input: {
  phase: string;
  milestone: string;
  cwd?: string;
}): Promise<OperationResult<{ phase: string; milestone: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    await createMilestone(input.phase, input.milestone, input.cwd);
    return { phase: input.phase, milestone: input.milestone };
  });
}

export async function milestoneList(input?: { cwd?: string }): Promise<OperationResult<string[]>> {
  return wrap(async () => listMilestones(input?.cwd));
}

export async function milestoneStatus(input: {
  phase: string;
  milestone: string;
  cwd?: string;
}): Promise<
  OperationResult<{
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
    const tasks = await getMilestoneStatus(input.phase, input.milestone, input.cwd);
    return {
      phase: input.phase,
      milestone: input.milestone,
      tasks,
    };
  });
}

export async function milestoneActivate(input: {
  phase: string;
  milestone: string;
  cwd?: string;
}): Promise<OperationResult<{ phase: string; milestone: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    await activateMilestone(input.phase, input.milestone, input.cwd);
    return { phase: input.phase, milestone: input.milestone };
  });
}

export async function milestoneComplete(input: {
  phase: string;
  milestone: string;
  forceReason?: string;
  cwd?: string;
}): Promise<
  OperationResult<{
    phase: string;
    milestone: string;
    warnings: string[];
    overrideLogPath: string | null;
  }>
> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    const result = await completeMilestone(
      input.phase,
      input.milestone,
      { forceReason: input.forceReason },
      input.cwd,
    );
    return {
      phase: input.phase,
      milestone: input.milestone,
      warnings: result.warnings,
      overrideLogPath: result.overrideLogPath,
    };
  });
}
