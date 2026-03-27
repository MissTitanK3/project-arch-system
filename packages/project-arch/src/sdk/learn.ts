import { learnPath as resolveLearnPath, renderLearnReport } from "../core/learn/learnPath";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function learnPath(
  input: { paths: string[]; cwd?: string },
): Promise<
  OperationResult<{
    text: string;
    report: Awaited<ReturnType<typeof resolveLearnPath>>;
  }>
> {
  return wrap(async () => {
    const report = await resolveLearnPath({ paths: input.paths }, input.cwd ?? process.cwd());
    return {
      text: renderLearnReport(report),
      report,
    };
  });
}
