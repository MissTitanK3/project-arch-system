import { catalogDocs, type DocsCatalog } from "../core/docs/catalogDocs";
import { listDocsReferences } from "../core/docs/listDocs";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function docsList(): Promise<OperationResult<{ refs: string[] }>> {
  return wrap(async () => ({ refs: await listDocsReferences() }));
}

export async function docsCatalog(options?: {
  linkedOnly?: boolean;
}): Promise<OperationResult<DocsCatalog>> {
  return wrap(async () => {
    const catalog = await catalogDocs();
    if (!options?.linkedOnly) {
      return catalog;
    }

    const entries = catalog.entries.filter((entry) => entry.taskRefs > 0 || entry.decisionRefs > 0);
    return {
      entries,
      summary: {
        total: entries.length,
        existing: entries.filter((entry) => entry.exists).length,
        missing: entries.filter((entry) => !entry.exists).length,
        referenced: entries.length,
        discoveredOnDisk: entries.filter((entry) => entry.discoveredOnDisk).length,
        taskLinked: entries.filter((entry) => entry.taskRefs > 0).length,
        decisionLinked: entries.filter((entry) => entry.decisionRefs > 0).length,
      },
    };
  });
}
