# project-arch

`project-arch` is a deterministic repository-native architecture CLI designed to manage and validate architectural modules, decisions, and boundaries across your monorepo.

## Installation

Typically installed as a workspace dependency or globally within the repository:

```bash
pnpm install project-arch -w
```

## CLI Usage

The primary command surface is `pa`.

```bash
# Initialize project architecture directory
pa init

# Run architectural validations
pa check

# Generate a report of current architecture state
pa report
```

### Advanced Commands

- **Phases:** Manage project delivery phases.
- **Milestones:** Track technical milestones.
- **Tasks:** Update architectural task structures.
- **Decisions:** Document architecture decisions.
- **Docs:** Generate markdown documentation for the architecture graph.

For full CLI help, run `pa --help`.

## Task Lanes

Tasks are organized into three lanes with dedicated ID ranges:

| Lane       | Range   | Purpose                                  |
| ---------- | ------- | ---------------------------------------- |
| planned    | 001-099 | Pre-planned tasks for milestone delivery |
| discovered | 101-199 | Tasks discovered during implementation   |
| backlog    | 901-999 | Ideas and future work not yet scheduled  |

### Working with Task Lanes

```bash
# Create a planned task (IDs 001-099)
pa task new phase-1 milestone-1

# Create a discovered task (IDs 101-199)
pa task discover phase-1 milestone-1 --from 005

# Create a backlog idea (IDs 901-999)
pa task idea phase-1 milestone-1

# View lane usage and next available IDs
pa task lanes phase-1 milestone-1
```

The `pa task lanes` command shows:

- Used IDs per lane
- Next available ID for each lane
- Total capacity and usage statistics

### Task ID Validation

Task IDs must match their lane directory:

- Tasks in `tasks/planned/` must have IDs 001-099
- Tasks in `tasks/discovered/` must have IDs 101-199
- Tasks in `tasks/backlog/` must have IDs 901-999

Invalid IDs will produce detailed error messages showing valid ranges.

## SDK Usage

`project-arch` exposes a TypeScript SDK for programmatic consumption of parsing and validation routines.

```typescript
import { check, graph } from "project-arch";

// Execute checks programmatically
const results = await check.runRepositoryChecks(process.cwd());

// Parse the dependency graph
const nodes = await graph.buildProjectGraph(process.cwd());
```
