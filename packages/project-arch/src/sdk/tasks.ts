import { createTask, getTaskStatus } from "../core/tasks/createTask";
import { TaskLane } from "../schemas/task";
import { OperationResult } from "../types/result";
import { assertSafeId } from "../utils/safeId";
import { wrap } from "./_utils";

export async function taskCreate(input: {
  phase: string;
  milestone: string;
  title?: string;
  cwd?: string;
}): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    return {
      path: await createTask({
        phaseId: input.phase,
        milestoneId: input.milestone,
        lane: "planned",
        discoveredFromTask: null,
        title: input.title,
        slugBase: input.title,
        cwd: input.cwd,
      }),
    };
  });
}

export async function taskDiscover(input: {
  phase: string;
  milestone: string;
  from: string;
  title?: string;
  cwd?: string;
}): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    return {
      path: await createTask({
        phaseId: input.phase,
        milestoneId: input.milestone,
        lane: "discovered",
        discoveredFromTask: input.from,
        title: input.title,
        slugBase: input.title,
        cwd: input.cwd,
      }),
    };
  });
}

export async function taskIdea(input: {
  phase: string;
  milestone: string;
  title?: string;
  cwd?: string;
}): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => {
    assertSafeId(input.phase, "phaseId");
    assertSafeId(input.milestone, "milestoneId");
    return {
      path: await createTask({
        phaseId: input.phase,
        milestoneId: input.milestone,
        lane: "backlog",
        discoveredFromTask: null,
        title: input.title,
        slugBase: input.title,
        cwd: input.cwd,
      }),
    };
  });
}

export async function taskStatus(input: {
  phase: string;
  milestone: string;
  taskId: string;
  cwd?: string;
}): Promise<OperationResult<{ status: string }>> {
  return wrap(async () => ({
    status: await getTaskStatus(input.phase, input.milestone, input.taskId, input.cwd),
  }));
}

export async function taskCreateInLane(input: {
  phaseId: string;
  milestoneId: string;
  lane: TaskLane;
  discoveredFromTask: string | null;
  title?: string;
  slugBase?: string;
  cwd?: string;
}): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => {
    assertSafeId(input.phaseId, "phaseId");
    assertSafeId(input.milestoneId, "milestoneId");
    return {
      path: await createTask(input),
    };
  });
}
