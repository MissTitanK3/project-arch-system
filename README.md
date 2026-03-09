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

## Publish To npm

Publish in this order so `create-project-arch` references a released `project-arch` version:

1. `project-arch`
2. `create-project-arch`

### One-time setup

```bash
npm login
```

### Update npm access tokens

For local publishing, refresh auth in your user npm config:

```bash
npm logout
npm login
```

For CI publishing, rotate `NPM_TOKEN` and update the secret in your CI provider:

```bash
npm token list
npm token revoke <token-id>
npm token create --read-only=false
```

Then set the new token in CI as `NPM_TOKEN` and ensure `.npmrc` uses:

```ini
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

Check this and restart terminal

```bash
code ~/.npmrc
```

Set `NPM_TOKEN` locally (current shell):

```bash
export NPM_TOKEN="<new-token>"
```

Persist `NPM_TOKEN` for future shells (zsh):

```bash
echo 'export NPM_TOKEN="<new-token>"' >> ~/.zshrc
source ~/.zshrc
```

### Pre-publish checks

```bash
pnpm install
pnpm build
pnpm lint
pnpm --filter project-arch test
pnpm --filter create-project-arch test
```

### Bump versions

```bash
pnpm --filter project-arch exec npm version <new-version> --no-git-tag-version
pnpm --filter create-project-arch exec npm version <new-version> --no-git-tag-version
```

### Check versions

Check local workspace package versions:

```bash
pnpm --filter project-arch exec node -p "require('./package.json').version"
pnpm --filter create-project-arch exec node -p "require('./package.json').version"
```

Check currently published npm versions:

```bash
npm view project-arch version
npm view create-project-arch version
```

### Dry run (recommended)

```bash
pnpm --filter project-arch publish --access public --dry-run --no-git-checks
pnpm --filter create-project-arch publish --access public --dry-run --no-git-checks
```

### Publish

```bash
pnpm --filter project-arch publish --access public --no-git-checks
pnpm --filter create-project-arch publish --access public --no-git-checks
```
