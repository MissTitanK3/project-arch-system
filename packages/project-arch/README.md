# project-arch

[![NPM Version](https://img.shields.io/npm/v/project-arch.svg)](https://www.npmjs.com/package/project-arch)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Test Coverage](https://img.shields.io/badge/coverage-96.84%25-brightgreen.svg)](coverage/index.html)

`project-arch` is a deterministic repository-native architecture CLI and SDK designed to manage and validate architectural modules, decisions, and boundaries across your monorepo. It provides a structured approach to managing project phases, milestones, tasks, and architectural decision records (ADRs).

## Features

✨ **Architecture-First Development** - Structure your project around phases, milestones, and tasks  
📋 **Task Lane System** - Organize tasks into planned, discovered, and backlog lanes  
📝 **Architecture Decision Records** - Document and track architectural decisions  
✅ **Validation & Checks** - Ensure consistency across your architecture  
📊 **Reporting & Documentation** - Generate comprehensive reports and docs  
🔧 **TypeScript SDK** - Programmatic access to all functionality  
🎯 **96.84% Test Coverage** - 592 tests ensuring reliability

## Installation

Install as a workspace dependency:

```bash
# Using pnpm (recommended)
pnpm install project-arch -w

# Using npm
npm install project-arch --save

# Using yarn
yarn add project-arch
```

Or install globally:

```bash
npm install -g project-arch
```

## Quick Start

Initialize a new architecture in your project:

```bash
# Initialize the architecture directory
pa init

# Create a new phase
pa phase new phase-1

# Create a milestone within the phase
pa milestone new phase-1 milestone-1

# Create a planned task
pa task new phase-1 milestone-1

# Run validations
pa check

# Generate documentation
pa docs
```

## CLI Commands Reference

The primary command surface is `pa` (Project Arch).

### Core Commands

#### `pa init`

Initialize the architecture directory structure in your project.

```bash
pa init

# Creates:
# arch-model/
#   ├── phases/
#   ├── decisions/
#   └── docs/
```

#### `pa check`

Run architectural validations to ensure consistency and compliance.

```bash
pa check

# Validates:
# - Task ID ranges match lane directories
# - Milestone and phase structure
# - Decision record format
# - Graph dependencies
```

#### `pa report`

Generate a comprehensive report of the current architecture state.

```bash
pa report

# Outputs:
# - Phase and milestone status
# - Task completion statistics
# - Decision count by status
# - Graph metrics
```

#### `pa docs`

Generate markdown documentation for the architecture graph.

```bash
pa docs

# Generates documentation in arch-model/docs/
```

#### `pa help [command]`

Display comprehensive help documentation.

```bash
# General help
pa help

# Command-specific help
pa help task
pa help check
pa help phase
```

### Phase Management

#### `pa phase new <phase-id>`

Create a new project phase.

```bash
pa phase new phase-1
pa phase new phase-2-refactor
```

#### `pa phase list`

List all phases in the project.

```bash
pa phase list
```

### Milestone Management

#### `pa milestone new <phase-id> <milestone-id>`

Create a new milestone within a phase.

```bash
pa milestone new phase-1 milestone-1
pa milestone new phase-1 api-foundation
```

#### `pa milestone list <phase-id>`

List all milestones in a phase.

```bash
pa milestone list phase-1
```

### Decision Management

#### `pa decision new <decision-id>`

Create a new Architecture Decision Record (ADR).

```bash
pa decision new use-typescript
pa decision new adopt-microservices
```

#### `pa decision list`

List all architecture decisions.

```bash
pa decision list
```

## Task Lanes

Tasks are organized into three lanes with dedicated ID ranges:

| Lane       | Range   | Purpose                                  |
| ---------- | ------- | ---------------------------------------- |
| planned    | 001-099 | Pre-planned tasks for milestone delivery |
| discovered | 101-199 | Tasks discovered during implementation   |
| backlog    | 901-999 | Ideas and future work not yet scheduled  |

### Working with Task Lanes

#### Create a Planned Task

```bash
# Create a planned task (IDs 001-099)
pa task new phase-1 milestone-1

# Prompts for:
# - Task title
# - Description
# - Assigns next available ID in planned lane
```

#### Create a Discovered Task

```bash
# Create a discovered task (IDs 101-199)
pa task discover phase-1 milestone-1 --from 005

# Creates a task discovered during implementation of task 005
# Tracks drift from original plan
```

#### Create a Backlog Idea

```bash
# Create a backlog idea (IDs 901-999)
pa task idea phase-1 milestone-1

# For future work not yet scheduled
```

#### View Lane Usage

```bash
# View lane usage and next available IDs
pa task lanes phase-1 milestone-1

# Output:
# Planned Lane (001-099):
#   Used: 001, 002, 005
#   Next Available: 003
#
# Discovered Lane (101-199):
#   Used: 101, 105
#   Next Available: 102
#
# Backlog Lane (901-999):
#   Used: 901
#   Next Available: 902
```

#### Update Task Status

```bash
# Mark task as in progress
pa task start phase-1 milestone-1 003

# Complete a task
pa task complete phase-1 milestone-1 003

# Block a task
pa task block phase-1 milestone-1 003 --reason "Waiting for API design"
```

### Task ID Validation

Task IDs must match their lane directory:

- Tasks in `tasks/planned/` must have IDs 001-099
- Tasks in `tasks/discovered/` must have IDs 101-199
- Tasks in `tasks/backlog/` must have IDs 901-999

Invalid IDs will produce detailed error messages showing valid ranges.

## SDK/Programmatic Usage

`project-arch` exposes a TypeScript SDK for programmatic consumption of parsing and validation routines.

### Basic Usage

```typescript
import { check, graph, tasks, phases } from "project-arch";

// Execute checks programmatically
const results = await check.runRepositoryChecks(process.cwd());
console.log(`Passed: ${results.passed}, Failed: ${results.failed}`);

// Parse the dependency graph
const nodes = await graph.buildProjectGraph(process.cwd());
console.log(`Found ${nodes.length} nodes in graph`);
```

### Working with Tasks

```typescript
import { tasks } from "project-arch";

// Read all tasks in a milestone
const allTasks = await tasks.readTasks(process.cwd(), "phase-1", "milestone-1");

// Filter by lane
const plannedTasks = allTasks.filter((t) => t.id >= 1 && t.id <= 99);
const discoveredTasks = allTasks.filter((t) => t.id >= 101 && t.id <= 199);

// Get task by ID
const task005 = await tasks.readTask(process.cwd(), "phase-1", "milestone-1", "005");
console.log(`Task: ${task005.title}, Status: ${task005.status}`);

// Update task status
await tasks.updateTaskStatus(process.cwd(), "phase-1", "milestone-1", "005", "complete");
```

### Working with Phases and Milestones

```typescript
import { phases, milestones } from "project-arch";

// List all phases
const allPhases = await phases.listPhases(process.cwd());
console.log(`Found ${allPhases.length} phases`);

// Get phase details
const phase = await phases.readPhase(process.cwd(), "phase-1");
console.log(`Phase: ${phase.title}, Status: ${phase.status}`);

// List milestones in a phase
const phaseMilestones = await milestones.listMilestones(process.cwd(), "phase-1");
```

### Working with Decisions

```typescript
import { decisions } from "project-arch";

// List all decisions
const allDecisions = await decisions.listDecisions(process.cwd());

// Filter by status
const accepted = allDecisions.filter((d) => d.status === "accepted");
const proposed = allDecisions.filter((d) => d.status === "proposed");

// Read decision details
const decision = await decisions.readDecision(process.cwd(), "use-typescript");
console.log(`Decision: ${decision.title}`);
console.log(`Status: ${decision.status}`);
console.log(`Context: ${decision.context}`);
```

### Running Validations

```typescript
import { check } from "project-arch";

// Run all checks
const results = await check.runRepositoryChecks(process.cwd());

// Handle failures
if (results.failed > 0) {
  console.error("Validation failures:");
  results.failures.forEach((failure) => {
    console.error(`  - ${failure.check}: ${failure.message}`);
  });
  process.exit(1);
}

// Run specific checks
const taskValidation = await check.validateTasks(process.cwd());
const phaseValidation = await check.validatePhases(process.cwd());
```

### Building the Graph

```typescript
import { graph } from "project-arch";

// Build full dependency graph
const nodes = await graph.buildProjectGraph(process.cwd());

// Trace dependencies for a specific task
const dependencies = await graph.traceTask(process.cwd(), "phase-1", "milestone-1", "005");

console.log(`Task 005 depends on: ${dependencies.upstream.join(", ")}`);
console.log(`Task 005 is required by: ${dependencies.downstream.join(", ")}`);

// Check for circular dependencies
const circularDeps = await graph.detectCircularDependencies(process.cwd());
if (circularDeps.length > 0) {
  console.warn("Warning: Circular dependencies detected");
  circularDeps.forEach((cycle) => {
    console.warn(`  Cycle: ${cycle.join(" -> ")}`);
  });
}
```

## Configuration

Project Arch uses a `.project-arch.json` configuration file at the root of your project:

```json
{
  "archModelDir": "arch-model",
  "validation": {
    "strictTaskIds": true,
    "requireDecisionStatus": true,
    "enforceTaskDependencies": true
  },
  "reporting": {
    "includeBacklog": false,
    "groupByPhase": true
  }
}
```

### Configuration Options

- `archModelDir` - Directory for architecture files (default: `arch-model`)
- `validation.strictTaskIds` - Enforce strict task ID ranges (default: `true`)
- `validation.requireDecisionStatus` - Require status on all ADRs (default: `true`)
- `validation.enforceTaskDependencies` - Validate task dependency graph (default: `true`)
- `reporting.includeBacklog` - Include backlog items in reports (default: `false`)
- `reporting.groupByPhase` - Group reports by phase (default: `true`)

## Architecture Structure

Project Arch organizes your architecture into the following structure:

```bash
arch-model/
├── phases/
│   └── phase-1/
│       ├── phase.md              # Phase description and goals
│       └── milestones/
│           └── milestone-1/
│               ├── milestone.md  # Milestone description
│               └── tasks/
│                   ├── planned/
│                   │   ├── 001-setup-project.md
│                   │   └── 002-implement-auth.md
│                   ├── discovered/
│                   │   └── 101-fix-auth-bug.md
│                   └── backlog/
│                       └── 901-performance-optimization.md
├── decisions/
│   ├── 001-use-typescript.md
│   └── 002-adopt-microservices.md
└── docs/
    └── graph.md                  # Generated documentation
```

### Task File Format

Tasks are markdown files with YAML frontmatter:

```markdown
---
id: "005"
title: "Implement user authentication"
status: "in-progress"
priority: "high"
lane: "planned"
dependencies:
  - "003"
  - "004"
tags:
  - "auth"
  - "security"
---

## Description

Implement JWT-based authentication for the API.

## Acceptance Criteria

- [ ] JWT token generation
- [ ] Token validation middleware
- [ ] Refresh token mechanism
- [ ] Password hashing with bcrypt

## Notes

Consider using passport.js for flexibility.
```

### Decision File Format

Decisions follow the ADR format:

```markdown
---
id: "use-typescript"
title: "Use TypeScript for all new code"
status: "accepted"
date: "2026-02-15"
---

## Context

We need to improve code quality and developer experience.

## Decision

We will use TypeScript for all new code in the project.

## Consequences

### Positive

- Improved type safety
- Better IDE support
- Easier refactoring

### Negative

- Additional build step required
- Learning curve for team members
```

## Testing

Project Arch has comprehensive test coverage (96.84% statement coverage with 592 tests).

Run tests:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test tasks.test.ts

# Watch mode
pnpm test --watch
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/MissTitanK3/project-arch-system.git
cd project-arch-system

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint
```

## Examples

See the [examples/](examples/) directory for complete examples:

- [Basic CLI Usage](examples/basic-cli/README.md) - Getting started with CLI commands
- [SDK Integration](examples/sdk-integration/README.md) - Using the SDK programmatically
- [Custom Commands](examples/custom-commands/README.md) - Extending with custom commands
- [ADR Workflow](examples/adr-workflow/README.md) - Architecture decision record workflow

## Migration Guide

### From v1.0.0 to v1.1.0

Version 1.1.0 introduces the task lane system. To migrate:

1. Move existing tasks to appropriate lane directories:
   - Tasks 001-099 → `tasks/planned/`
   - Tasks 101-199 → `tasks/discovered/`
   - Tasks 901-999 → `tasks/backlog/`

2. Update task frontmatter to include `lane` field:

   ```yaml
   lane: "planned" # or "discovered" or "backlog"
   ```

3. Run validation to ensure proper migration:

   ```bash
   pa check
   ```

## Troubleshooting

### Task ID validation errors

**Error**: `Task ID 150 is invalid for lane 'planned'. Valid range: 001-099`

**Solution**: Move the task to the correct lane directory or update its ID.

### Circular dependency detected

**Error**: `Circular dependency detected: task-001 -> task-002 -> task-001`

**Solution**: Review task dependencies and break the cycle.

### Missing phase or milestone

**Error**: `Phase 'phase-1' not found`

**Solution**: Create the phase first using `pa phase new phase-1`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and migration guides.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- 📖 [Documentation](https://github.com/MissTitanK3/project-arch-system#readme)
- 🐛 [Issue Tracker](https://github.com/MissTitanK3/project-arch-system/issues)
- 💬 [Discussions](https://github.com/MissTitanK3/project-arch-system/discussions)

## Acknowledgments

Built with:

- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Zod](https://github.com/colinhacks/zod) - Schema validation
- [gray-matter](https://github.com/jonschlinkert/gray-matter) - Frontmatter parsing
- [fast-glob](https://github.com/mrmlnc/fast-glob) - File system operations
