import { mkdtemp, rm, pathExists, readFile, copy } from "fs-extra";
import { tmpdir } from "os";
import path from "path";
import { expect } from "vitest";
import { initializeProject, InitOptions } from "../core/init/initializeProject";
import { OperationResult } from "../types/result";

export interface TestProjectContext {
  tempDir: string;
  cleanup: () => Promise<void>;
}

let defaultFixturePromise: Promise<string> | null = null;
async function runCleanupWithTimeout(cleanup: () => Promise<void>): Promise<void> {
  await cleanup().catch(() => {
    // best-effort: ignore errors so a failed cleanup never blocks suite progress
  });
}

function shouldUseDefaultFixture(options?: Partial<InitOptions>): boolean {
  if (!options) {
    return true;
  }

  return Object.keys(options).length === 0;
}

async function getDefaultFixtureDir(): Promise<string> {
  if (!defaultFixturePromise) {
    defaultFixturePromise = (async () => {
      const fixtureContext = await createTempDir();
      await initializeProject(
        {
          template: "nextjs-turbo",
          pm: "pnpm",
        },
        fixtureContext.tempDir,
      );
      return fixtureContext.tempDir;
    })();
  }

  return defaultFixturePromise;
}

export async function createTempDir(): Promise<TestProjectContext> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "pa-test-"));
  return {
    tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export async function createTestProject(
  originalCwd: string,
  options?: Partial<InitOptions>,
  config?: { setCwd?: boolean },
): Promise<TestProjectContext> {
  const context = await createTempDir();
  const shouldSetCwd = config?.setCwd !== false;
  const fallbackCwd = (await pathExists(originalCwd)) ? originalCwd : process.cwd();
  let cleanedUp = false;

  if (shouldSetCwd) {
    process.chdir(context.tempDir);
  }

  try {
    if (shouldUseDefaultFixture(options)) {
      const fixtureDir = await getDefaultFixtureDir();
      await copy(fixtureDir, context.tempDir, { overwrite: true, errorOnExist: false });
    } else {
      await initializeProject(
        {
          template: "nextjs-turbo",
          pm: "pnpm",
          ...options,
        },
        context.tempDir,
      );
    }
  } catch (error) {
    if (shouldSetCwd && process.cwd() !== fallbackCwd) {
      process.chdir(fallbackCwd);
    }
    await runCleanupWithTimeout(context.cleanup);
    throw error;
  }

  return {
    tempDir: context.tempDir,
    cleanup: async () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;

      if (process.cwd().startsWith(context.tempDir)) {
        process.chdir(fallbackCwd);
      } else if (shouldSetCwd && process.cwd() !== fallbackCwd) {
        process.chdir(fallbackCwd);
      }

      await runCleanupWithTimeout(context.cleanup);
    },
  };
}

type SuccessResult<T> = OperationResult<T> & {
  success: true;
  data: T;
  errors?: undefined;
};

type ErrorResult = OperationResult<unknown> & {
  success: false;
  errors: string[];
};

function assertSuccess<T>(
  result: OperationResult<T>,
  message?: string,
): asserts result is SuccessResult<NonNullable<T>> {
  const errorMsg =
    message || `Expected operation to succeed, but got errors: ${result.errors?.join(", ")}`;
  expect(result.success, errorMsg).toBe(true);
  expect(result.data, `${message || "Success result"} should have data`).toBeDefined();
  expect(result.errors, `${message || "Success result"} should not have errors`).toBeUndefined();
}

function assertError(
  result: OperationResult<unknown>,
  message?: string,
): asserts result is ErrorResult {
  const errorMsg = message || "Expected operation to fail";
  expect(result.success, errorMsg).toBe(false);
  expect(result.errors, `${message || "Error result"} should have errors`).toBeDefined();
  if (result.errors) {
    expect(result.errors.length, `${errorMsg}: should have at least one error`).toBeGreaterThan(0);
  }
}

function assertErrorContains(
  result: OperationResult<unknown>,
  searchText: string,
  message?: string,
): void {
  assertError(result, message);
  const errors = result.errors.join(" ");
  const errorMsg = message || `Error should contain "${searchText}"`;
  expect(errors, errorMsg).toContain(searchText);
}

type ResultAssertions = {
  assertSuccess: typeof assertSuccess;
  assertError: typeof assertError;
  assertErrorContains: typeof assertErrorContains;
};

export const resultAssertions: ResultAssertions = {
  assertSuccess,
  assertError,
  assertErrorContains,
};

export const fileAssertions = {
  async assertFileExists(baseDir: string, relativePath: string): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const exists = await pathExists(fullPath);
    expect(exists, `File should exist at ${relativePath}`).toBe(true);
  },

  async assertFileContains(
    baseDir: string,
    relativePath: string,
    searchText: string,
  ): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const content = await readFile(fullPath, "utf-8");
    expect(content, `File ${relativePath} should contain "${searchText}"`).toContain(searchText);
  },
};

interface ConsoleSpy {
  mock: { calls: unknown[][] };
  (): void;
}

export const consoleAssertions = {
  assertConsoleContains(spy: ConsoleSpy, searchText: string, message?: string): void {
    const calls = spy.mock.calls.flat().join(" ");
    const errorMsg = message || `Console output should contain "${searchText}"`;
    expect(calls, errorMsg).toContain(searchText);
  },
};
