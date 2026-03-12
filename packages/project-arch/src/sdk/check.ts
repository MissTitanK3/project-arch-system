import { runCheck } from "../core/checks/runCheck";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export interface CheckRunOptions {
  failFast?: boolean;
}

export async function checkRun(options: CheckRunOptions = {}): Promise<
  OperationResult<{
    ok: boolean;
    errors: string[];
    warnings: string[];
    diagnostics: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
      path: string | null;
      hint: string | null;
    }>;
  }>
> {
  return wrap(async () => runCheck(process.cwd(), { failFast: options.failFast }));
}
