import fs from "fs-extra";
import path from "path";
import matter from "gray-matter";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  return fs.pathExists(targetPath);
}

export async function writeJsonDeterministic(targetPath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(targetPath));
  await fs.writeJSON(targetPath, data, { spaces: 2 });
  await fs.appendFile(targetPath, "\n");
}

export async function readJson<T>(targetPath: string): Promise<T> {
  return fs.readJSON(targetPath) as Promise<T>;
}

export async function writeMarkdownWithFrontmatter(
  targetPath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  await fs.ensureDir(path.dirname(targetPath));
  const normalizedBody = body.endsWith("\n") ? body : `${body}\n`;
  const content = matter.stringify(normalizedBody, frontmatter, { language: "yaml" });
  await fs.writeFile(targetPath, content, "utf8");
}

export async function readMarkdownWithFrontmatter<T extends Record<string, unknown>>(
  targetPath: string,
): Promise<{ data: T; content: string }> {
  const raw = await fs.readFile(targetPath, "utf8");
  const parsed = matter(raw);
  return { data: parsed.data as T, content: parsed.content };
}
