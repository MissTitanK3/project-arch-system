import {
  createDecision,
  linkDecision,
  listDecisions,
  NewDecisionOptions,
  setDecisionStatus,
  supersedeDecision,
} from "../core/decisions/createDecision";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function decisionCreate(
  input: NewDecisionOptions & { cwd?: string },
): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => ({ path: await createDecision(input, input.cwd) }));
}

export async function decisionLink(input: {
  decisionId: string;
  task?: string;
  code?: string;
  doc?: string;
  cwd?: string;
}): Promise<OperationResult<{ decisionId: string }>> {
  return wrap(async () => {
    await linkDecision(
      input.decisionId,
      { task: input.task, code: input.code, doc: input.doc },
      input.cwd,
    );
    return { decisionId: input.decisionId };
  });
}

export async function decisionStatus(input: {
  decisionId: string;
  status: string;
  cwd?: string;
}): Promise<OperationResult<{ decisionId: string; status: string }>> {
  return wrap(async () => ({
    decisionId: input.decisionId,
    status: await setDecisionStatus(input.decisionId, input.status, input.cwd),
  }));
}

export async function decisionSupersede(input: {
  decisionId: string;
  supersededDecisionId: string;
  cwd?: string;
}): Promise<OperationResult<{ decisionId: string; supersededDecisionId: string }>> {
  return wrap(async () => {
    await supersedeDecision(input.decisionId, input.supersededDecisionId, input.cwd);
    return { decisionId: input.decisionId, supersededDecisionId: input.supersededDecisionId };
  });
}

export async function decisionList(input?: { cwd?: string }): Promise<
  OperationResult<Array<{ id: string; status: string }>>
> {
  return wrap(async () => listDecisions(input?.cwd));
}

export type { NewDecisionOptions };
