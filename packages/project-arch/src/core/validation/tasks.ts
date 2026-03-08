import path from "path";
import fg from "fast-glob";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
import { idInLaneRange, formatLaneRange, getLaneRangesTable } from "../ids/task";
import { taskSchema, TaskFrontmatter, TaskLane } from "../../schemas/task";

export interface TaskRecord {
  phaseId: string;
  milestoneId: string;
  lane: TaskLane;
  filePath: string;
  frontmatter: TaskFrontmatter;
}

export async function collectTaskRecords(cwd = process.cwd()): Promise<TaskRecord[]> {
  const taskFiles = await fg("roadmap/phases/*/milestones/*/tasks/*/*.md", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  const records: TaskRecord[] = [];

  for (const filePath of taskFiles.sort()) {
    const parts = filePath.split(path.sep);
    const phaseIdx = parts.lastIndexOf("phases");
    if (phaseIdx === -1 || parts.length < phaseIdx + 7) {
      throw new Error(`Invalid task path layout: ${filePath}`);
    }

    const phaseId = parts[phaseIdx + 1];
    const milestoneId = parts[phaseIdx + 3];
    const lane = parts[phaseIdx + 5] as TaskLane;

    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);
    const frontmatter = taskSchema.parse(data);

    const expectedPrefix = `${frontmatter.id}-`;
    const fileName = path.basename(filePath);
    if (!fileName.startsWith(expectedPrefix)) {
      throw new Error(`Task filename must start with '${expectedPrefix}' for ${filePath}`);
    }

    if (!idInLaneRange(frontmatter.id, lane)) {
      const laneRange = formatLaneRange(lane);
      const allRanges = getLaneRangesTable();
      throw new Error(
        `Task ID ${frontmatter.id} is out of range for lane '${lane}'.\n` +
          `  Valid range for ${lane}: ${laneRange}\n\n` +
          `${allRanges}\n\n` +
          `  File: ${filePath}`,
      );
    }

    if (frontmatter.lane !== lane) {
      throw new Error(
        `Task lane mismatch in ${filePath}; frontmatter lane '${frontmatter.lane}' != dir lane '${lane}'`,
      );
    }

    records.push({
      phaseId,
      milestoneId,
      lane,
      filePath,
      frontmatter,
    });
  }

  return records;
}
