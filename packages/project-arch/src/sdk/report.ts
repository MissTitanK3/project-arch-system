import { generateReportData, renderReportData } from "../core/reports/generateReport";
import { OperationResult } from "../types/result";
import { graphRead } from "./graph";
import { wrap } from "./_utils";

export async function reportGenerate(
  input: {
    verbose?: boolean;
    cwd?: string;
  } = {},
): Promise<
  OperationResult<{
    text: string;
    graphSnapshotLoaded: boolean;
    report: Awaited<ReturnType<typeof generateReportData>>;
  }>
> {
  return wrap(async () => {
    const report = await generateReportData(input.cwd);
    return {
      text: renderReportData(report, { verbose: input.verbose }),
      graphSnapshotLoaded: (await graphRead(input.cwd ?? process.cwd())).success,
      report,
    };
  });
}
