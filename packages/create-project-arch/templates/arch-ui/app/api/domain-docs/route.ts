import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjectRoot, normalizePath } from "../../../lib/project-root";

export const runtime = "nodejs";

type DocScope = "arch-domains" | "arch-model" | "architecture" | "roadmap";

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function humanizeFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  return titleCase(base.replace(/[_-]+/g, " "));
}

async function collectDocs(
  root: string,
  relativeDir: DocScope,
  allowedExtensions: Set<string>,
  maxDepth = 4,
): Promise<
  Array<{
    id: string;
    scope: DocScope;
    file: string;
    path: string;
    title: string;
  }>
> {
  const output: Array<{
    id: string;
    scope: DocScope;
    file: string;
    path: string;
    title: string;
  }> = [];
  const baseDir = path.join(root, relativeDir);

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(ext)) continue;
      const relativePath = normalizePath(path.relative(root, fullPath));
      output.push({
        id: relativePath,
        scope: relativeDir,
        file: entry.name,
        path: relativePath,
        title: humanizeFileName(entry.name),
      });
    }
  }

  try {
    await walk(baseDir, 0);
  } catch {
    return [];
  }

  return output.sort((a, b) => a.path.localeCompare(b.path));
}

export async function GET() {
  const root = getProjectRoot();
  const [domainDocs, modelDocs, architectureDocs, roadmapDocs] = await Promise.all([
    collectDocs(root, "arch-domains", new Set([".md", ".json"]), 2),
    collectDocs(root, "arch-model", new Set([".md", ".json"]), 2),
    collectDocs(root, "architecture", new Set([".md", ".json"]), 6),
    collectDocs(root, "roadmap", new Set([".md", ".json"]), 8),
  ]);

  return NextResponse.json({
    docs: [...domainDocs, ...modelDocs, ...architectureDocs, ...roadmapDocs],
  });
}
