import path from "path";
import fs from "fs-extra";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../fs";
import { taskSchema } from "../../schemas/task";
import { runRepositoryChecks } from "../validation/check";
import { withAtomicTaskMutation } from "./atomicMutation";
import * as graphManifests from "../../graph/manifests";
import { currentDateISO } from "../../utils/date";

export interface RegisterSurfacesOptions {
  phase: string;
  milestone: string;
  taskId: string;
  fromCheck?: boolean;
  include?: string[];
  exclude?: string[];
  dryRun?: boolean;
  cwd?: string;
}

export interface RegisterSurfacesResult {
  taskPath: string;
  existingTargets: string[];
  candidatePaths: string[];
  addedPaths: string[];
  skippedPaths: string[];
  dryRun: boolean;
}

export async function registerSurfaces(
  options: RegisterSurfacesOptions,
): Promise<RegisterSurfacesResult> {
  const cwd = options.cwd ?? process.cwd();
  const {
    phase,
    milestone,
    taskId,
    fromCheck = true,
    include = [],
    exclude = [],
    dryRun = false,
  } = options;

  // Build task file path
  const taskPattern = `roadmap/phases/${phase}/milestones/${milestone}/tasks/*/${taskId}-*.md`;
  const { default: fg } = await import("fast-glob");
  const matches = await fg(taskPattern, { cwd, absolute: true });

  if (matches.length === 0) {
    throw new Error(`Task not found: ${phase}/${milestone}/${taskId}`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple tasks match ${phase}/${milestone}/${taskId}: ${matches.map((m) => path.basename(m)).join(", ")}`,
    );
  }

  const taskPath = matches[0];

  // Load task
  const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
  const frontmatter = taskSchema.parse(parsed.data);
  const existingTargets = [...frontmatter.codeTargets];

  // Get candidate paths
  let candidatePaths: string[];
  if (fromCheck) {
    candidatePaths = await getUntrackedPathsFromCheck(cwd);
  } else {
    // If not from check, user needs to provide paths via include patterns
    if (include.length === 0) {
      throw new Error("Must provide --include patterns when not using --from-check");
    }
    candidatePaths = await getPathsFromIncludePatterns(include, cwd);
  }

  // Filter candidates based on include/exclude patterns
  candidatePaths = filterPaths(candidatePaths, include, exclude);

  // Determine which paths to add (not already in codeTargets)
  const existingSet = new Set(existingTargets.map(normalizeTarget));
  const addedPaths: string[] = [];
  const skippedPaths: string[] = [];

  for (const candidate of candidatePaths) {
    const normalized = normalizeTarget(candidate);
    if (existingSet.has(normalized)) {
      skippedPaths.push(candidate);
    } else {
      addedPaths.push(candidate);
    }
  }

  // Update task if not dry run
  if (!dryRun && addedPaths.length > 0) {
    const updatedTargets = [...existingTargets, ...addedPaths].sort();
    frontmatter.codeTargets = updatedTargets;
    frontmatter.updatedAt = currentDateISO();

    const originalContent = await fs.readFile(taskPath, "utf8");

    await withAtomicTaskMutation({
      cwd,
      mutateRoadmap: async () => {
        await writeMarkdownWithFrontmatter(taskPath, frontmatter, parsed.content);
      },
      rollbackRoadmap: async () => {
        await fs.writeFile(taskPath, originalContent, "utf8");
      },
      syncGraph: async () => {
        await graphManifests.rebuildArchitectureGraph(cwd);
      },
    });
  }

  return {
    taskPath: path.relative(cwd, taskPath),
    existingTargets,
    candidatePaths,
    addedPaths,
    skippedPaths,
    dryRun,
  };
}

async function getUntrackedPathsFromCheck(cwd: string): Promise<string[]> {
  const checkResult = await runRepositoryChecks(cwd);
  const untrackedPaths: string[] = [];

  for (const diagnostic of checkResult.diagnostics) {
    if (diagnostic.code === "UNTRACKED_IMPLEMENTATION" && diagnostic.path) {
      untrackedPaths.push(diagnostic.path);
    }
  }

  return untrackedPaths.sort();
}

async function getPathsFromIncludePatterns(patterns: string[], cwd: string): Promise<string[]> {
  const { default: fg } = await import("fast-glob");
  const files = await fg(patterns, {
    cwd,
    absolute: false,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  });

  return files.map((f) => f.replace(/\\/g, "/")).sort();
}

function filterPaths(paths: string[], include: string[], exclude: string[]): string[] {
  let filtered = paths;

  // Apply include filters (if any)
  if (include.length > 0) {
    filtered = filtered.filter((p) => include.some((pattern) => matchGlob(p, pattern)));
  }

  // Apply exclude filters (if any)
  if (exclude.length > 0) {
    filtered = filtered.filter((p) => !exclude.some((pattern) => matchGlob(p, pattern)));
  }

  return filtered;
}

function matchGlob(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexPattern = escaped
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    .replace(/\?/g, "[^/]");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

function normalizeTarget(target: string): string {
  const normalized = target.replace(/\\/g, "/");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
