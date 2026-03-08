/**
 * Project Setup Helpers
 *
 * Utilities for setting up isolated test project environments.
 * Handles temp directory creation, project initialization, and cleanup.
 */

import { mkdtemp, rm, pathExists } from "fs-extra";
import { tmpdir } from "os";
import path from "path";
import { initializeProject, InitOptions } from "../../src/core/init/initializeProject";

/**
 * Test project context containing directory path and cleanup function.
 */
export interface TestProjectContext {
  tempDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated temporary directory for testing.
 *
 * Returns a context with the temp directory path and cleanup function.
 * The caller is responsible for calling cleanup() after the test.
 *
 * @example
 * ```typescript
 * const context = await createTempDir();
 * const originalCwd = process.cwd();
 * process.chdir(context.tempDir);
 *
 * try {
 *   // Run test
 * } finally {
 *   process.chdir(originalCwd);
 *   await context.cleanup();
 * }
 * ```
 */
export async function createTempDir(): Promise<TestProjectContext> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "pa-test-"));

  return {
    tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Create and initialize a temporary test project.
 *
 * Sets up a new temp directory and initializes it with the given template.
 * Changes process.cwd() to the temp directory.
 *
 * @param originalCwd - The original working directory to restore after cleanup
 * @param options - Project initialization options (defaults to nextjs-turbo/pnpm)
 * @returns Test project context with initialized directory
 *
 * @example
 * ```typescript
 * const originalCwd = process.cwd();
 * const context = await createTestProject(originalCwd);
 *
 * try {
 *   // Test code with initialized project
 * } finally {
 *   process.chdir(originalCwd);
 *   await context.cleanup();
 * }
 * ```
 */
export async function createTestProject(
  originalCwd: string,
  options?: Partial<InitOptions>,
): Promise<TestProjectContext> {
  const context = await createTempDir();
  process.chdir(context.tempDir);

  try {
    await initializeProject({
      template: "nextjs-turbo",
      pm: "pnpm",
      ...options,
    });
  } catch (error) {
    await context.cleanup();
    throw error;
  }

  return context;
}

/**
 * Standard beforeEach/afterEach pattern for tests using temp projects.
 *
 * Encapsulates the pattern of creating a temp directory, changing to it,
 * and cleaning up afterward.
 *
 * @example
 * ```typescript
 * describe("MyModule", () => {
 *   let context: TestProjectContext;
 *   const originalCwd = process.cwd();
 *
 *   beforeEach(async () => {
 *     context = await createTestProject(originalCwd);
 *   });
 *
 *   afterEach(async () => {
 *     process.chdir(originalCwd);
 *     await context.cleanup();
 *   });
 *
 *   it("should work", () => {
 *     // Test code runs in context.tempDir
 *   });
 * });
 * ```
 */
export function setupTestProject() {
  const originalCwd = process.cwd();
  let context: TestProjectContext;

  const beforeEach = async () => {
    context = await createTestProject(originalCwd);
  };

  const afterEach = async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  };

  return {
    beforeEach,
    afterEach,
    getContext: () => context,
    getOriginalCwd: () => originalCwd,
  };
}

/**
 * Check if a file exists in the test project context.
 *
 * Useful for assertions about generated files.
 *
 * @example
 * ```typescript
 * const exists = await fileExists(context.tempDir, ".arch/manifest.json");
 * expect(exists).toBe(true);
 * ```
 */
export async function fileExists(baseDir: string, relativePath: string): Promise<boolean> {
  return pathExists(path.join(baseDir, relativePath));
}
