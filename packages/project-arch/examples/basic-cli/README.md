# Basic CLI Usage Example

This example demonstrates the basic CLI workflow for getting started with Project Arch.

## Prerequisites

Ensure `project-arch` is installed:

```bash
npm install -g project-arch
# or
pnpm add -g project-arch
```

## Step-by-Step Workflow

### 1. Initialize Architecture

Navigate to your project and initialize the architecture directory:

```bash
cd my-project
pa init
```

This creates:

```bash
arch-model/
├── phases/
├── decisions/
└── docs/
```

### 2. Create Your First Phase

```bash
pa phase new phase-1
```

Edit the generated `arch-model/phases/phase-1/phase.md`:

```markdown
---
id: "phase-1"
title: "Foundation Phase"
status: "in-progress"
---

## Goals

Establish the core architecture and foundational components.

## Deliverables

- Authentication system
- Database schema
- API framework
```

### 3. Create a Milestone

```bash
pa milestone new phase-1 milestone-1
```

Edit `arch-model/phases/phase-1/milestones/milestone-1/milestone.md`:

```markdown
---
id: "milestone-1"
title: "Authentication Foundation"
status: "in-progress"
---

## Objective

Implement JWT-based authentication for the API.

## Success Criteria

- User registration and login
- Token generation and validation
- Password security
```

### 4. Create Planned Tasks

```bash
# Create multiple planned tasks
pa task new phase-1 milestone-1
# Follow prompts to enter task details

# Or create directly
pa task new phase-1 milestone-1 --title "Setup project structure" --id 001
pa task new phase-1 milestone-1 --title "Implement user model" --id 002
pa task new phase-1 milestone-1 --title "Add JWT generation" --id 003
```

### 5. View Lane Status

```bash
pa task lanes phase-1 milestone-1
```

Output:

```bash
Task Lanes for phase-1/milestone-1

Planned Lane (001-099):
  Used IDs: 001, 002, 003
  Next Available: 004
  Capacity: 3/99 (3%)

Discovered Lane (101-199):
  Used IDs: (none)
  Next Available: 101
  Capacity: 0/99 (0%)

Backlog Lane (901-999):
  Used IDs: (none)
  Next Available: 901
  Capacity: 0/99 (0%)
```

### 6. Work on Tasks

Update task status as you work:

```bash
# Start working on a task
pa task start phase-1 milestone-1 001

# Complete a task
pa task complete phase-1 milestone-1 001

# Block a task
pa task block phase-1 milestone-1 002 --reason "Waiting for API design approval"
```

### 7. Discovered Tasks

When you discover new work during implementation:

```bash
# Create a discovered task that drifted from task 003
pa task discover phase-1 milestone-1 --from 003 --title "Add refresh token mechanism"
```

This creates a task in the discovered lane (IDs 101-199) and tracks the drift from the original plan.

### 8. Backlog Ideas

For future work not yet scheduled:

```bash
pa task idea phase-1 milestone-1 --title "Add OAuth providers"
```

This creates a task in the backlog lane (IDs 901-999).

### 9. Document Architecture Decisions

```bash
pa decision new use-typescript
```

Edit `arch-model/decisions/use-typescript.md`:

```markdown
---
id: "use-typescript"
title: "Use TypeScript for all new code"
status: "accepted"
date: "2026-03-07"
---

## Context

We need to improve code quality and reduce runtime errors.

## Decision

We will use TypeScript for all new code in the project.

## Consequences

### Positive

- Type safety catches errors at compile time
- Better IDE support and autocomplete
- Easier refactoring

### Negative

- Requires build step
- Learning curve for JavaScript developers
```

### 10. Run Validations

Ensure everything is consistent:

```bash
pa check
```

This validates:

- Task IDs match their lane directories
- All required fields are present
- No circular dependencies
- Decision records have required fields

### 11. Generate Reports

```bash
# Generate status report
pa report

# Generate graph documentation
pa docs
```

This creates `arch-model/docs/graph.md` with:

- Phase and milestone overview
- Task statistics
- Dependency graph
- Decision summary

## Complete Example Script

Here's a complete script that sets up a basic architecture:

```bash
#!/bin/bash

# Initialize
pa init

# Create phase
pa phase new phase-1

# Create milestone
pa milestone new phase-1 milestone-1

# Create planned tasks
pa task new phase-1 milestone-1 --title "Setup project" --id 001
pa task new phase-1 milestone-1 --title "Implement auth" --id 002
pa task new phase-1 milestone-1 --title "Add tests" --id 003

# Mark first task as in progress
pa task start phase-1 milestone-1 001

# Add an architecture decision
pa decision new use-typescript

# Run checks
pa check

# Generate docs
pa docs

# Show status
pa report
```

## Next Steps

- Explore the [SDK Integration](../sdk-integration/README.md) example
- Learn about [Custom Commands](../custom-commands/README.md)
- Review the [ADR Workflow](../adr-workflow/README.md) example
- Read the full [documentation](../../README.md)
