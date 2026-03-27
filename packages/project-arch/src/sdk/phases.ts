import { createPhase, listPhases } from "../core/phases/createPhase";
import { OperationResult } from "../types/result";
import { assertSafeId } from "../utils/safeId";
import { wrap } from "./_utils";

export async function phaseCreate(input: {
  id: string;
  project?: string;
  cwd?: string;
}): Promise<OperationResult<{ id: string; projectId: string }>> {
  return wrap(async () => {
    assertSafeId(input.id, "phaseId");
    const projectId = input.project ?? "shared";
    assertSafeId(projectId, "projectId");
    await createPhase(input.id, input.cwd, { projectId });
    return { id: input.id, projectId };
  });
}

export async function phaseList(input?: {
  project?: string;
  cwd?: string;
}): Promise<OperationResult<Array<{ id: string; projectId: string; active: boolean }>>> {
  return wrap(async () => {
    if (input?.project) {
      assertSafeId(input.project, "projectId");
    }
    return listPhases(input?.cwd, { projectId: input?.project });
  });
}
