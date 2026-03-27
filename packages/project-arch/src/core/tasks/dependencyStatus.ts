import path from "path";
import fg from "fast-glob";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
import { taskSchema, type TaskStatus, type TaskLane } from "../../schemas/task";
import { milestoneTaskGlob, resolvePreferredMilestoneDir } from "../runtime/projectPaths";

export interface MilestoneTaskDependencyStatus {
  id: string;
  title: string;
  lane: TaskLane;
  status: TaskStatus;
  effectiveStatus: TaskStatus;
  dependsOn: string[];
  unresolvedDependsOn: string[];
}

export async function getMilestoneDependencyStatuses(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<MilestoneTaskDependencyStatus[]> {
  const milestoneRoot = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  const files = await fg(milestoneTaskGlob(milestoneRoot), {
    absolute: true,
    onlyFiles: true,
  });

  const tasks: Array<{
    id: string;
    title: string;
    lane: TaskLane;
    status: TaskStatus;
    dependsOn: string[];
  }> = [];

  for (const file of files.sort()) {
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(file);
    const task = taskSchema.parse(data);
    tasks.push({
      id: task.id,
      title: task.title,
      lane: task.lane,
      status: task.status,
      dependsOn: [...(task.dependsOn ?? [])].sort(),
    });
  }

  const statusById = new Map(tasks.map((task) => [task.id, task.status]));

  return tasks
    .map((task) => {
      const unresolvedDependsOn = task.dependsOn.filter((dependencyId) => {
        const dependencyStatus = statusById.get(dependencyId);
        return dependencyStatus !== "done";
      });

      return {
        id: task.id,
        title: task.title,
        lane: task.lane,
        status: task.status,
        effectiveStatus:
          unresolvedDependsOn.length > 0 && task.status !== "done" ? "blocked" : task.status,
        dependsOn: task.dependsOn,
        unresolvedDependsOn,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getTaskIdentityFromTaskPath(
  taskFilePath: string,
  cwd = process.cwd(),
): { phaseId: string; milestoneId: string } {
  const relativePath = path.relative(cwd, taskFilePath).split(path.sep).join("/");
  const match =
    relativePath.match(
      /^roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/(planned|discovered|backlog)\/\d{3}-.+\.md$/,
    ) ??
    relativePath.match(
      /^roadmap\/projects\/[^/]+\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/(planned|discovered|backlog)\/\d{3}-.+\.md$/,
    );

  if (!match) {
    throw new Error(
      "Task file path must be under roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/tasks/<lane>/<id>-<slug>.md or roadmap/phases/<phase>/milestones/<milestone>/tasks/<lane>/<id>-<slug>.md",
    );
  }

  return {
    phaseId: match[1],
    milestoneId: match[2],
  };
}
