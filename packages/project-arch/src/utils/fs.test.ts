import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import {
  ensureDir,
  pathExists,
  writeJsonDeterministic,
  writeJsonDeterministicIfChanged,
  readJson,
  writeMarkdownWithFrontmatter,
  readMarkdownWithFrontmatter,
} from "./fs";

describe("utils/fs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "utils-fs-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("should ensure directory existence", async () => {
    const dirPath = path.join(tempDir, "a", "b", "c");

    await ensureDir(dirPath);

    expect(await pathExists(dirPath)).toBe(true);
  });

  it("should write and read deterministic json", async () => {
    const filePath = path.join(tempDir, "data", "test.json");
    const payload = { name: "demo", count: 2 };

    await writeJsonDeterministic(filePath, payload);

    const loaded = await readJson<{ name: string; count: number }>(filePath);
    const raw = await readFile(filePath, "utf8");

    expect(loaded).toEqual(payload);
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("should skip deterministic json write when content is unchanged", async () => {
    const filePath = path.join(tempDir, "data", "same.json");
    const payload = { name: "demo", count: 2 };

    const wroteFirst = await writeJsonDeterministicIfChanged(filePath, payload);
    const wroteSecond = await writeJsonDeterministicIfChanged(filePath, payload);

    expect(wroteFirst).toBe(true);
    expect(wroteSecond).toBe(false);
  });

  it("should write markdown with frontmatter and read it back", async () => {
    const filePath = path.join(tempDir, "docs", "sample.md");
    const frontmatter = { id: "001", title: "Sample" };
    const body = "Hello world";

    await writeMarkdownWithFrontmatter(filePath, frontmatter, body);

    const parsed = await readMarkdownWithFrontmatter<{ id: string; title: string }>(filePath);
    expect(parsed.data).toEqual(frontmatter);
    expect(parsed.content).toContain("Hello world");
  });

  it("should normalize markdown body to end with newline", async () => {
    const filePath = path.join(tempDir, "docs", "newline.md");

    await writeMarkdownWithFrontmatter(filePath, { id: "nl" }, "No newline");

    const raw = await readFile(filePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("sanitizes unsafe control characters in frontmatter and body", async () => {
    const filePath = path.join(tempDir, "docs", "sanitized.md");

    await writeMarkdownWithFrontmatter(
      filePath,
      { title: "Skill\x1b[31m", nested: { note: "a\x00b" } },
      "Body\x1b[32m\x00",
    );

    const parsed = await readMarkdownWithFrontmatter<{ title: string; nested: { note: string } }>(
      filePath,
    );
    expect(parsed.data.title).toBe("Skill");
    expect(parsed.data.nested.note).toBe("ab");
    expect(parsed.content).toContain("Body");
    expect(parsed.content).not.toContain("\x1b");
  });
});
