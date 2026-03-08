/**
 * Test Helpers
 *
 * Central export point for all test utilities, fixtures, and assertions.
 *
 * Import from this index for cleaner imports:
 *
 * @example
 * ```typescript
 * import { createTestProject, fixtures, assertSuccess } from "../../test/helpers";
 * ```
 */

// Project setup utilities
export {
  createTempDir,
  createTestProject,
  setupTestProject,
  fileExists,
  type TestProjectContext,
} from "./projectSetup";

// Test fixtures and data
export { fixtures, testData, testAssertions } from "./fixtures";

// Custom assertions
export {
  resultAssertions,
  fileAssertions,
  consoleAssertions,
  dataAssertions,
  schemaAssertions,
  assertions,
} from "./assertions";

// Common assertion functions for convenience
export {
  resultAssertions as result,
  fileAssertions as file,
  consoleAssertions as console,
  dataAssertions as data,
  schemaAssertions as schema,
} from "./assertions";
