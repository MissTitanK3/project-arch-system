import { currentDateISO } from "../../utils/date";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../fs";
import { taskSchema, TaskStatus } from "../../schemas/task";
import path from "path";
import fs from "fs-extra";
import * as graphManifests from "../../graph/manifests";
import { withAtomicTaskMutation } from "./atomicMutation";

export async function updateTaskStatus(
  taskFilePath: string,
  status: TaskStatus,
  cwd = process.cwd(),
): Promise<void> {
  const taskRoot = path.resolve(cwd);
  const absoluteTaskPath = path.resolve(taskFilePath);
  if (!absoluteTaskPath.startsWith(taskRoot)) {
    throw new Error(`Task file '${taskFilePath}' is outside repository root '${cwd}'`);
  }

  const originalContent = await fs.readFile(absoluteTaskPath, "utf8");
  const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFilePath);
  const frontmatter = taskSchema.parse(parsed.data);
  frontmatter.status = status;
  frontmatter.updatedAt = currentDateISO();

  await withAtomicTaskMutation({
    cwd,
    mutateRoadmap: async () => {
      await writeMarkdownWithFrontmatter(taskFilePath, frontmatter, parsed.content);
    },
    rollbackRoadmap: async () => {
      await fs.writeFile(absoluteTaskPath, originalContent, "utf8");
    },
    syncGraph: async () => {
      await graphManifests.rebuildArchitectureGraph(cwd);
    },
  });
}
