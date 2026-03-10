# Testing Guide

This guide documents the testing patterns, strategies, and conventions used throughout the project-arch system codebase.

## Overview

- **Test Framework**: [Vitest](https://vitest.dev/) 4.0.18+
- **Test Runner**: `pnpm test` (from `packages/project-arch`)
- **Coverage**: 945 tests across 94 test files
- **Target Coverage**: >80% for critical modules (SDK, core, CLI)

## Quick Start

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage report
pnpm test --coverage

# Run specific test file
pnpm test src/core/tasks/createTask.test.ts

# Run tests matching a pattern
pnpm test --grep "createTask"
```

## Test Organization

Test files are colocated with implementation files using the `.test.ts` suffix:

```bash
src/
├── core/
│   ├── tasks/
│   │   ├── createTask.ts
│   │   ├── createTask.test.ts    # Tests for createTask
│   │   ├── updateTask.ts
│   │   └── updateTask.test.ts
├── cli/
│   ├── commands/
│   │   ├── task.ts
│   │   └── task.test.ts
└── sdk/
    ├── graph.ts
    └── graph.test.ts
```

This structure makes it easy to:

- Find tests for a given module
- Update tests when refactoring
- Verify test coverage for all exports

## Common Test Patterns

### 1. Setting up Isolated Project Environment

Most tests work with a temporary project to isolate side effects and ensure consistency:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import path from "path";
import { initializeProject } from "../init/initializeProject";

describe("MyModule", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    // Create isolated temp directory for this test
    tempDir = await mkdtemp(path.join(tmpdir(), "pa-test-"));
    process.chdir(tempDir);

    // Initialize a test project with required options
    await initializeProject({ template: "nextjs-turbo", pm: "pnpm" });
  });

  afterEach(async () => {
    // Restore original directory and clean up temp files
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should do something", () => {
    // Test implementation
  });
});
```

**Key points:**

- Always restore `process.cwd()` after changing it
- Create unique temp dirs per test (prevents interference)
- Use `initializeProject({ template: "nextjs-turbo", pm: "pnpm" })` to seed the project
- Clean up with `rm(..., { recursive: true, force: true })`

### 2. Testing Command Handlers

CLI command tests simulate the Commander.js program flow:

```typescript
import { Command } from "commander";
import { registerTaskCommand } from "./task";

describe("Task Commands", () => {
  it("should execute task new command", async () => {
    const program = new Command();
    program.exitOverride(); // Prevent actual exit
    registerTaskCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Simulate: task new <phaseId> <milestoneId> --lane <lane>
    await program.parseAsync([
      "node",
      "test",
      "task",
      "new",
      "phase-1",
      "milestone-1-setup",
      "--lane",
      "api",
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Created task"));
    consoleSpy.mockRestore();
  });
});
```

**Key points:**

- Create a fresh `Command()` instance per test
- Call `.exitOverride()` to prevent the program from exiting
- Mock `console.log` to capture output
- Use array format: `["node", "test", "command", "args"]`
- Pass positional arguments in order (not as options)
- Restore mocks after each test

### 3. Testing SDK Operations

SDK tests verify the operation result structure (`{ success: boolean, data?: any, errors?: string[] }`):

```typescript
import { registry } from "./registry";

describe("SDK Registry", () => {
  it("should export task operations", () => {
    expect(registry.tasks).toBeDefined();
    expect(registry.tasks.taskCreate).toBeDefined();
    expect(registry.tasks.taskDiscover).toBeDefined();

    // Verify operation is callable
    expect(typeof registry.tasks.taskCreate).toBe("function");
  });

  it("should return success result on valid input", async () => {
    const result = await registry.tasks.taskCreate({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "api",
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it("should return error result on invalid input", async () => {
    const result = await registry.tasks.taskCreate({
      phaseId: "", // Invalid
      milestoneId: "",
      lane: "",
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});
```

**Key points:**

- Verify exports exist and are functions
- Test success cases: `success: true`, `data` defined, `errors` undefined
- Test failure cases: `success: false`, `errors` defined and non-empty
- Use operation results to determine behavior

### 4. Testing Schemas

Schema tests validate structure and constraints:

```typescript
import { describe, it, expect } from "vitest";
import { taskSchema } from "./task";

describe("Task Schema", () => {
  it("should validate correct task data", () => {
    const validTask = {
      id: "task-123",
      phaseId: "phase-1",
      milestoneId: "milestone-1",
      lane: "api",
      title: "Implement feature",
    };

    const result = taskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const invalidTask = {
      id: "task-123",
      // Missing: phaseId, milestoneId, lane, title
    };

    const result = taskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
    expect(result.error?.issues.length).toBeGreaterThan(0);
  });

  it("should reject invalid field types", () => {
    const invalidTask = {
      id: "task-123",
      phaseId: "phase-1",
      milestoneId: "milestone-1",
      lane: "api",
      title: 123, // Should be string
    };

    const result = taskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });
});
```

**Key points:**

- Use `.safeParse()` instead of `.parse()` to get error info
- Test valid cases: `result.success === true`
- Test invalid cases: `result.success === false`
- Verify specific error messages when needed

### 5. Testing File Operations

File system tests should use temp directories and real file I/O:

```typescript
import { writeFile as writeFileOp } from "../writeFile";
import { readFile } from "fs-extra";
import path from "path";

describe("writeFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "pa-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should write file to disk", async () => {
    const filePath = path.join(tempDir, "test.md");
    const content = "# Test\n\nContent here";

    await writeFileOp(filePath, content);

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("should create parent directories", async () => {
    const filePath = path.join(tempDir, "nested/dirs/test.txt");

    await writeFileOp(filePath, "content");

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("content");
  });
});
```

**Key points:**

- Use real temp directories for isolation
- Test that files are actually written and readable
- Test directory creation and nested paths
- Verify file contents exactly

### 6. Testing with Fixtures

When tests reuse the same setup, extract to shared fixtures:

```typescript
// Create test projects with known state
const fixtures = {
  async emptyProject() {
    const tempDir = await mkdtemp(path.join(tmpdir(), "pa-test-"));
    process.chdir(tempDir);
    return tempDir;
  },

  async projectWithPhase() {
    const tempDir = await fixtures.emptyProject();
    await initializeProject({ template: "nextjs-turbo", pm: "pnpm" });
    return tempDir;
  },

  async projectWithTask() {
    const tempDir = await fixtures.projectWithPhase();
    await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "api",
    });
    return tempDir;
  },
};

describe("TaskOperations", () => {
  it("should list tasks in project", async () => {
    await fixtures.projectWithTask();
    const tasks = await listTasks();
    expect(tasks.length).toBeGreaterThan(0);
  });
});
```

### 7. Mocking and Spying

Use Vitest's mocking capabilities sparingly (prefer real modules):

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe("With Mocks", () => {
  it("should handle console output", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    myFunction(); // Function that calls console.log

    expect(consoleSpy).toHaveBeenCalledWith("expected output");
    consoleSpy.mockRestore();
  });

  it("should mock external dependencies", () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });

    // Only mock external APIs, not internal modules
    functionThatUses(mockFetch);

    expect(mockFetch).toHaveBeenCalled();
  });
});
```

**Key points:**

- Mock external APIs and console, not internal modules
- Use `.mockImplementation()` for consistent behavior
- Always `.mockRestore()` mocks after tests
- Prefer real imports when possible

## Test Categories

### Unit Tests

Test individual functions in isolation:

```typescript
describe("calculateLaneUsage", () => {
  it("should sum task counts by lane", () => {
    const result = calculateLaneUsage([
      { lane: "api", ... },
      { lane: "api", ... },
      { lane: "ui", ... },
    ]);

    expect(result.api).toBe(2);
    expect(result.ui).toBe(1);
  });
});
```

### Integration Tests

Test how modules interact:

```typescript
describe("Phase Workflow", () => {
  it("should create phase and add tasks", async () => {
    await createPhase("phase-1");
    const task = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "api",
    });

    expect(task.success).toBe(true);
  });
});
```

### Error Handling Tests

Test edge cases and error conditions:

```typescript
describe("Edge Cases", () => {
  it("should reject invalid phase ID", async () => {
    const result = await createTask({
      phaseId: "", // Invalid: empty string
      milestoneId: "milestone-1",
      lane: "api",
    });

    expect(result.success).toBe(false);
  });

  it("should handle missing files gracefully", async () => {
    const result = await readProject("/nonexistent");
    expect(result.success).toBe(false);
  });
});
```

## Debugging Tests

### Run a Single Test File

```bash
pnpm test src/core/tasks/createTask.test.ts
```

### Run Tests Matching a Pattern

```bash
pnpm test --grep "createTask"
```

### Enable Debug Output

Tests can use `console.log()` to debug. Output shows with `-t test-pattern`:

```bash
pnpm test --grep "specific test" 2>&1 | grep "debug output"
```

### Check Test Structure

Use the VSCode Testing sidebar to:

- View all tests in a file
- Run individual tests
- See pass/fail status
- Jump to test source

## Performance Considerations

### Test Runtime

Current test suite: **65 files, 440 tests, ~2 seconds total**

To maintain fast tests:

1. **Keep temp directory operations minimal**: Only create what's needed
2. **Parallelize independent tests**: Vitest runs tests in parallel by default
3. **Avoid network calls**: Mock external APIs
4. **Cache expensive operations**: Reuse fixtures when possible
5. **Profile slow tests**: Use `--reporter=verbose` to find bottlenecks

### Timeout Handling

Some tests may need longer timeouts if they do heavy I/O:

```typescript
it("heavy operation", async () => {
  // Long-running test
}, 10000); // 10 second timeout
```

## Common Assertions

### Checking Results

```typescript
// Success cases
expect(result.success).toBe(true);
expect(result.data).toBeDefined();
expect(result.errors).toBeUndefined();

// Error cases
expect(result.success).toBe(false);
expect(result.errors).toBeDefined();
expect(result.errors?.length).toBeGreaterThan(0);

// Specific values
expect(task.id).toMatch(/^task-\d+$/);
expect(tasks).toHaveLength(5);
expect(content).toContain("expected string");
```

### Checking File System

```typescript
// File exists
const exists = await pathExists(filePath);
expect(exists).toBe(true);

// Directory reads
const content = await readFile(filePath, "utf-8");
expect(content).toContain("expected content");
```

### Checking Commands

```typescript
// Console output
expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Created"));

// Multiple calls
expect(consoleSpy).toHaveBeenCalledTimes(2);
```

## Best Practices

### ✅ Do

- **Name tests clearly**: Describe what is being tested and why
- **Keep tests small**: One assertion per test when possible
- **Use real modules**: Import actual implementations, not mocks
- **Clean up after tests**: Remove temp files, restore mocks
- **Test behavior, not implementation**: Focus on inputs and outputs
- **Document complex tests**: Add comments explaining setup
- **Organize by feature**: Group related tests with `describe`

### ❌ Don't

- **Don't test implementation details**: Test the public API
- **Don't mock internal modules**: Use real implementations
- **Don't share state between tests**: Use `beforeEach`/`afterEach`
- **Don't ignore test failures**: Fix immediately
- **Don't create flaky tests**: Use deterministic test data
- **Don't comment out tests**: Delete or fix them
- **Don't test third-party libraries**: Trust their own tests

## Adding New Tests

When implementing a new feature:

1. **Create colocated test file**: `src/path/MyFeature.test.ts`
2. **Write failing test first**: Describe what should happen
3. **Implement feature**: Make the test pass
4. **Test edge cases**: Add tests for invalid inputs and errors
5. **Document patterns**: Add comments for unusual setups
6. **Run full suite**: Ensure no regressions

Example flow:

```typescript
// 1. Start with failing test
it("should create task with lane", async () => {
  const result = await createTask({ ... });
  expect(result.success).toBe(true); // Fails initially
});

// 2. Implement feature
export async function createTask(input: CreateTaskInput) {
  // Implementation
  return { success: true, data: ... };
}

// 3. Add edge cases
it("should fail with invalid lane", () => {
  const result = await createTask({ lane: "" });
  expect(result.success).toBe(false);
});

// 4. Run tests
// pnpm test --grep "createTask"
```

## Resources

- **Vitest Documentation**: <https://vitest.dev/>
- **Testing Library**: <https://testing-library.com/>
- **Project Architecture**: [../README.md](../README.md)
- **Test Coverage Report**: Run `pnpm test --coverage` for detailed metrics

## Contributing Tests

When contributing tests:

1. Follow the patterns in this guide
2. Match the style of existing tests
3. Test at the appropriate level (unit/integration)
4. Clean up all side effects
5. Ensure tests pass locally before submitting PR
6. Document unusual patterns with comments

For questions or clarifications, refer to existing test files for examples.
