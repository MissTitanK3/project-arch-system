import fg from "fast-glob";
import path from "path";
import { decisionSchema, DecisionFrontmatter } from "../../schemas/decision";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";

export interface DecisionRecord {
  filePath: string;
  frontmatter: DecisionFrontmatter;
}

export async function collectDecisionRecords(cwd = process.cwd()): Promise<DecisionRecord[]> {
  const files = await fg("roadmap/decisions/**/*.md", {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  const safeFiles = await filterGlobPathsBySymlinkPolicy(files, cwd, {
    pathsAreAbsolute: true,
  });

  const records: DecisionRecord[] = [];

  for (const filePath of safeFiles.sort()) {
    try {
      const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);
      const frontmatter = decisionSchema.parse(data);
      records.push({ filePath, frontmatter });
    } catch (error) {
      // Skip decisions with invalid schema but log the error
      const relativePath = path.relative(cwd, filePath);
      console.warn(`Warning: Skipping decision with invalid schema: ${relativePath}`);
      if (error instanceof Error) {
        console.warn(`  Error: ${error.message}`);
      }
      // Decision is skipped but collection continues
    }
  }

  return records;
}
