import path from "node:path";
import {
  parseTaskWorkflowDocument,
  type NormalizedTaskWorkflow,
} from "../navigation/taskWorkflowParser";

interface TaskFrontmatter {
  id?: string;
  title?: string;
  status?: string;
  lane?: string;
}

export interface ParsedTaskWorkflowMetadata {
  taskId?: string;
  title?: string;
  lane?: string;
  status?: string;
  taskWorkflow?: NormalizedTaskWorkflow;
}

export interface ParseTaskWorkflowMetadataInput {
  content: string;
  absolutePath: string;
  workspaceRoot: string;
}

export interface TaskWorkflowMetadataBoundary {
  parseTaskWorkflowMetadata(input: ParseTaskWorkflowMetadataInput): ParsedTaskWorkflowMetadata;
}

function parseTaskFrontmatter(content: string): TaskFrontmatter {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return {};
  }

  const lines = trimmed.split(/\r?\n/);
  const closingFence = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closingFence < 0) {
    return {};
  }

  const frontmatterLines = lines.slice(1, closingFence + 1);

  const readValue = (key: string): string | undefined => {
    const matcher = new RegExp(`^${key}\\s*:\\s*(.+)$`, "i");
    const line = frontmatterLines.find((candidate) => matcher.test(candidate.trim()));
    if (!line) {
      return undefined;
    }

    const rawValue = line.trim().replace(matcher, "$1").trim();
    return rawValue.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  };

  return {
    id: readValue("id"),
    title: readValue("title"),
    status: readValue("status"),
    lane: readValue("lane"),
  };
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

function taskLaneFromPath(relativePath: string): string | undefined {
  const segments = relativePath.split("/");
  const tasksIndex = segments.lastIndexOf("tasks");
  if (tasksIndex < 0 || tasksIndex + 1 >= segments.length) {
    return undefined;
  }

  return segments[tasksIndex + 1];
}

export function createTaskWorkflowMetadataBoundary(): TaskWorkflowMetadataBoundary {
  return {
    parseTaskWorkflowMetadata(input: ParseTaskWorkflowMetadataInput): ParsedTaskWorkflowMetadata {
      const metadata = parseTaskFrontmatter(input.content);
      const parsedWorkflow = (() => {
        try {
          return parseTaskWorkflowDocument(input.content, input.absolutePath);
        } catch {
          return undefined;
        }
      })();

      const relativePath = toRelativePath(input.workspaceRoot, input.absolutePath);
      const basename = path.basename(relativePath, ".md");
      const idFromFilename = basename.match(/^(\d{3})-/)?.[1];

      return {
        taskId: parsedWorkflow?.task.id ?? metadata.id ?? idFromFilename,
        title: parsedWorkflow?.task.title ?? metadata.title,
        lane: parsedWorkflow?.task.lane ?? metadata.lane ?? taskLaneFromPath(relativePath),
        status: parsedWorkflow?.task.status ?? metadata.status,
        ...(parsedWorkflow ? { taskWorkflow: parsedWorkflow } : {}),
      };
    },
  };
}
