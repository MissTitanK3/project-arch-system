# Contributing to Project Arch

Thank you for your interest in contributing to Project Arch! This guide will help you get started.

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in your interactions.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Git

### Development Setup

### 1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/project-arch-system.git
cd project-arch-system
```

### 2. **Install dependencies**

```bash
pnpm install
```

### 3. **Build the project**

```bash
pnpm build
```

### 4. **Run tests**

```bash
pnpm test
```

### 5. **Run tests with coverage**

```bash
pnpm test --coverage
```

### Workspace Structure

This is a monorepo with the following packages:

- `packages/project-arch` - Core CLI and SDK
- `packages/create-project-arch` - Scaffolding tool

## Development Workflow

### Making Changes

#### 1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

#### 2. **Make your changes**

- Write clear, concise code
- Follow existing code style and conventions
- Add tests for new functionality
- Update documentation as needed

#### 3. **Run tests locally**

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/project-arch
pnpm test

# Run with coverage
pnpm test --coverage
```

#### 4. **Lint your code**

```bash
pnpm lint
```

#### 5. **Type check**

```bash
pnpm typecheck
```

### Commit Guidelines

We follow conventional commit format:

```bash
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

**Examples:**

```bash
feat(cli): add task lane visualization command

Add a new command to display task lane usage statistics
with color-coded output showing capacity and utilization.

Closes #123
```

```bash
fix(sdk): correct task ID validation range

Task IDs in the discovered lane should be 101-199, not 100-199.

Fixes #456
```

### Pull Request Process

1. **Update documentation**
   - Update README.md if needed
   - Add JSDoc comments for new functions
   - Update CHANGELOG.md following Keep a Changelog format

2. **Ensure tests pass**
   - All existing tests pass
   - New tests added for new features
   - Coverage remains above 95%

3. **Create a pull request**
   - Provide a clear title and description
   - Reference any related issues
   - Include screenshots for UI changes
   - List breaking changes, if any

4. **Code review**
   - Address reviewer feedback
   - Keep discussions respectful and constructive
   - Update PR based on feedback

5. **Merge**
   - PRs require at least one approval
   - All CI checks must pass
   - Squash commits when merging

## Testing Guidelines

### Writing Tests

We use Vitest for testing. Tests should:

- Be clear and descriptive
- Test one thing at a time
- Use arrange-act-assert pattern
- Mock external dependencies
- Clean up after themselves

**Example:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readTask } from "./tasks";

describe("readTask", () => {
  const testDir = "/tmp/test-project-arch";

  beforeEach(async () => {
    await setupTestDirectory(testDir);
  });

  afterEach(async () => {
    await cleanupTestDirectory(testDir);
  });

  it("should read a task with valid frontmatter", async () => {
    // Arrange
    const taskId = "005";

    // Act
    const task = await readTask(testDir, "phase-1", "milestone-1", taskId);

    // Assert
    expect(task.id).toBe(taskId);
    expect(task.title).toBeDefined();
    expect(task.status).toMatch(/not-started|in-progress|complete|blocked/);
  });

  it("should throw error for invalid task ID", async () => {
    // Arrange & Act & Assert
    await expect(readTask(testDir, "phase-1", "milestone-1", "999")).rejects.toThrow(
      "Invalid task ID",
    );
  });
});
```

### Test Coverage

- Maintain minimum 95% statement coverage
- Focus on edge cases and error conditions
- Test public API thoroughly
- Integration tests for CLI commands

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over promises
- Avoid `any` type - use `unknown` if needed
- Export types for public API

### Formatting

We use ESLint for linting:

```bash
pnpm lint
pnpm lint --fix
```

### Comments

- Use JSDoc for public API
- Explain "why" not "what"
- Keep comments up to date
- Remove commented-out code

**Example:**

```typescript
/**
 * Read a task from the filesystem.
 *
 * @param projectRoot - Root directory of the project
 * @param phaseId - ID of the phase containing the task
 * @param milestoneId - ID of the milestone containing the task
 * @param taskId - ID of the task to read (e.g., "005")
 * @returns The parsed task object
 * @throws {Error} If task file is not found or has invalid format
 */
export async function readTask(
  projectRoot: string,
  phaseId: string,
  milestoneId: string,
  taskId: string,
): Promise<Task> {
  // Implementation
}
```

## Documentation

### README Updates

When adding features:

- Add to relevant section in README
- Include code examples
- Update table of contents if needed
- Add to CHANGELOG.md

### API Documentation

- JSDoc comments for all public functions
- Include parameter descriptions
- Document return types
- Note any exceptions thrown

### Examples

Add examples to `examples/` directory:

```bash
examples/
├── basic-cli/
│   ├── README.md
│   └── example.sh
├── sdk-integration/
│   ├── README.md
│   └── index.ts
└── custom-commands/
    ├── README.md
    └── custom-check.ts
```

## Adding New Features

### CLI Commands

1. Add command handler in `src/cli/commands/`
2. Register command in `src/cli.ts`
3. Add tests in `src/cli/commands/__tests__/`
4. Update CLI help text
5. Add documentation to README
6. Add example to `examples/`

### SDK Functions

1. Add function in appropriate module in `src/sdk/`
2. Export from `src/sdk/index.ts`
3. Add tests co-located with implementation
4. Add JSDoc documentation
5. Update README SDK section
6. Add TypeScript example

### Validation Checks

1. Add check in `src/core/checks/`
2. Register in `src/core/checks/index.ts`
3. Add comprehensive tests
4. Document in README
5. Add to CHANGELOG

## Reporting Bugs

### Before Submitting

- Check existing issues
- Verify it's not already fixed in main branch
- Collect relevant information

### Creating an Issue

Include:

- Clear, descriptive title
- Steps to reproduce
- Expected behavior
- Actual behavior
- Project Arch version
- Node.js version
- Operating system
- Relevant logs or error messages

**Template:**

```markdown
## Description

Brief description of the bug

## Steps to Reproduce

1. Step one
2. Step two
3. Step three

## Expected Behavior

What should happen

## Actual Behavior

What actually happens

## Environment

- Project Arch version: 1.1.0
- Node.js version: 18.16.0
- OS: Ubuntu 22.04

## Additional Context

Any other relevant information
```

## Suggesting Features

We welcome feature suggestions! Please:

- Check existing issues and discussions
- Describe the use case clearly
- Explain benefits and alternatives
- Be open to discussion and feedback

## Release Process

(For maintainers)

1. Update version in package.json
2. Update CHANGELOG.md
3. Run full test suite
4. Build packages
5. Create git tag
6. Push to npm
7. Create GitHub release

## Questions?

- 📖 Check the [documentation](https://github.com/MissTitanK3/project-arch-system#readme)
- 💬 Start a [discussion](https://github.com/MissTitanK3/project-arch-system/discussions)
- 🐛 Open an [issue](https://github.com/MissTitanK3/project-arch-system/issues)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
