/**
 * Custom Test Assertions
 *
 * Reusable assertion helpers and matchers for common test patterns.
 * These helpers make tests more readable and reduce boilerplate.
 */

import { expect } from "vitest";
import { pathExists, readFile } from "fs-extra";
import path from "path";
import { OperationResult } from "../../src/types/result";

/**
 * Assertion helpers for operation results.
 *
 * All SDK operations return { success: boolean, data?, errors? }
 */
export const resultAssertions = {
  /**
   * Assert that an operation succeeded.
   *
   * @example
   * ```typescript
   * const result = await createTask(...);
   * assertSuccess(result);
   * expect(result.data?.id).toBeDefined();
   * ```
   */
  assertSuccess(result: OperationResult<unknown>, message?: string): void {
    const errorMsg =
      message || `Expected operation to succeed, but got errors: ${result.errors?.join(", ")}`;
    expect(result.success, errorMsg).toBe(true);
    expect(result.data, `${message || "Success result"} should have data`).toBeDefined();
    expect(result.errors, `${message || "Success result"} should not have errors`).toBeUndefined();
  },

  /**
   * Assert that an operation failed.
   *
   * @example
   * ```typescript
   * const result = await createTask({ phaseId: "" });
   * assertError(result, "Invalid phase");
   * ```
   */
  assertError(result: OperationResult<unknown>, message?: string): void {
    const errorMsg = message || "Expected operation to fail";
    expect(result.success, errorMsg).toBe(false);
    expect(result.errors, `${message || "Error result"} should have errors`).toBeDefined();
    if (result.errors) {
      expect(result.errors.length, `${errorMsg}: should have at least one error`).toBeGreaterThan(
        0,
      );
    }
  },

  /**
   * Assert that an operation result has specific error message.
   *
   * @example
   * ```typescript
   * const result = await createTask({ phaseId: "" });
   * assertErrorContains(result, "phaseId");
   * ```
   */
  assertErrorContains(
    result: OperationResult<unknown>,
    searchText: string,
    message?: string,
  ): void {
    this.assertError(result, message);
    const errors = result.errors?.join(" ") || "";
    const errorMsg = message || `Error should contain "${searchText}"`;
    expect(errors, errorMsg).toContain(searchText);
  },

  /**
   * Assert a result has specific data type or shape.
   *
   * @example
   * ```typescript
   * const result = await createTask(...);
   * assertSuccess(result);
   * assertDataShape(result, { id: expect.any(String), lane: expect.any(String) });
   * ```
   */
  assertDataShape(
    result: OperationResult<Record<string, unknown>>,
    expectedShape: Record<string, unknown>,
  ): void {
    this.assertSuccess(result);
    expect(result.data).toMatchObject(expectedShape);
  },
};

/**
 * Assertion helpers for file system checks.
 */
export const fileAssertions = {
  /**
   * Assert that a file exists.
   *
   * @example
   * ```typescript
   * await assertFileExists(tempDir, ".arch/manifest.json");
   * ```
   */
  async assertFileExists(baseDir: string, relativePath: string): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const exists = await pathExists(fullPath);
    expect(exists, `File should exist at ${relativePath}`).toBe(true);
  },

  /**
   * Assert that a file does not exist.
   *
   * @example
   * ```typescript
   * await assertFileNotExists(tempDir, "deleted.json");
   * ```
   */
  async assertFileNotExists(baseDir: string, relativePath: string): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const exists = await pathExists(fullPath);
    expect(exists, `File should not exist at ${relativePath}`).toBe(false);
  },

  /**
   * Assert that a file contains specific text.
   *
   * @example
   * ```typescript
   * await assertFileContains(tempDir, "README.md", "Project Architecture");
   * ```
   */
  async assertFileContains(
    baseDir: string,
    relativePath: string,
    searchText: string,
  ): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const content = await readFile(fullPath, "utf-8");
    expect(content, `File ${relativePath} should contain "${searchText}"`).toContain(searchText);
  },

  /**
   * Assert that a file matches a regex pattern.
   *
   * @example
   * ```typescript
   * await assertFileMatches(tempDir, "manifest.json", /manifest/i);
   * ```
   */
  async assertFileMatches(baseDir: string, relativePath: string, pattern: RegExp): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const content = await readFile(fullPath, "utf-8");
    expect(content, `File ${relativePath} should match ${pattern}`).toMatch(pattern);
  },

  /**
   * Assert that a file does not contain specific text.
   *
   * @example
   * ```typescript
   * await assertFileNotContains(tempDir, "config.json", "DEBUG=true");
   * ```
   */
  async assertFileNotContains(
    baseDir: string,
    relativePath: string,
    searchText: string,
  ): Promise<void> {
    const fullPath = path.join(baseDir, relativePath);
    const content = await readFile(fullPath, "utf-8");
    expect(content, `File ${relativePath} should not contain "${searchText}"`).not.toContain(
      searchText,
    );
  },
};

/**
 * Assertion helpers for console output.
 *
 * Spy type for console methods (from Vitest spyOn).
 */
interface ConsoleSpy {
  mock: { calls: unknown[][] };
  (): void;
}

export const consoleAssertions = {
  /**
   * Assert that console.log was called with text containing searchText.
   *
   * @example
   * ```typescript
   * const spy = vi.spyOn(console, "log").mockImplementation(() => {});
   * await myFunction();
   * assertConsoleContains(spy, "Success", "console.log should show success message");
   * ```
   */
  assertConsoleContains(spy: ConsoleSpy, searchText: string, message?: string): void {
    const calls = spy.mock.calls.flat().join(" ");
    const errorMsg = message || `Console output should contain "${searchText}"`;
    expect(calls, errorMsg).toContain(searchText);
  },

  /**
   * Assert that console.log was called with text matching a pattern.
   *
   * @example
   * ```typescript
   * const spy = vi.spyOn(console, "log").mockImplementation(() => {});
   * await myFunction();
   * assertConsoleMatches(spy, /Created \w+/);
   * ```
   */
  assertConsoleMatches(spy: ConsoleSpy, pattern: RegExp, message?: string): void {
    const calls = spy.mock.calls.flat().join(" ");
    const errorMsg = message || `Console output should match ${pattern}`;
    expect(calls, errorMsg).toMatch(pattern);
  },

  /**
   * Assert that console.log was called exactly N times.
   *
   * @example
   * ```typescript
   * const spy = vi.spyOn(console, "log").mockImplementation(() => {});
   * await myFunction();
   * assertConsoleCallCount(spy, 3);
   * ```
   */
  assertConsoleCallCount(spy: ConsoleSpy, expectedCount: number, message?: string): void {
    const errorMsg = message || `console.log should be called ${expectedCount} times`;
    expect(spy, errorMsg).toHaveBeenCalledTimes(expectedCount);
  },

  /**
   * Assert that console output was not generated.
   *
   * @example
   * ```typescript
   * const spy = vi.spyOn(console, "log").mockImplementation(() => {});
   * await silentFunction();
   * assertNoConsoleOutput(spy);
   * ```
   */
  assertNoConsoleOutput(spy: ConsoleSpy, message?: string): void {
    const errorMsg = message || "console.log should not be called";
    expect(spy, errorMsg).not.toHaveBeenCalled();
  },
};

/**
 * Assertion helpers for data structures.
 */
export const dataAssertions = {
  /**
   * Assert that an array contains an object matching shape.
   *
   * @example
   * ```typescript
   * const tasks = await listTasks();
   * assertArrayContains(tasks, { lane: "api" });
   * ```
   */
  assertArrayContains(
    array: Record<string, unknown>[],
    searchObject: Record<string, unknown>,
    message?: string,
  ): void {
    const errorMsg =
      message || `Array should contain object matching ${JSON.stringify(searchObject)}`;
    expect(array, errorMsg).toContainEqual(expect.objectContaining(searchObject));
  },

  /**
   * Assert that an array has exactly N items.
   *
   * @example
   * ```typescript
   * const tasks = await listTasks();
   * assertArrayLength(tasks, 5, "should have 5 tasks");
   * ```
   */
  assertArrayLength(
    array: Record<string, unknown>[],
    expectedLength: number,
    message?: string,
  ): void {
    const errorMsg = message || `Array should have ${expectedLength} items`;
    expect(array, errorMsg).toHaveLength(expectedLength);
  },

  /**
   * Assert that an object has a property with expected value.
   *
   * @example
   * ```typescript
   * const task = await getTask(id);
   * assertObjectProperty(task, "lane", "api");
   * ```
   */
  assertObjectProperty<T extends Record<string, unknown>>(
    obj: T,
    property: keyof T,
    expectedValue: unknown,
    message?: string,
  ): void {
    const errorMsg =
      message ||
      `Object property "${String(property)}" should be "${expectedValue}" but is "${obj[property as keyof T]}"`;
    expect(obj[property as keyof T], errorMsg).toBe(expectedValue);
  },

  /**
   * Assert that an object has a property (regardless of value).
   *
   * @example
   * ```typescript
   * const task = await getTask(id);
   * assertObjectHasProperty(task, "id");
   * ```
   */
  assertObjectHasProperty<T extends Record<string, unknown>>(
    obj: T,
    property: keyof T,
    message?: string,
  ): void {
    const errorMsg = message || `Object should have property "${String(property)}"`;
    expect(obj, errorMsg).toHaveProperty(String(property));
  },
};

/**
 * Assertion helpers for schema validation.
 */
export const schemaAssertions = {
  /**
   * Assert that schema validation succeeded.
   *
   * @example
   * ```typescript
   * const result = taskSchema.safeParse(data);
   * assertSchemaValid(result);
   * ```
   */
  assertSchemaValid(parseResult: { success: boolean }, message?: string): void {
    const errorMsg = message || `Schema validation should succeed`;
    expect(parseResult.success, errorMsg).toBe(true);
  },

  /**
   * Assert that schema validation failed.
   *
   * @example
   * ```typescript
   * const result = taskSchema.safeParse(invalidData);
   * assertSchemaInvalid(result, "Invalid task");
   * ```
   */
  assertSchemaInvalid(
    parseResult: { success: boolean; error?: Record<string, unknown> },
    message?: string,
  ): void {
    const errorMsg = message || `Schema validation should fail`;
    expect(parseResult.success, errorMsg).toBe(false);
    expect(
      parseResult.error,
      `${message || "Invalid schema"} should have error info`,
    ).toBeDefined();
  },

  /**
   * Assert that schema validation has specific error.
   *
   * @example
   * ```typescript
   * const result = taskSchema.safeParse({ id: "" });
   * assertSchemaErrorContains(result, "id", "required");
   * ```
   */
  assertSchemaErrorContains(
    parseResult: { success: boolean; error?: Record<string, unknown> },
    fieldOrText: string,
    message?: string,
  ): void {
    this.assertSchemaInvalid(parseResult);
    const errorText = JSON.stringify(parseResult.error?.issues || []);
    const errorMsg = message || `Schema error should mention "${fieldOrText}"`;
    expect(errorText, errorMsg).toContain(fieldOrText);
  },
};

/**
 * Export all assertions for convenient importing.
 *
 * @example
 * ```typescript
 * import { assertSuccess, assertFileExists } from "../helpers/assertions";
 * ```
 */
export const assertions = {
  ...resultAssertions,
  ...fileAssertions,
  ...consoleAssertions,
  ...dataAssertions,
  ...schemaAssertions,
};

// Type helpers for assertions
export type { OperationResult } from "../../src/types/result";
