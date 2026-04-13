import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import {
  flushManagedWriteLogs,
  normalizeGeneratedMarkdown,
  type ManagedWriteState,
  writeManagedFile,
  writeManagedJsonFile,
  writeManagedMarkdownFile,
  writeTextFileIfMissing,
} from "./initWrites";

describe("core/init/initWrites", () => {
  let tempDir: string;
  let tempContext: TestProjectContext;

  beforeEach(async () => {
    tempContext = await createTempDir();
    tempDir = tempContext.tempDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await tempContext.cleanup();
  });

  it("normalizes generated markdown with unix newlines, collapsed blanks, and one trailing newline", () => {
    const normalized = normalizeGeneratedMarkdown("line one\r\n\r\n\r\nline two   \n\n\n");

    expect(normalized).toBe("line one\n\nline two\n");
  });

  it("writes missing markdown files with normalized content", async () => {
    const targetPath = path.join(tempDir, "docs", "guide.md");

    await writeTextFileIfMissing(targetPath, "hello\r\n\r\n\r\nworld");

    expect(await fs.readFile(targetPath, "utf8")).toBe("hello\n\nworld\n");
  });

  it("does not overwrite an existing file when writing only if missing", async () => {
    const targetPath = path.join(tempDir, "docs", "guide.md");
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, "existing\n", "utf8");

    await writeTextFileIfMissing(targetPath, "replacement");

    expect(await fs.readFile(targetPath, "utf8")).toBe("existing\n");
  });

  it("tracks created, skipped, unchanged, and overwritten managed writes", async () => {
    const state: ManagedWriteState = {
      cwd: tempDir,
      force: false,
      created: [],
      overwritten: [],
      skipped: [],
    };
    const targetPath = path.join(tempDir, "docs", "guide.md");

    await expect(writeManagedFile(targetPath, "first", state)).resolves.toBe("created");
    await expect(writeManagedFile(targetPath, "first\n", state)).resolves.toBe("unchanged");
    await expect(writeManagedFile(targetPath, "second", state)).resolves.toBe("skipped");

    expect(state.created).toEqual(["docs/guide.md"]);
    expect(state.skipped).toEqual(["docs/guide.md"]);
    expect(state.overwritten).toEqual([]);
    expect(await fs.readFile(targetPath, "utf8")).toBe("first\n");

    state.force = true;
    await expect(writeManagedFile(targetPath, "second", state)).resolves.toBe("overwritten");

    expect(state.overwritten).toEqual(["docs/guide.md"]);
    expect(await fs.readFile(targetPath, "utf8")).toBe("second\n");
  });

  it("writes managed json and markdown files with deterministic formatting", async () => {
    const state: ManagedWriteState = {
      cwd: tempDir,
      force: false,
      created: [],
      overwritten: [],
      skipped: [],
    };
    const jsonPath = path.join(tempDir, "roadmap", "projects", "shared", "manifest.json");
    const markdownPath = path.join(tempDir, "roadmap", "tasks", "001.md");

    await writeManagedJsonFile(jsonPath, { id: "shared", title: "Shared" }, state);
    await writeManagedMarkdownFile(markdownPath, { status: "planned" }, "Task body", state);

    expect(await fs.readFile(jsonPath, "utf8")).toBe(
      '{\n  "id": "shared",\n  "title": "Shared"\n}\n',
    );
    expect(await fs.readFile(markdownPath, "utf8")).toContain(
      "---\nstatus: planned\n---\nTask body\n",
    );
  });

  it("flushes managed write logs by category", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const state: ManagedWriteState = {
      cwd: tempDir,
      force: false,
      created: ["a.md"],
      overwritten: ["b.md"],
      skipped: ["c.md"],
    };

    flushManagedWriteLogs(state);

    expect(logSpy).toHaveBeenCalledWith("Created: a.md");
    expect(logSpy).toHaveBeenCalledWith("Overwriting: b.md");
    expect(logSpy).toHaveBeenCalledWith("Skipped existing managed files:");
    expect(logSpy).toHaveBeenCalledWith(
      "Skipped (already exists): c.md — use --force to overwrite",
    );
  });
});
