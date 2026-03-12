import { runRepositoryChecks } from "../../core/validation/check";

export interface RunCheckOptions {
  failFast?: boolean;
}

export async function runCheck(
  cwd = process.cwd(),
  options: RunCheckOptions = {},
): Promise<{
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
}> {
  return runRepositoryChecks(cwd, { failFast: options.failFast });
}
