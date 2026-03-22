import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, symlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { readProject } from "./readProject";

describe("fs/readProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "readProject-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("readProject", () => {
    it("should return empty array for empty directory", async () => {
      const result = await readProject(tempDir);

      expect(result.files).toEqual([]);
    });

    it("should list all files in directory", async () => {
      await writeFile(path.join(tempDir, "file1.txt"), "content1");
      await writeFile(path.join(tempDir, "file2.md"), "content2");
      await writeFile(path.join(tempDir, "file3.json"), "content3");

      const result = await readProject(tempDir);

      expect(result.files).toContain("file1.txt");
      expect(result.files).toContain("file2.md");
      expect(result.files).toContain("file3.json");
      expect(result.files).toHaveLength(3);
    });

    it("should list files in nested directories", async () => {
      await mkdir(path.join(tempDir, "subdir"), { recursive: true });
      await writeFile(path.join(tempDir, "root.txt"), "root");
      await writeFile(path.join(tempDir, "subdir", "nested.txt"), "nested");

      const result = await readProject(tempDir);

      expect(result.files).toContain("root.txt");
      expect(result.files).toContain("subdir/nested.txt");
      expect(result.files).toHaveLength(2);
    });

    it("should exclude .git directory", async () => {
      await mkdir(path.join(tempDir, ".git", "objects"), { recursive: true });
      await writeFile(path.join(tempDir, ".git", "config"), "git config");
      await writeFile(path.join(tempDir, ".git", "objects", "obj1"), "object");
      await writeFile(path.join(tempDir, "file.txt"), "content");

      const result = await readProject(tempDir);

      expect(result.files).toContain("file.txt");
      expect(result.files).not.toContain(".git/config");
      expect(result.files).not.toContain(".git/objects/obj1");
      expect(result.files.some((f) => f.includes(".git"))).toBe(false);
    });

    it("should exclude node_modules directory", async () => {
      await mkdir(path.join(tempDir, "node_modules", "package"), { recursive: true });
      await writeFile(path.join(tempDir, "node_modules", "package", "index.js"), "code");
      await writeFile(path.join(tempDir, "package.json"), "{}");

      const result = await readProject(tempDir);

      expect(result.files).toContain("package.json");
      expect(result.files).not.toContain("node_modules/package/index.js");
      expect(result.files.some((f) => f.includes("node_modules"))).toBe(false);
    });

    it("should exclude dist directory", async () => {
      await mkdir(path.join(tempDir, "dist"), { recursive: true });
      await mkdir(path.join(tempDir, "src"), { recursive: true });
      await writeFile(path.join(tempDir, "dist", "bundle.js"), "bundled");
      await writeFile(path.join(tempDir, "src", "index.ts"), "source");

      const result = await readProject(tempDir);

      expect(result.files).toContain("src/index.ts");
      expect(result.files).not.toContain("dist/bundle.js");
      expect(result.files.some((f) => f.includes("dist"))).toBe(false);
    });

    it("should include dotfiles", async () => {
      await writeFile(path.join(tempDir, ".gitignore"), "node_modules");
      await writeFile(path.join(tempDir, ".env"), "SECRET=value");
      await writeFile(path.join(tempDir, "file.txt"), "content");

      const result = await readProject(tempDir);

      expect(result.files).toContain(".gitignore");
      expect(result.files).toContain(".env");
      expect(result.files).toContain("file.txt");
    });

    it("should include files in hidden directories (except excluded ones)", async () => {
      await mkdir(path.join(tempDir, ".config"), { recursive: true });
      await writeFile(path.join(tempDir, ".config", "settings.json"), "{}");

      const result = await readProject(tempDir);

      expect(result.files).toContain(".config/settings.json");
    });

    it("should return sorted file list", async () => {
      await writeFile(path.join(tempDir, "zebra.txt"), "z");
      await writeFile(path.join(tempDir, "alpha.txt"), "a");
      await writeFile(path.join(tempDir, "beta.txt"), "b");

      const result = await readProject(tempDir);

      expect(result.files).toEqual(["alpha.txt", "beta.txt", "zebra.txt"]);
    });

    it("should handle deeply nested directories", async () => {
      const deepPath = path.join(tempDir, "a", "b", "c", "d", "e");
      await mkdir(deepPath, { recursive: true });
      await writeFile(path.join(deepPath, "deep.txt"), "deep content");

      const result = await readProject(tempDir);

      expect(result.files).toContain("a/b/c/d/e/deep.txt");
    });

    it("should handle mixed file types", async () => {
      await writeFile(path.join(tempDir, "doc.md"), "markdown");
      await writeFile(path.join(tempDir, "data.json"), "{}");
      await writeFile(path.join(tempDir, "script.ts"), "typescript");
      await writeFile(path.join(tempDir, "style.css"), "css");
      await writeFile(path.join(tempDir, "image.png"), "binary");

      const result = await readProject(tempDir);

      expect(result.files).toHaveLength(5);
      expect(result.files).toContain("doc.md");
      expect(result.files).toContain("data.json");
      expect(result.files).toContain("script.ts");
      expect(result.files).toContain("style.css");
      expect(result.files).toContain("image.png");
    });

    it("should not include directories, only files", async () => {
      await mkdir(path.join(tempDir, "empty-dir"), { recursive: true });
      await mkdir(path.join(tempDir, "subdir"), { recursive: true });
      await writeFile(path.join(tempDir, "subdir", "file.txt"), "content");

      const result = await readProject(tempDir);

      expect(result.files).toContain("subdir/file.txt");
      expect(result.files).not.toContain("empty-dir");
      expect(result.files).toHaveLength(1);
    });

    it("should handle files with spaces in names", async () => {
      await writeFile(path.join(tempDir, "file with spaces.txt"), "content");

      const result = await readProject(tempDir);

      expect(result.files).toContain("file with spaces.txt");
    });

    it("should handle files with special characters", async () => {
      await writeFile(path.join(tempDir, "file-with-dashes.txt"), "content");
      await writeFile(path.join(tempDir, "file_with_underscores.txt"), "content");
      await writeFile(path.join(tempDir, "file.with.dots.txt"), "content");

      const result = await readProject(tempDir);

      expect(result.files).toContain("file-with-dashes.txt");
      expect(result.files).toContain("file_with_underscores.txt");
      expect(result.files).toContain("file.with.dots.txt");
    });

    it("should use process.cwd() when no directory provided", async () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        await writeFile(path.join(tempDir, "test.txt"), "content");

        const result = await readProject();

        expect(result.files).toContain("test.txt");
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle realistic project structure", async () => {
      // Create a mini project structure
      await mkdir(path.join(tempDir, "src", "components"), { recursive: true });
      await mkdir(path.join(tempDir, "src", "utils"), { recursive: true });
      await mkdir(path.join(tempDir, ".git"), { recursive: true });
      await mkdir(path.join(tempDir, "node_modules", "package"), { recursive: true });

      await writeFile(path.join(tempDir, "package.json"), "{}");
      await writeFile(path.join(tempDir, "README.md"), "# Project");
      await writeFile(path.join(tempDir, ".gitignore"), "node_modules");
      await writeFile(path.join(tempDir, "src", "index.ts"), "export {}");
      await writeFile(path.join(tempDir, "src", "components", "Button.tsx"), "Button");
      await writeFile(path.join(tempDir, "src", "utils", "helpers.ts"), "helpers");
      await writeFile(path.join(tempDir, ".git", "config"), "git config");
      await writeFile(path.join(tempDir, "node_modules", "package", "index.js"), "code");

      const result = await readProject(tempDir);

      // Should include project files
      expect(result.files).toContain("package.json");
      expect(result.files).toContain("README.md");
      expect(result.files).toContain(".gitignore");
      expect(result.files).toContain("src/index.ts");
      expect(result.files).toContain("src/components/Button.tsx");
      expect(result.files).toContain("src/utils/helpers.ts");

      // Should exclude .git and node_modules
      expect(result.files.some((f) => f.startsWith(".git/"))).toBe(false);
      expect(result.files.some((f) => f.startsWith("node_modules/"))).toBe(false);

      expect(result.files).toHaveLength(6);
    });

    it("should return consistent results across multiple calls", async () => {
      await writeFile(path.join(tempDir, "file1.txt"), "content1");
      await writeFile(path.join(tempDir, "file2.txt"), "content2");

      const result1 = await readProject(tempDir);
      const result2 = await readProject(tempDir);

      expect(result1.files).toEqual(result2.files);
    });

    it("should handle empty subdirectories gracefully", async () => {
      await mkdir(path.join(tempDir, "empty1"), { recursive: true });
      await mkdir(path.join(tempDir, "empty2"), { recursive: true });
      await writeFile(path.join(tempDir, "file.txt"), "content");

      const result = await readProject(tempDir);

      expect(result.files).toEqual(["file.txt"]);
    });

    it("should handle paths with forward slashes", async () => {
      await mkdir(path.join(tempDir, "dir1", "dir2"), { recursive: true });
      await writeFile(path.join(tempDir, "dir1", "dir2", "file.txt"), "content");

      const result = await readProject(tempDir);

      // Result should use forward slashes regardless of OS
      expect(result.files[0]).toBe("dir1/dir2/file.txt");
    });

    it("should ignore symlinked files that resolve outside project root", async () => {
      const outsideDir = await mkdtemp(path.join(tmpdir(), "readProject-outside-"));
      try {
        const outsideFile = path.join(outsideDir, "outside.txt");
        await writeFile(outsideFile, "outside");

        const linkPath = path.join(tempDir, "outside-link.txt");
        await symlink(outsideFile, linkPath);

        const result = await readProject(tempDir);
        expect(result.files).toEqual([]);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
