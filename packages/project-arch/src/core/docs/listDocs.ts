import { pathExists } from "../../utils/fs";
import { projectDocsRoot } from "../../utils/paths";
import { collectDecisionRecords } from "../../core/validation/decisions";
import { collectTaskRecords, type TaskRecord } from "../../core/validation/tasks";

export async function listDocsReferences(cwd = process.cwd()): Promise<string[]> {
  if (!(await pathExists(projectDocsRoot(cwd)))) {
    return [];
  }

  let taskRecords: TaskRecord[] = [];
  try {
    taskRecords = await collectTaskRecords(cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("legacy-only roadmap runtimes")) {
      throw error;
    }
  }
  const decisionRecords = await collectDecisionRecords(cwd);
  const refs = new Set<string>();

  for (const task of taskRecords) {
    for (const ref of task.frontmatter.publicDocs) {
      refs.add(ref);
    }
  }

  for (const decision of decisionRecords) {
    for (const ref of decision.frontmatter.links.publicDocs) {
      refs.add(ref);
    }
  }

  return [...refs].sort();
}
