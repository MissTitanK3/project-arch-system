import { OperationResult } from "../types/result";

export function ok<T>(data: T): OperationResult<T> {
  return { success: true, data };
}

export function fail<T = never>(error: unknown): OperationResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, errors: [message] };
}

export async function wrap<T>(operation: () => Promise<T>): Promise<OperationResult<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return fail(error);
  }
}

export function unwrap<T>(result: OperationResult<T>): T {
  if (result.success && result.data !== undefined) {
    return result.data;
  }
  throw new Error(result.errors?.join("; ") ?? "Operation failed");
}
