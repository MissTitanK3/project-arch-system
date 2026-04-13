/**
 * Shared artifact browser model loader.
 *
 * Provides the workspace-hierarchy model types and `buildArtifactBrowserModel`
 * used by the artifact browser webview.  Both the baseline and experimental
 * browser providers load the same model through this boundary so that
 * repository-backed artifact semantics remain extension-host-owned and are not
 * duplicated across surfaces.
 *
 * Rendering (HTML generation) is view-specific and is kept separately in each
 * provider so it can vary independently between surfaces.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createTaskWorkflowMetadataBoundary,
  type ParsedTaskWorkflowMetadata,
} from "../integration/taskWorkflowMetadataBoundary";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Normalised task workflow shape extracted from parsed metadata. */
export type NormalizedTaskWorkflow = NonNullable<ParsedTaskWorkflowMetadata["taskWorkflow"]>;

/** Reference to a directory entry within a hierarchy node. */
export interface HierarchyDirectoryRef {
  relativePath: string;
  label: string;
  createdAt?: string;
  updatedAt?: string;
}

/** A single file entry within a hierarchy node, with optional task metadata. */
export interface HierarchyFile {
  relativePath: string;
  label: string;
  isMarkdown: boolean;
  updatedAt?: string;
  schemaVersion?: string;
  taskMetadata?: {
    status?: string;
    tags: string[];
    dependsOn: string[];
    blocks: string[];
    codeTargets?: string[];
    publicDocs?: string[];
    decisions?: string[];
    evidence?: string[];
    traceLinks?: string[];
    workflowSummary?: {
      completedChecklistItems: number;
      totalChecklistItems: number;
      completedStages: number;
      totalStages: number;
      overallState: "not_started" | "in_progress" | "completed" | "blocked";
      currentStageTitle?: string;
      currentStageState?: "not_started" | "in_progress" | "completed" | "blocked";
    };
    workflowDetail?: {
      overallState: "not_started" | "in_progress" | "completed" | "blocked";
      stages: Array<{
        id: string;
        title: string;
        state: "not_started" | "in_progress" | "completed" | "blocked";
        items: Array<{
          id: string;
          label: string;
          status: "planned" | "in_progress" | "done" | "blocked" | "skipped";
        }>;
      }>;
    };
  };
}

/** A node in the workspace hierarchy, representing a directory and its contents. */
export interface HierarchyNode {
  relativePath: string;
  label: string;
  parentRelativePath?: string;
  directories: HierarchyDirectoryRef[];
  files: HierarchyFile[];
}

/**
 * The full artifact browser model produced by `buildArtifactBrowserModel`.
 * Contains a flat map of all traversed nodes keyed by their workspace-relative
 * path, suitable for embedding in the webview HTML payload.
 */
export interface ArtifactBrowserModel {
  generatedAt: string;
  nodes: Record<string, HierarchyNode>;
}

// ---------------------------------------------------------------------------
// Root candidates
// ---------------------------------------------------------------------------

/**
 * Ordered list of workspace-relative directory paths scanned when building the
 * artifact browser model.  Only paths that actually exist on disk are included
 * in the model's root directory list.
 */
export const PROJECT_ARCH_ROOT_CANDIDATES = [
  "feedback",
  "roadmap",
  "architecture",
  "arch-domains",
  ".arch",
  ".project-arch",
  ".project-arch/workflows",
  ".github/workflows",
] as const;

/** Returns a human-readable label for a root candidate path. */
export function rootCandidateLabel(relativePath: string): string {
  if (relativePath === ".project-arch/workflows") {
    return ".project-arch/workflows (canonical workflow documents)";
  }

  if (relativePath === ".github/workflows") {
    return ".github/workflows (legacy compatibility)";
  }

  return path.basename(relativePath);
}

// ---------------------------------------------------------------------------
// Private model-building helpers
// ---------------------------------------------------------------------------

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isMarkdownPath(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase();
  return extension === ".md" || extension === ".markdown";
}

function stripQuotedValue(value: string): string {
  return value
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
}

function leadingWhitespaceCount(value: string): number {
  const match = value.match(/^\s*/);
  return match?.[0]?.length ?? 0;
}

function isYamlFoldedListIndicator(value: string): boolean {
  const token = value.trim().split(/\s+/, 1)[0] ?? "";
  if (!token) {
    return false;
  }

  return (
    /^[>|][+-]?$/.test(token) || /^[>|][0-9][+-]?$/.test(token) || /^[>|][+-][0-9]$/.test(token)
  );
}

function parseFrontmatterBlock(content: string): string[] {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---\n") && !trimmed.startsWith("---\r\n")) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length === 0 || lines[0]?.trim() !== "---") {
    return [];
  }

  const closingFenceIndex = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closingFenceIndex < 0) {
    return [];
  }

  return lines.slice(1, closingFenceIndex + 1);
}

function parseListFromFrontmatter(lines: string[], key: string): string[] {
  const keyRegex = new RegExp(`^${key}\\s*:\\s*(.*)$`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const match = line.match(keyRegex);
    if (!match) {
      continue;
    }

    const immediateValue = match[1]?.trim() ?? "";
    if (immediateValue.startsWith("[") && immediateValue.endsWith("]")) {
      const rawItems = immediateValue
        .slice(1, -1)
        .split(",")
        .map((item) => stripQuotedValue(item))
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return rawItems;
    }

    if (immediateValue.length > 0 && immediateValue !== "[]") {
      return [stripQuotedValue(immediateValue)];
    }

    const output: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor] ?? "";
      const itemMatch = next.match(/^\s*-\s+(.+)$/);
      if (!itemMatch) {
        break;
      }
      const rawItemValue = (itemMatch[1] ?? "").trim();
      const listLineIndent = leadingWhitespaceCount(next);

      if (isYamlFoldedListIndicator(rawItemValue)) {
        const foldedParts: string[] = [];
        let continuationCursor = cursor + 1;

        while (continuationCursor < lines.length) {
          const continuationLine = lines[continuationCursor] ?? "";
          const continuationIndent = leadingWhitespaceCount(continuationLine);
          const trimmedContinuation = continuationLine.trim();

          if (trimmedContinuation.length === 0) {
            continuationCursor += 1;
            continue;
          }

          if (continuationIndent <= listLineIndent) {
            break;
          }

          foldedParts.push(trimmedContinuation);
          continuationCursor += 1;
        }

        const foldedValue = stripQuotedValue(foldedParts.join(" ")).trim();
        if (foldedValue.length > 0) {
          output.push(foldedValue);
        }

        cursor = continuationCursor;
        continue;
      }

      output.push(stripQuotedValue(rawItemValue).trim());
      cursor += 1;
    }

    return output.filter((value) => value.length > 0);
  }

  return [];
}

function parseStatusFromFrontmatter(lines: string[]): string | undefined {
  const statusLine = lines.find((line) => /^status\s*:/i.test(line.trim()));
  if (!statusLine) {
    return undefined;
  }

  const rawStatus = statusLine.replace(/^status\s*:\s*/i, "").trim();
  if (rawStatus.length === 0) {
    return undefined;
  }

  return stripQuotedValue(rawStatus);
}

function parseScalarFromFrontmatter(lines: string[], key: string): string | undefined {
  const keyRegex = new RegExp(`^${key}\\s*:\\s*(.+)$`, "i");
  const line = lines.find((candidate) => keyRegex.test(candidate.trim()));
  if (!line) {
    return undefined;
  }

  const value = line.replace(keyRegex, "$1").trim();
  if (!value) {
    return undefined;
  }

  return stripQuotedValue(value);
}

function selectCurrentWorkflowStage(workflow: NormalizedTaskWorkflow):
  | {
      title: string;
      state: "not_started" | "in_progress" | "completed" | "blocked";
    }
  | undefined {
  const prioritizedStage =
    workflow.workflow.stages.find((stage) => stage.state === "in_progress") ??
    workflow.workflow.stages.find((stage) => stage.state === "blocked") ??
    workflow.workflow.stages.find((stage) => stage.state === "not_started") ??
    [...workflow.workflow.stages].reverse().find((stage) => stage.state === "completed");

  if (!prioritizedStage) {
    return undefined;
  }

  return {
    title: prioritizedStage.title,
    state: prioritizedStage.state,
  };
}

const taskWorkflowMetadataBoundary = createTaskWorkflowMetadataBoundary();

function parseTaskMetadataFromContent(input: {
  content: string;
  absolutePath: string;
  workspaceRoot: string;
}): HierarchyFile["taskMetadata"] | undefined {
  const { content, absolutePath, workspaceRoot } = input;
  const frontmatterLines = parseFrontmatterBlock(content);
  const status =
    frontmatterLines.length > 0 ? parseStatusFromFrontmatter(frontmatterLines) : undefined;
  const tags =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "tags") : [];
  const dependsOn =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "dependsOn") : [];
  const blocks =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "blocks") : [];
  const codeTargets =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "codeTargets") : [];
  const publicDocs =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "publicDocs") : [];
  const decisions =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "decisions") : [];
  const evidence =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "evidence") : [];
  const traceLinks =
    frontmatterLines.length > 0 ? parseListFromFrontmatter(frontmatterLines, "traceLinks") : [];

  const parsedTaskMetadata = taskWorkflowMetadataBoundary.parseTaskWorkflowMetadata({
    content,
    absolutePath,
    workspaceRoot,
  });

  const workflow = parsedTaskMetadata.taskWorkflow;
  const currentStage = workflow ? selectCurrentWorkflowStage(workflow) : undefined;
  const workflowSummary = workflow
    ? {
        completedChecklistItems:
          workflow.workflow.summary.items.done + workflow.workflow.summary.items.skipped,
        totalChecklistItems: workflow.workflow.summary.items.total,
        completedStages: workflow.workflow.summary.completedStages,
        totalStages: workflow.workflow.summary.totalStages,
        overallState: workflow.workflow.summary.overallState,
        ...(currentStage
          ? {
              currentStageTitle: currentStage.title,
              currentStageState: currentStage.state,
            }
          : {}),
      }
    : undefined;
  const workflowDetail = workflow
    ? {
        overallState: workflow.workflow.summary.overallState,
        stages: workflow.workflow.stages.map((stage) => ({
          id: stage.id,
          title: stage.title,
          state: stage.state,
          items: stage.items.map((item) => ({
            id: item.id,
            label: item.label,
            status: item.status,
          })),
        })),
      }
    : undefined;

  if (
    !status &&
    tags.length === 0 &&
    dependsOn.length === 0 &&
    blocks.length === 0 &&
    codeTargets.length === 0 &&
    publicDocs.length === 0 &&
    decisions.length === 0 &&
    evidence.length === 0 &&
    traceLinks.length === 0 &&
    !workflowSummary &&
    !workflowDetail
  ) {
    return undefined;
  }

  return {
    status: parsedTaskMetadata.status ?? status,
    tags,
    dependsOn,
    blocks,
    codeTargets,
    publicDocs,
    decisions,
    evidence,
    traceLinks,
    ...(workflowSummary ? { workflowSummary } : {}),
    ...(workflowDetail ? { workflowDetail } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public model builder
// ---------------------------------------------------------------------------

/**
 * Build the complete artifact browser hierarchy model for a workspace.
 *
 * Scans all known `PROJECT_ARCH_ROOT_CANDIDATES` that exist on disk, traverses
 * their directory trees, reads task metadata from Markdown files, and returns a
 * flat `nodes` map keyed by workspace-relative path.
 *
 * The resulting model is view-agnostic — it contains only repository-backed
 * artifact data and carries no rendering or UI concerns.
 */
export async function buildArtifactBrowserModel(
  workspaceRoot: string,
): Promise<ArtifactBrowserModel> {
  const nodes = new Map<string, HierarchyNode>();

  const rootNode: HierarchyNode = {
    relativePath: "",
    label: "Repository",
    directories: [],
    files: [],
  };
  nodes.set("", rootNode);

  const existingRoots: string[] = [];
  for (const rootCandidate of PROJECT_ARCH_ROOT_CANDIDATES) {
    const absoluteRoot = path.join(workspaceRoot, rootCandidate);
    if (await pathExists(absoluteRoot)) {
      existingRoots.push(rootCandidate);
    }
  }

  const rootDirectories: HierarchyDirectoryRef[] = [];
  for (const relativePath of [...existingRoots].sort((left, right) => left.localeCompare(right))) {
    const absoluteRootPath = path.join(workspaceRoot, relativePath);
    let createdAt: string | undefined;
    let updatedAt: string | undefined;
    try {
      const stats = await fs.stat(absoluteRootPath);
      createdAt = stats.birthtime.toISOString();
      updatedAt = stats.mtime.toISOString();
    } catch {
      createdAt = undefined;
      updatedAt = undefined;
    }

    rootDirectories.push({
      relativePath,
      label: rootCandidateLabel(relativePath),
      createdAt,
      updatedAt,
    });
  }
  rootNode.directories = rootDirectories;

  const stack = [...existingRoots];
  while (stack.length > 0) {
    const currentRelativePath = stack.pop();
    if (!currentRelativePath) {
      continue;
    }

    const absoluteDirectory = path.join(workspaceRoot, currentRelativePath);
    let rawEntries: Array<{ name: string; isDirectory: boolean; isFile: boolean }>;
    try {
      rawEntries = (await fs.readdir(absoluteDirectory, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));
    } catch {
      continue;
    }

    const directories: HierarchyDirectoryRef[] = [];
    for (const entry of rawEntries.filter((candidate) => candidate.isDirectory)) {
      const childRelativePath = path.posix.join(currentRelativePath, entry.name);
      let createdAt: string | undefined;
      let updatedAt: string | undefined;
      try {
        const childAbsolutePath = path.join(workspaceRoot, childRelativePath);
        const stats = await fs.stat(childAbsolutePath);
        createdAt = stats.birthtime.toISOString();
        updatedAt = stats.mtime.toISOString();
      } catch {
        createdAt = undefined;
        updatedAt = undefined;
      }

      directories.push({
        relativePath: childRelativePath,
        label: entry.name,
        createdAt,
        updatedAt,
      });
    }
    directories.sort((left, right) => left.label.localeCompare(right.label));

    const files: HierarchyFile[] = [];
    for (const entry of rawEntries.filter((candidate) => candidate.isFile)) {
      const fileRelativePath = path.posix.join(currentRelativePath, entry.name);
      const markdown = isMarkdownPath(fileRelativePath);
      let taskMetadata: HierarchyFile["taskMetadata"] | undefined;
      let schemaVersion: string | undefined;
      let updatedAt: string | undefined;

      try {
        const absoluteFilePath = path.join(workspaceRoot, fileRelativePath);
        const stats = await fs.stat(absoluteFilePath);
        updatedAt = stats.mtime.toISOString();
      } catch {
        updatedAt = undefined;
      }

      if (markdown) {
        try {
          const absoluteFilePath = path.join(workspaceRoot, fileRelativePath);
          const content = await fs.readFile(absoluteFilePath, "utf8");
          const frontmatterLines = parseFrontmatterBlock(content);
          schemaVersion =
            frontmatterLines.length > 0
              ? parseScalarFromFrontmatter(frontmatterLines, "schemaVersion")
              : undefined;
          taskMetadata = parseTaskMetadataFromContent({
            content,
            absolutePath: absoluteFilePath,
            workspaceRoot,
          });
        } catch {
          taskMetadata = undefined;
        }
      }

      files.push({
        relativePath: fileRelativePath,
        label: entry.name,
        isMarkdown: markdown,
        updatedAt,
        schemaVersion,
        taskMetadata,
      });
    }
    files.sort((left, right) => left.label.localeCompare(right.label));

    const parentRelativePath = (() => {
      const parent = path.posix.dirname(currentRelativePath);
      if (parent === ".") {
        return "";
      }
      return parent;
    })();

    nodes.set(currentRelativePath, {
      relativePath: currentRelativePath,
      label: path.posix.basename(currentRelativePath),
      parentRelativePath,
      directories,
      files,
    });

    for (const directory of directories) {
      stack.push(directory.relativePath);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes: Object.fromEntries(nodes.entries()),
  };
}
