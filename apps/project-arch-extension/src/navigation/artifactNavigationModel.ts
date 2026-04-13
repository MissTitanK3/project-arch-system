import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createTaskWorkflowMetadataBoundary,
  type ParsedTaskWorkflowMetadata,
} from "../integration/taskWorkflowMetadataBoundary";

export type ArtifactKind = "task" | "run" | "diff" | "audit";

type NormalizedTaskWorkflow = NonNullable<ParsedTaskWorkflowMetadata["taskWorkflow"]>;

export interface ArtifactNavigationEntry {
  kind: ArtifactKind;
  relativePath: string;
  label: string;
  description?: string;
  taskWorkflow?: NormalizedTaskWorkflow;
}

export interface ArtifactNavigationGroup {
  kind: ArtifactKind;
  label: string;
  entries: ArtifactNavigationEntry[];
}

export interface ArtifactNavigationModel {
  workspaceRoot: string;
  generatedAt: string;
  groups: ArtifactNavigationGroup[];
}

const GROUP_LABELS: Record<ArtifactKind, string> = {
  task: "Tasks",
  run: "Runs",
  diff: "Diffs",
  audit: "Audits",
};

const taskWorkflowMetadataBoundary = createTaskWorkflowMetadataBoundary();

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const output: string[] = [];
  if (!(await pathExists(rootDir))) {
    return output;
  }

  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        output.push(fullPath);
      }
    }
  }

  return output;
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

async function collectTaskEntries(workspaceRoot: string): Promise<ArtifactNavigationEntry[]> {
  const candidates = [path.join(workspaceRoot, "feedback"), path.join(workspaceRoot, "roadmap")];
  const taskEntries: ArtifactNavigationEntry[] = [];

  for (const candidateRoot of candidates) {
    const files = await walkFiles(candidateRoot);
    for (const absolutePath of files) {
      const relativePath = toRelativePath(workspaceRoot, absolutePath);
      if (!relativePath.endsWith(".md") || !relativePath.includes("/tasks/")) {
        continue;
      }

      const content = await fs.readFile(absolutePath, "utf8");
      const parsedMetadata = taskWorkflowMetadataBoundary.parseTaskWorkflowMetadata({
        content,
        absolutePath,
        workspaceRoot,
      });
      const basename = path.basename(relativePath, ".md");
      const taskId = parsedMetadata.taskId;
      const title = parsedMetadata.title;
      const lane = parsedMetadata.lane;
      const status = parsedMetadata.status;

      taskEntries.push({
        kind: "task",
        relativePath,
        label: taskId && title ? `${taskId} ${title}` : (title ?? basename),
        description: [lane, status].filter(Boolean).join(" • ") || undefined,
        ...(parsedMetadata.taskWorkflow ? { taskWorkflow: parsedMetadata.taskWorkflow } : {}),
      });
    }
  }

  return taskEntries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function collectDirectoryEntries(input: {
  workspaceRoot: string;
  kind: ArtifactKind;
  directory: string;
  labelFromPath?: (relativePath: string) => string;
  includePath?: (relativePath: string) => boolean;
}): Promise<ArtifactNavigationEntry[]> {
  const targetDir = path.join(input.workspaceRoot, input.directory);
  const files = await walkFiles(targetDir);

  return files
    .map((absolutePath) => toRelativePath(input.workspaceRoot, absolutePath))
    .filter((relativePath) => (input.includePath ? input.includePath(relativePath) : true))
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => ({
      kind: input.kind,
      relativePath,
      label: input.labelFromPath ? input.labelFromPath(relativePath) : path.basename(relativePath),
    }));
}

export async function buildArtifactNavigationModel(
  workspaceRoot: string,
): Promise<ArtifactNavigationModel> {
  const tasks = await collectTaskEntries(workspaceRoot);
  const runs = await collectDirectoryEntries({
    workspaceRoot,
    kind: "run",
    directory: ".project-arch/agent-runtime/runs",
    includePath: (relativePath) => relativePath.endsWith(".json"),
    labelFromPath: (relativePath) => path.basename(relativePath, ".json"),
  });

  const diffs = await collectDirectoryEntries({
    workspaceRoot,
    kind: "diff",
    directory: ".project-arch/reconcile",
    includePath: (relativePath) => relativePath.endsWith(".md") || relativePath.endsWith(".json"),
    labelFromPath: (relativePath) => path.basename(relativePath),
  });

  const audits = await collectDirectoryEntries({
    workspaceRoot,
    kind: "audit",
    directory: ".project-arch/agent-runtime/logs",
    includePath: (relativePath) =>
      relativePath.endsWith(".jsonl") ||
      relativePath.endsWith(".json") ||
      relativePath.endsWith(".log"),
    labelFromPath: (relativePath) => path.basename(relativePath),
  });

  return {
    workspaceRoot,
    generatedAt: new Date().toISOString(),
    groups: [
      { kind: "task", label: GROUP_LABELS.task, entries: tasks },
      { kind: "run", label: GROUP_LABELS.run, entries: runs },
      { kind: "diff", label: GROUP_LABELS.diff, entries: diffs },
      { kind: "audit", label: GROUP_LABELS.audit, entries: audits },
    ],
  };
}
