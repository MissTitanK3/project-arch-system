import path from "path";
import fs from "fs-extra";
import matter from "gray-matter";
import { ensureDir, pathExists } from "../../utils/fs";

export interface ManagedWriteState {
  cwd: string;
  force: boolean;
  created: string[];
  overwritten: string[];
  skipped: string[];
}

export async function writeTextFileIfMissing(targetPath: string, content: string): Promise<void> {
  if (await pathExists(targetPath)) {
    return;
  }

  await ensureDir(path.dirname(targetPath));
  const normalized = isMarkdownPath(targetPath)
    ? normalizeGeneratedMarkdown(content)
    : content.endsWith("\n")
      ? content
      : `${content}\n`;
  await fs.writeFile(targetPath, normalized, "utf8");
}

export function isMarkdownPath(targetPath: string): boolean {
  return targetPath.endsWith(".md") || targetPath.endsWith(".mdc");
}

export function normalizeGeneratedMarkdown(content: string): string {
  const normalizedNewlines = content.replace(/\r\n?/g, "\n");
  const collapsedBlankRuns = normalizedNewlines.replace(/\n{3,}/g, "\n\n");
  const trimmedTrailing = collapsedBlankRuns.replace(/\s+$/u, "");
  return `${trimmedTrailing}\n`;
}

export function toManagedRelativePath(cwd: string, targetPath: string): string {
  return path.relative(cwd, targetPath).split(path.sep).join("/");
}

export async function writeManagedFile(
  targetPath: string,
  nextRaw: string,
  state: ManagedWriteState,
): Promise<"created" | "overwritten" | "skipped" | "unchanged"> {
  await ensureDir(path.dirname(targetPath));

  const normalizedRaw = isMarkdownPath(targetPath)
    ? normalizeGeneratedMarkdown(nextRaw)
    : nextRaw.endsWith("\n")
      ? nextRaw
      : `${nextRaw}\n`;

  const relativePath = toManagedRelativePath(state.cwd, targetPath);
  const exists = await pathExists(targetPath);
  if (exists) {
    const currentRaw = await fs.readFile(targetPath, "utf8");
    if (currentRaw === normalizedRaw) {
      return "unchanged";
    }

    if (!state.force) {
      state.skipped.push(relativePath);
      return "skipped";
    }

    state.overwritten.push(relativePath);
    await fs.writeFile(targetPath, normalizedRaw, "utf8");
    return "overwritten";
  }

  state.created.push(relativePath);
  await fs.writeFile(targetPath, normalizedRaw, "utf8");
  return "created";
}

export async function writeMarkdownFile(targetPath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, normalizeGeneratedMarkdown(content), "utf8");
}

export async function writeManagedJsonFile(
  targetPath: string,
  data: unknown,
  state: ManagedWriteState,
): Promise<"created" | "overwritten" | "skipped" | "unchanged"> {
  const nextRaw = `${JSON.stringify(data, null, 2)}\n`;
  return writeManagedFile(targetPath, nextRaw, state);
}

export async function writeManagedMarkdownFile(
  targetPath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  state: ManagedWriteState,
): Promise<"created" | "overwritten" | "skipped" | "unchanged"> {
  const normalizedBody = body.endsWith("\n") ? body : `${body}\n`;
  const nextRaw = matter.stringify(normalizedBody, frontmatter, { language: "yaml" });
  return writeManagedFile(targetPath, nextRaw, state);
}

export function flushManagedWriteLogs(state: ManagedWriteState): void {
  for (const relativePath of state.created) {
    console.log(`Created: ${relativePath}`);
  }

  for (const relativePath of state.overwritten) {
    console.log(`Overwriting: ${relativePath}`);
  }

  if (state.skipped.length > 0) {
    console.log("Skipped existing managed files:");
    for (const relativePath of state.skipped) {
      console.log(`Skipped (already exists): ${relativePath} — use --force to overwrite`);
    }
  }
}
