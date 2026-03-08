import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { writeFile } from "./writeFile";
import { fileAssertions } from "../test/helpers";

describe("fs/writeFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "writeFile-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("writeFile", () => {
    it("should write a file with content", async () => {
      const filePath = path.join(tempDir, "test.txt");
      const content = "Hello, World!";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "test.txt", content);
    });

    it("should create parent directories if they don't exist", async () => {
      const filePath = path.join(tempDir, "nested", "dirs", "file.txt");
      const content = "File in nested directory";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "nested/dirs/file.txt", content);

      // Verify parent directories were created
      await fileAssertions.assertFileExists(tempDir, "nested");
      await fileAssertions.assertFileExists(tempDir, "nested/dirs");
    });

    it("should overwrite existing file", async () => {
      const filePath = path.join(tempDir, "overwrite.txt");
      const initialContent = "Initial content";
      const updatedContent = "Updated content";

      await writeFile(filePath, initialContent);
      await fileAssertions.assertFileContains(tempDir, "overwrite.txt", initialContent);

      await writeFile(filePath, updatedContent);
      await fileAssertions.assertFileContains(tempDir, "overwrite.txt", updatedContent);
    });

    it("should write empty string content", async () => {
      const filePath = path.join(tempDir, "empty.txt");
      const content = "";

      await writeFile(filePath, content);

      const written = await readFile(filePath, "utf-8");
      expect(written).toBe("");
    });

    it("should write multiline content", async () => {
      const filePath = path.join(tempDir, "multiline.txt");
      const content = "Line 1\nLine 2\nLine 3\n";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "multiline.txt", "Line 1");
      await fileAssertions.assertFileContains(tempDir, "multiline.txt", "Line 2");
      await fileAssertions.assertFileContains(tempDir, "multiline.txt", "Line 3");
    });

    it("should handle UTF-8 characters", async () => {
      const filePath = path.join(tempDir, "utf8.txt");
      const content = "Hello 世界 🌍 café";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "utf8.txt", "世界");
      await fileAssertions.assertFileContains(tempDir, "utf8.txt", "🌍");
      await fileAssertions.assertFileContains(tempDir, "utf8.txt", "café");
    });

    it("should handle JSON content", async () => {
      const filePath = path.join(tempDir, "data.json");
      const jsonData = { name: "test", value: 42, nested: { key: "value" } };
      const content = JSON.stringify(jsonData, null, 2);

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "data.json", '"name": "test"');
      await fileAssertions.assertFileContains(tempDir, "data.json", '"value": 42');
    });

    it("should handle Markdown content", async () => {
      const filePath = path.join(tempDir, "doc.md");
      const content = "# Title\n\nSome **bold** text and _italic_ text.\n";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "doc.md", "# Title");
      await fileAssertions.assertFileContains(tempDir, "doc.md", "**bold**");
    });

    it("should write files to deeply nested directories", async () => {
      const filePath = path.join(tempDir, "level1", "level2", "level3", "level4", "deep.txt");
      const content = "Deep file";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(
        tempDir,
        "level1/level2/level3/level4/deep.txt",
        content,
      );
    });

    it("should handle multiple files in same directory", async () => {
      const dir = path.join(tempDir, "multi-files");
      const file1 = path.join(dir, "file1.txt");
      const file2 = path.join(dir, "file2.txt");
      const file3 = path.join(dir, "file3.txt");

      await writeFile(file1, "Content 1");
      await writeFile(file2, "Content 2");
      await writeFile(file3, "Content 3");

      await fileAssertions.assertFileContains(tempDir, "multi-files/file1.txt", "Content 1");
      await fileAssertions.assertFileContains(tempDir, "multi-files/file2.txt", "Content 2");
      await fileAssertions.assertFileContains(tempDir, "multi-files/file3.txt", "Content 3");
    });

    it("should handle files with various extensions", async () => {
      const extensions = [".txt", ".md", ".json", ".ts", ".js", ".yaml"];

      for (const ext of extensions) {
        const filePath = path.join(tempDir, `file${ext}`);
        const content = `Content for ${ext}`;

        await writeFile(filePath, content);

        const written = await readFile(filePath, "utf-8");
        expect(written).toBe(content);
      }
    });

    it("should handle files with special characters in name", async () => {
      const filePath = path.join(tempDir, "file-with-dashes_and_underscores.txt");
      const content = "Special filename";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(
        tempDir,
        "file-with-dashes_and_underscores.txt",
        content,
      );
    });

    it("should handle very long content", async () => {
      const filePath = path.join(tempDir, "large.txt");
      const content = "x".repeat(100000); // 100k characters

      await writeFile(filePath, content);

      const written = await readFile(filePath, "utf-8");
      expect(written.length).toBe(100000);
      expect(written).toBe(content);
    });

    it("should write files with frontmatter", async () => {
      const filePath = path.join(tempDir, "frontmatter.md");
      const content = `---
title: Test Document
date: 2026-03-07
---

# Content

Body text here.
`;

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(tempDir, "frontmatter.md", "title: Test Document");
      await fileAssertions.assertFileContains(tempDir, "frontmatter.md", "# Content");
    });

    it("should handle concurrent writes to different files", async () => {
      const files = Array.from({ length: 5 }, (_, i) => ({
        path: path.join(tempDir, "concurrent", `file${i}.txt`),
        content: `Content ${i}`,
      }));

      await Promise.all(files.map((f) => writeFile(f.path, f.content)));

      for (const file of files) {
        const written = await readFile(file.path, "utf-8");
        expect(written).toBe(file.content);
      }
    });

    it("should preserve newline characters", async () => {
      const filePath = path.join(tempDir, "newlines.txt");
      const content = "Line 1\r\nLine 2\nLine 3\r\n";

      await writeFile(filePath, content);

      const written = await readFile(filePath, "utf-8");
      expect(written).toBe(content);
    });

    it("should handle file paths with dots", async () => {
      const filePath = path.join(tempDir, "folder.with.dots", "file.name.with.dots.txt");
      const content = "Dots in path";

      await writeFile(filePath, content);

      await fileAssertions.assertFileContains(
        tempDir,
        "folder.with.dots/file.name.with.dots.txt",
        content,
      );
    });
  });
});
