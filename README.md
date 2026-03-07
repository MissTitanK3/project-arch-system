# project-arch-system

Welcome to the `project-arch-system` monorepo. This repository contains the source code for the `project-arch` deterministic architecture CLI and its associated scaffolding tool.

This monorepo is managed using Turborepo and pnpm workspaces.

## Packages

- **[`project-arch`](./packages/project-arch/README.md):** The core deterministic repository-native architecture CLI.
- **[`create-project-arch`](./packages/create-project-arch/README.md):** The scaffolding tool used to bootstrap a new Turborepo monorepo with `project-arch` pre-configured.

## Quick Start (Scaffolding a new project)

If you want to generate a new architecture-enabled project, use the scaffolder:

```bash
npx create-project-arch@latest my-new-architecture
```

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install Dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build
```

Builds all workspace packages via Turbo.

### Lint & Format

```bash
pnpm lint
pnpm format
```

Runs ESLint and Prettier across the workspace.

### Test

```bash
pnpm test
```

Runs the Vitest test suites across the workspace.

### Typecheck

```bash
pnpm --filter project-arch typecheck
pnpm --filter create-project-arch typecheck
```
