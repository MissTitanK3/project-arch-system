import { runRepositoryChecks } from "../../core/validation/check";

export async function runCheck(
  cwd = process.cwd(),
): Promise<{ ok: boolean; errors: string[]; warnings: string[] }> {
  return runRepositoryChecks(cwd);
}
