# project-arch-system

Welcome to the `project-arch-system` monorepo. This repository contains the source code for the `project-arch` deterministic architecture CLI.

This monorepo is managed using Turborepo and pnpm workspaces.

## Packages

- **[`project-arch`](./packages/project-arch/README.md):** The core deterministic repository-native architecture CLI.

## Quick Start

Initialize architecture artifacts in an existing repository:

```bash
npx project-arch@latest init
```

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 10+

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
pnpm --filter project-arch test
```

Runs the Vitest test suite for the `project-arch` package.

**Current Test Metrics:**

- **Test Files**: 183 (all passing)
- **Tests**: 1640 (all passing)
- **Duration**: ~71 seconds
- **Coverage (latest run)**: Statements 89.31%, Branches 76.20%, Functions 93.63%, Lines 89.38%
- **Coverage Target**: >80% for critical modules (SDK, core, CLI)

### Smoke Test (Fresh Sandbox)

```bash
pnpm sandbox:smoke
```

Builds `project-arch`, creates a fresh temp sandbox, runs `pa init`, then runs `pa check`.

**Latest smoke result:** passing (March 22, 2026).

See [TESTING.md](./TESTING.md) for detailed testing documentation.

### Typecheck

```bash
pnpm --filter project-arch typecheck
```

### Task Setup

Install Task runner:

```bash
npm install -g @go-task/cli
```

First run:

```bash
task release:check
```

## Publish To npm

Package to publish:

1. `project-arch`

Release hardening baseline:

- Release from protected `main` only.
- Create `v*` tags from the current `main` commit only.
- Use lockfile-enforced install and clean build/test validation before publish.
- Verify publish payload with `npm pack --dry-run` before publish.

Key commands:

```bash
task release:check
task release:prepare
pnpm release:prepare
pnpm --filter project-arch publish --access public
```

For full publish governance (token scope, maintainer review/rotation, and branch/tag policy), see [PUBLISHING-GUIDE.md](./PUBLISHING-GUIDE.md).
