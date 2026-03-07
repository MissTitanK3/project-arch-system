import { createMilestone, listMilestones } from "../core/milestones/createMilestone";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function milestoneCreate(input: {
  phase: string;
  milestone: string;
}): Promise<OperationResult<{ phase: string; milestone: string }>> {
  return wrap(async () => {
    await createMilestone(input.phase, input.milestone);
    return { phase: input.phase, milestone: input.milestone };
  });
}

export async function milestoneList(): Promise<OperationResult<string[]>> {
  return wrap(async () => listMilestones());
}
