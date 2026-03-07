import { runCheck } from "../core/checks/runCheck";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function checkRun(): Promise<
  OperationResult<{ ok: boolean; errors: string[]; warnings: string[] }>
> {
  return wrap(async () => runCheck());
}
