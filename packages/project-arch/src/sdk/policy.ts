import { runPolicyChecks, renderPolicyExplanation } from "../core/validation/policy";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function policyCheck(
  input: { cwd?: string } = {},
): Promise<OperationResult<Awaited<ReturnType<typeof runPolicyChecks>>>> {
  return wrap(async () => runPolicyChecks(input.cwd));
}

export async function policyExplain(input: { cwd?: string } = {}): Promise<
  OperationResult<{
    text: string;
    conflicts: Awaited<ReturnType<typeof runPolicyChecks>>["conflicts"];
  }>
> {
  return wrap(async () => {
    const result = await runPolicyChecks(input.cwd);
    return {
      text: renderPolicyExplanation(result.conflicts),
      conflicts: result.conflicts,
    };
  });
}
