import { initializeProject, InitOptions } from "../core/init/initializeProject";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export type { InitOptions };

export async function initRun(
  options: InitOptions,
): Promise<OperationResult<{ initialized: true }>> {
  return wrap(async () => {
    await initializeProject(options);
    return { initialized: true };
  });
}
