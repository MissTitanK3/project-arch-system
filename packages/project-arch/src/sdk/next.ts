import { resolveNextWorkflow } from "../core/workflow/next";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function nextResolve(input: { cwd?: string } = {}): Promise<
  OperationResult<{
    status:
      | "needs_init"
      | "needs_check"
      | "needs_verification"
      | "needs_reconciliation"
      | "healthy_noop";
    recommendedCommand: string;
    reason: string;
    evidence: string[];
  }>
> {
  return wrap(async () => resolveNextWorkflow(input.cwd ?? process.cwd()));
}
