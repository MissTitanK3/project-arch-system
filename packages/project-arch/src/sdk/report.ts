import { generateReport } from "../core/reports/generateReport";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function reportGenerate(): Promise<OperationResult<{ text: string }>> {
  return wrap(async () => ({ text: await generateReport() }));
}
