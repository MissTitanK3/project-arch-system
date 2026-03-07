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

## SDK Usage

`project-arch` exposes a TypeScript SDK for programmatic consumption of parsing and validation routines.

```typescript
import { check, graph } from "project-arch";

// Execute checks programmatically
const results = await check.runRepositoryChecks(process.cwd());

// Parse the dependency graph
const nodes = await graph.buildProjectGraph(process.cwd());
```
