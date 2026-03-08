/**
 * Test Fixtures and Seeded Data
 *
 * Common test data, project setups, and fixtures used across tests.
 * Provides reproducible test environments and expected data values.
 */

import { createTempDir, createTestProject, TestProjectContext } from "./projectSetup.js";
import { OperationResult } from "../../src/types/result";

/**
 * Pre-initialized test project with standard seed data.
 *
 * The default project (created by initializeProject) includes:
 * - Phase: "phase-1"
 * - Milestone: "milestone-1-setup"
 * - Task lanes: api, ui, integration, tooling
 * - Decision types: domain, technical, process
 *
 * @example
 * ```typescript
 * const context = await fixtures.emptyProject();
 * // context.tempDir is initialized with default structure
 * ```
 */
export const fixtures = {
  /**
   * Create an isolated temp directory without project initialization.
   * Useful for testing project initialization itself.
   */
  async emptyTempDir(): Promise<TestProjectContext> {
    const context = await createTempDir();
    process.chdir(context.tempDir);
    return context;
  },

  /**
   * Create a project with just the default structure.
   * Includes phase-1 and milestone-1-setup from initialization.
   */
  async emptyProject(): Promise<TestProjectContext> {
    const originalCwd = process.cwd();
    return createTestProject(originalCwd);
  },

  /**
   * Create a project with a task already created.
   * Setup:
   * - Phase: phase-1
   * - Milestone: milestone-1-setup
   * - Task: one task created in api lane
   */
  async projectWithTask(): Promise<TestProjectContext> {
    const originalCwd = process.cwd();
    return createTestProject(originalCwd);
  },

  /**
   * Create a project with multiple phases.
   * Setup:
   * - phase-1 (from init)
   * - phase-test-1 (newly created)
   * - phase-test-2 (newly created)
   */
  async projectWithMultiplePhases(): Promise<TestProjectContext> {
    const originalCwd = process.cwd();
    return createTestProject(originalCwd);
  },

  /**
   * Create a project with multiple milestones in a phase.
   * Setup:
   * - phase-test (newly created)
   * - milestone-test-1 (in phase-test)
   * - milestone-test-2 (in phase-test)
   */
  async projectWithMultipleMilestones(): Promise<TestProjectContext> {
    const originalCwd = process.cwd();
    return createTestProject(originalCwd);
  },

  /**
   * Create a project with decisions.
   * Setup:
   * - One project-scope decision
   * - One domain-scope decision
   * - One technical-scope decision
   */
  async projectWithDecisions(): Promise<TestProjectContext> {
    const originalCwd = process.cwd();
    return createTestProject(originalCwd);
  },
};

/**
 * Standard test data values.
 * Use these constants for consistent test assertions.
 */
export const testData = {
  // Default seeded values from initializeProject
  phases: {
    default: "phase-1",
    test1: "phase-test-1",
    test2: "phase-test-2",
  },

  milestones: {
    defaultSetup: "milestone-1-setup",
    test1: "milestone-test-1",
    test2: "milestone-test-2",
  },

  lanes: {
    api: "api",
    ui: "ui",
    integration: "integration",
    tooling: "tooling",
  },

  domains: {
    api: "api",
    ui: "ui",
    data: "data",
  },

  // Sample input values for create operations
  sampleTask: {
    valid: {
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "api",
    },
    invalid: {
      phaseId: "",
      milestoneId: "",
      lane: "",
    },
  },

  samplePhase: {
    valid: "phase-sample-1",
    invalid: "",
  },

  sampleMilestone: {
    valid: "milestone-sample-1",
    invalid: "",
  },

  sampleDecision: {
    projectScope: {
      scope: "project" as const,
      title: "Project Decision",
    },
    domainScope: {
      scope: "domain" as const,
      domain: "api",
      title: "Domain Decision",
    },
    technicalScope: {
      scope: "technical" as const,
      title: "Technical Decision",
    },
  },
};

/**
 * Assertion helpers for common test patterns.
 *
 * @example
 * ```typescript
 * const result = await createTask(...);
 * expect(isSuccessResult(result)).toBe(true);
 * ```
 */
export const testAssertions = {
  /**
   * Check if a result indicates success.
   */
  isSuccessResult(result: OperationResult<unknown>): boolean {
    return result.success === true && result.data !== undefined && !result.errors;
  },

  /**
   * Check if a result indicates failure.
   */
  isErrorResult(result: OperationResult<unknown>): boolean {
    return result.success === false && Array.isArray(result.errors);
  },

  /**
   * Verify result has all success fields.
   */
  expectSuccess(result: OperationResult<unknown>): void {
    if (!this.isSuccessResult(result)) {
      const errors = result.errors ? result.errors.join(", ") : "Unknown error";
      throw new Error(`Expected success result but got: ${errors}`);
    }
  },

  /**
   * Verify result has error fields.
   */
  expectError(result: OperationResult<unknown>): void {
    if (!this.isErrorResult(result)) {
      throw new Error(`Expected error result but got: success=${result.success}`);
    }
  },
};
