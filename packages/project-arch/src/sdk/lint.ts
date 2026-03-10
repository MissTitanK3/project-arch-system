import { runFrontmatterLint } from "../core/checks/runFrontmatterLint";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function lintFrontmatterRun(options?: { cwd?: string; fix?: boolean }): Promise<
  OperationResult<{
    ok: boolean;
    scannedFiles: number;
    fixedFiles: number;
    diagnostics: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
      path: string;
      line: number;
    }>;
  }>
> {
  return wrap(async () => runFrontmatterLint(options));
}
