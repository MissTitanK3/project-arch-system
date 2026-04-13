import { resolveContext } from "../core/context/resolveContext";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function contextResolve(
  input: { cwd?: string } = {},
): Promise<OperationResult<Awaited<ReturnType<typeof resolveContext>>>> {
  return wrap(async () => resolveContext(input.cwd ?? process.cwd()));
}
