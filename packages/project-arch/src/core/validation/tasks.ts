import path from "path";
import fg from "fast-glob";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
import { loadPhaseManifest, resolvePhaseProjectId } from "../../graph/manifests";
import { idInLaneRange, formatLaneRange, getLaneRangesTable } from "../ids/task";
import { taskSchema, TaskFrontmatter, TaskLane } from "../../schemas/task";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";
import { pathExists } from "../../utils/fs";
import { phaseMilestonesDir, projectPhaseMilestonesDir } from "../../utils/paths";
import { assertSupportedRuntimeCompatibility } from "../runtime/compatibility";

export interface CollectTaskRecordsOptions {
  /**
   * Called instead of throwing when a single task file fails to parse or
   * fails structural validation (ID range, filename prefix, lane mismatch).
   * When this callback is provided the problematic file is skipped and
   * collection continues with the remaining files.
   */
  onError?: (filePath: string, error: Error) => void;
}

export interface TaskRecord {
  projectId: string;
  phaseId: string;
  milestoneId: string;
  lane: TaskLane;
  filePath: string;
  frontmatter: TaskFrontmatter;
}

export async function collectTaskRecords(
  cwd = process.cwd(),
  opts: CollectTaskRecordsOptions = {},
): Promise<TaskRecord[]> {
  await assertSupportedRuntimeCompatibility("Task collection", cwd);
  const records: TaskRecord[] = [];
  const manifest = await loadPhaseManifest(cwd);

  for (const phase of [...manifest.phases].sort((a, b) => a.id.localeCompare(b.id))) {
    const projectId = resolvePhaseProjectId(manifest, phase.id);
    const canonicalMilestonesRoot = projectPhaseMilestonesDir(projectId, phase.id, cwd);
    const legacyMilestonesRoot = phaseMilestonesDir(phase.id, cwd);
    const milestonesRoot = (await pathExists(canonicalMilestonesRoot))
      ? canonicalMilestonesRoot
      : legacyMilestonesRoot;

    const taskFiles = await fg(path.join(milestonesRoot, "*", "tasks", "*", "*.md"), {
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });
    const safeTaskFiles = await filterGlobPathsBySymlinkPolicy(taskFiles, cwd, {
      pathsAreAbsolute: true,
    });

    for (const filePath of safeTaskFiles.sort()) {
      try {
        const relativeToMilestonesRoot = path.relative(milestonesRoot, filePath);
        const parts = relativeToMilestonesRoot.split(path.sep);
        if (parts.length !== 4 || parts[1] !== "tasks") {
          throw new Error(`Invalid task path layout: ${filePath}`);
        }

        const milestoneId = parts[0];
        const lane = parts[2] as TaskLane;

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
          projectId,
          phaseId: phase.id,
          milestoneId,
          lane,
          filePath,
          frontmatter,
        });
      } catch (error) {
        if (opts.onError) {
          opts.onError(filePath, error instanceof Error ? error : new Error(String(error)));
        } else {
          throw error;
        }
      }
    }
  }

  return records;
}
