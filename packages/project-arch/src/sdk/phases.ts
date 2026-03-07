import { createPhase, listPhases } from "../core/phases/createPhase";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function phaseCreate(input: { id: string; cwd?: string }): Promise<OperationResult<{ id: string }>> {
  return wrap(async () => {
    await createPhase(input.id, input.cwd);
    return { id: input.id };
  });
}

export async function phaseList(input?: { cwd?: string }): Promise<
  OperationResult<Array<{ id: string; active: boolean }>>
> {
  return wrap(async () => listPhases(input?.cwd));
}
