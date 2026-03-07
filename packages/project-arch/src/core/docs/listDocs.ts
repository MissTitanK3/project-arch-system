import { collectDecisionRecords } from "../../core/validation/decisions";
import { collectTaskRecords } from "../../core/validation/tasks";

export async function listDocsReferences(cwd = process.cwd()): Promise<string[]> {
  const taskRecords = await collectTaskRecords(cwd);
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
