import { currentDateISO } from "../../utils/date";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../fs";
import { taskSchema, TaskStatus } from "../../schemas/task";
import { rebuildArchitectureGraph } from "../../graph/manifests";

export async function updateTaskStatus(taskFilePath: string, status: TaskStatus): Promise<void> {
  const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFilePath);
  const frontmatter = taskSchema.parse(parsed.data);
  frontmatter.status = status;
  frontmatter.updatedAt = currentDateISO();
  await writeMarkdownWithFrontmatter(taskFilePath, frontmatter, parsed.content);
  await rebuildArchitectureGraph();
}
