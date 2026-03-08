import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getProjectRoot, normalizePath } from "../../../lib/project-root";

export const runtime = "nodejs";

type NodeType = "phase" | "milestone" | "task" | "domain" | "file";

function isSafeSegment(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

async function collectFiles(
  baseDir: string,
  root: string,
  skipDirs: Set<string>,
  maxDepth = 2,
): Promise<string[]> {
  const output: string[] = [];

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(fullPath, depth + 1);
        continue;
      }
      output.push(normalizePath(path.relative(root, fullPath)));
    }
  }

  try {
    await walk(baseDir, 0);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
  return output.sort((a, b) => a.localeCompare(b));
}

async function findTaskFile(root: string, taskId: string): Promise<string | null> {
  const [phase, milestone, taskNumber] = taskId.split("/");
  if (!phase || !milestone || !taskNumber) return null;
  if (!isSafeSegment(phase) || !isSafeSegment(milestone) || !isSafeSegment(taskNumber)) return null;

  const tasksDir = path.join(root, "roadmap", "phases", phase, "milestones", milestone, "tasks");
  const lanes = ["planned", "discovered", "backlog", "complete"] as const;
  for (const lane of lanes) {
    const laneDir = path.join(tasksDir, lane);
    try {
      const files = await readdir(laneDir);
      const candidate = files.find(
        (file) => file.startsWith(`${taskNumber}-`) && file.endsWith(".md"),
      );
      if (candidate)
        return normalizePath(
          path.join("roadmap", "phases", phase, "milestones", milestone, "tasks", lane, candidate),
        );
    } catch {
      // Continue.
    }
  }
  return null;
}

async function resolveFilesForNode(root: string, type: NodeType, id: string): Promise<string[]> {
  if (type === "task") {
    const found = await findTaskFile(root, id);
    return found ? [found] : [];
  }

  if (type === "file") {
    const normalized = normalizePath(id).replace(/^\/+/, "");
    const allowedRoots = ["arch-domains/", "arch-model/", "architecture/", "roadmap/"];
    if (!allowedRoots.some((prefix) => normalized.startsWith(prefix))) {
      return [];
    }
    const absolutePath = path.join(root, normalized);
    const relativeRoundTrip = normalizePath(path.relative(root, absolutePath));
    if (relativeRoundTrip !== normalized) {
      return [];
    }
    try {
      await readFile(absolutePath, "utf8");
      return [normalized];
    } catch {
      return [];
    }
  }

  if (type === "domain") {
    const domainsDir = path.join(root, "arch-domains");
    try {
      const files = await readdir(domainsDir);
      const markdownFiles = files.filter((file) => file.toLowerCase().endsWith(".md"));
      if (markdownFiles.length === 0) return [];

      const normalizedId = id.trim().toLowerCase();
      const normalizedDashId = normalizedId.replace(/\//g, "-");
      const slug = normalizedId
        .replace(/[^a-z0-9/ -]/g, "")
        .replace(/[ /]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const exactMatches = markdownFiles.filter((file) => {
        const base = file.slice(0, -3).toLowerCase();
        return base === normalizedId || base === normalizedDashId || base === slug;
      });

      const selected = exactMatches.length > 0 ? exactMatches : markdownFiles;
      return selected
        .map((file) => normalizePath(path.join("arch-domains", file)))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  if (type === "phase") {
    const [phase] = id.split("/");
    if (!phase || !isSafeSegment(phase)) return [];
    const phaseDir = path.join(root, "roadmap", "phases", phase);
    return collectFiles(
      phaseDir,
      root,
      new Set(["milestones", "tasks", "node_modules", ".git"]),
      2,
    );
  }

  const [phase, milestone] = id.split("/");
  if (!phase || !milestone || !isSafeSegment(phase) || !isSafeSegment(milestone)) return [];
  const milestoneDir = path.join(root, "roadmap", "phases", phase, "milestones", milestone);
  return collectFiles(milestoneDir, root, new Set(["tasks", "node_modules", ".git"]), 3);
}

export async function GET(request: NextRequest) {
  const root = getProjectRoot();
  const type = request.nextUrl.searchParams.get("type") as NodeType | null;
  const id = request.nextUrl.searchParams.get("id");

  if (!type || !id) {
    return NextResponse.json(
      { success: false, errors: ["type and id query parameters are required"] },
      { status: 400 },
    );
  }
  if (!["phase", "milestone", "task", "domain", "file"].includes(type)) {
    return NextResponse.json({ files: [] });
  }

  const files = await resolveFilesForNode(root, type, id);
  const withContent = await Promise.all(
    files.map(async (relativePath) => {
      const absolutePath = path.join(root, relativePath);
      const content = await readFile(absolutePath, "utf8");
      return { path: relativePath, content };
    }),
  );

  return NextResponse.json({
    type,
    id,
    files: withContent,
  });
}
