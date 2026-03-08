import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, access, constants } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { ensureDir } from "./ensureDir";
import { fileAssertions } from "../test/helpers";

describe("fs/ensureDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "ensureDir-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("ensureDir", () => {
    it("should create a directory that does not exist", async () => {
      const dirPath = path.join(tempDir, "new-dir");

      await ensureDir(dirPath);

      // Verify directory was created
      await fileAssertions.assertFileExists(tempDir, "new-dir");
    });

    it("should create nested directories", async () => {
      const dirPath = path.join(tempDir, "level1", "level2", "level3");

      await ensureDir(dirPath);

      // Verify all levels were created
      await fileAssertions.assertFileExists(tempDir, "level1/level2/level3");
      await fileAssertions.assertFileExists(tempDir, "level1");
      await fileAssertions.assertFileExists(tempDir, "level1/level2");
    });

    it("should not throw if directory already exists", async () => {
      const dirPath = path.join(tempDir, "existing-dir");

      // Create directory first time
      await ensureDir(dirPath);

      // Create same directory again - should not throw
      await expect(ensureDir(dirPath)).resolves.toBeUndefined();

      // Verify directory still exists
      await fileAssertions.assertFileExists(tempDir, "existing-dir");
    });

    it("should handle multiple sequential calls", async () => {
      const dir1 = path.join(tempDir, "dir1");
      const dir2 = path.join(tempDir, "dir2");
      const dir3 = path.join(tempDir, "dir3");

      await ensureDir(dir1);
      await ensureDir(dir2);
      await ensureDir(dir3);

      await fileAssertions.assertFileExists(tempDir, "dir1");
      await fileAssertions.assertFileExists(tempDir, "dir2");
      await fileAssertions.assertFileExists(tempDir, "dir3");
    });

    it("should handle directory paths with special characters", async () => {
      const dirPath = path.join(tempDir, "dir-with-dashes", "dir_with_underscores");

      await ensureDir(dirPath);

      await fileAssertions.assertFileExists(tempDir, "dir-with-dashes/dir_with_underscores");
    });

    it("should handle very deep nesting", async () => {
      const deepPath = path.join(tempDir, "a", "b", "c", "d", "e", "f", "g", "h", "i", "j");

      await ensureDir(deepPath);

      await fileAssertions.assertFileExists(tempDir, "a/b/c/d/e/f/g/h/i/j");
    });

    it("should work with absolute paths", async () => {
      const absolutePath = path.join(tempDir, "absolute", "path", "test");

      await ensureDir(absolutePath);

      await fileAssertions.assertFileExists(tempDir, "absolute/path/test");
      expect(path.isAbsolute(absolutePath)).toBe(true);
    });

    it("should handle parent directory already existing", async () => {
      const parentDir = path.join(tempDir, "parent");
      const childDir = path.join(parentDir, "child");

      // Create parent first
      await ensureDir(parentDir);

      // Then create child
      await ensureDir(childDir);

      await fileAssertions.assertFileExists(tempDir, "parent");
      await fileAssertions.assertFileExists(tempDir, "parent/child");
    });

    it("should handle empty string gracefully", async () => {
      // Empty string might represent current directory or cause error
      // Test actual behavior
      await expect(ensureDir("")).rejects.toThrow();
    });

    it("should create directories with consistent permissions", async () => {
      const dir1 = path.join(tempDir, "perm-test-1");
      const dir2 = path.join(tempDir, "perm-test-2");

      await ensureDir(dir1);
      await ensureDir(dir2);

      // Both should be readable and writable
      await expect(access(dir1, constants.R_OK | constants.W_OK)).resolves.toBeUndefined();
      await expect(access(dir2, constants.R_OK | constants.W_OK)).resolves.toBeUndefined();
    });
  });
});
