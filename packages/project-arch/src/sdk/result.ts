import type { OperationResult } from "../types/result";
import { wrap } from "./_utils";
import {
  importAgentResult,
  type ImportAgentResultOptions,
  type ImportAgentResultResult,
} from "../core/agentRuntime/resultImport";

export type ResultImportOptions = ImportAgentResultOptions;
export type ResultImportResult = ImportAgentResultResult;

export async function resultImport(
  input: ResultImportOptions,
): Promise<OperationResult<ResultImportResult>> {
  return wrap(async () => importAgentResult(input));
}
