import fg from "fast-glob";
import { decisionSchema, DecisionFrontmatter } from "../../schemas/decision";
import { readMarkdownWithFrontmatter } from "../../utils/fs";

export interface DecisionRecord {
  filePath: string;
  frontmatter: DecisionFrontmatter;
}

export async function collectDecisionRecords(cwd = process.cwd()): Promise<DecisionRecord[]> {
  const files = await fg("roadmap/decisions/**/*.md", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  const records: DecisionRecord[] = [];

  for (const filePath of files.sort()) {
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);
    const frontmatter = decisionSchema.parse(data);
    records.push({ filePath, frontmatter });
  }

  return records;
}
