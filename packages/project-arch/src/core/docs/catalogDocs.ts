import path from "path";
import fg from "fast-glob";
import { pathExists } from "../../utils/fs";
import { projectDocsRoot } from "../../utils/paths";
import { collectDecisionRecords, type DecisionRecord } from "../validation/decisions";
import { collectTaskRecords, type TaskRecord } from "../validation/tasks";

export type DocsCatalogEntry = {
  path: string;
  category: string;
  exists: boolean;
  discoveredOnDisk: boolean;
  taskRefs: number;
  decisionRefs: number;
};

export type DocsCatalogSummary = {
  total: number;
  existing: number;
  missing: number;
  referenced: number;
  discoveredOnDisk: number;
  taskLinked: number;
  decisionLinked: number;
};

export type DocsCatalog = {
  entries: DocsCatalogEntry[];
  summary: DocsCatalogSummary;
};

function classifyDocPath(docPath: string): string {
  const normalized = docPath.replace(/\\/g, "/");
  if (normalized.startsWith("architecture/")) return "architecture";
  if (normalized.startsWith("docs/")) return "docs";
  if (normalized.startsWith("roadmap/")) return "roadmap";
  return "linked";
}

type MutableDocEntry = {
  path: string;
  category: string;
  discoveredOnDisk: boolean;
  taskRefs: number;
  decisionRefs: number;
};

export async function catalogDocs(cwd = process.cwd()): Promise<DocsCatalog> {
  const entries = new Map<string, MutableDocEntry>();

  function ensureEntry(docPath: string): MutableDocEntry {
    const normalized = docPath.replace(/\\/g, "/");
    const existing = entries.get(normalized);
    if (existing) return existing;

    const created: MutableDocEntry = {
      path: normalized,
      category: classifyDocPath(normalized),
      discoveredOnDisk: false,
      taskRefs: 0,
      decisionRefs: 0,
    };
    entries.set(normalized, created);
    return created;
  }

  const discoveredDocs = await fg(["architecture/**/*.md", "docs/**/*.md"], {
    cwd,
    onlyFiles: true,
    unique: true,
  });

  for (const docPath of discoveredDocs) {
    ensureEntry(docPath).discoveredOnDisk = true;
  }

  let taskRecords: TaskRecord[] = [];
  let decisionRecords: DecisionRecord[] = [];
  if (await pathExists(projectDocsRoot(cwd))) {
    decisionRecords = await collectDecisionRecords(cwd);
    try {
      taskRecords = await collectTaskRecords(cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("legacy-only roadmap runtimes")) {
        throw error;
      }
    }
  }

  for (const task of taskRecords) {
    for (const ref of task.frontmatter.publicDocs) {
      ensureEntry(ref).taskRefs += 1;
    }
  }

  for (const decision of decisionRecords) {
    for (const ref of decision.frontmatter.links.publicDocs) {
      ensureEntry(ref).decisionRefs += 1;
    }
  }

  const resolvedEntries = await Promise.all(
    [...entries.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(async (entry): Promise<DocsCatalogEntry> => ({
        ...entry,
        exists: entry.discoveredOnDisk || (await pathExists(path.join(cwd, entry.path))),
      })),
  );

  return {
    entries: resolvedEntries,
    summary: {
      total: resolvedEntries.length,
      existing: resolvedEntries.filter((entry) => entry.exists).length,
      missing: resolvedEntries.filter((entry) => !entry.exists).length,
      referenced: resolvedEntries.filter((entry) => entry.taskRefs > 0 || entry.decisionRefs > 0)
        .length,
      discoveredOnDisk: resolvedEntries.filter((entry) => entry.discoveredOnDisk).length,
      taskLinked: resolvedEntries.filter((entry) => entry.taskRefs > 0).length,
      decisionLinked: resolvedEntries.filter((entry) => entry.decisionRefs > 0).length,
    },
  };
}
