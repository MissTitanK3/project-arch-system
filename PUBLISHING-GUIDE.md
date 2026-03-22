# Publishing and Release Hardening Guide

This document defines the minimum secure release baseline for `project-arch`.

For CLI runtime side effects (file writes, subprocess calls, network posture, and config loading), see `packages/project-arch/docs/security-operations-model.md`.

## Release Boundaries

- Allowed release branch: `main` only.
- Allowed release tags: `v*` tags created from the current protected `main` commit.
- Releases must be prepared from a clean checkout (no local uncommitted changes).
- CI validation must pass before publish (`typecheck`, `lint`, `test`, and package payload check).

## CI Baseline

The repository CI/release baseline is provider-agnostic and defined in `Taskfile.yml`.

`task ci:validate` enforces:

- lockfile-enforced install via `pnpm install --frozen-lockfile`,
- package build/typecheck/lint/test execution,
- publish payload verification via `npm pack --dry-run`.

`task release:check` adds clean-checkout enforcement before validation by requiring:

- no unstaged or staged working-tree changes,
- the same validation and publish-payload checks as `task ci:validate`.

## Publish Access Control

- Only approved npm package maintainers may publish `project-arch`.
- Maintainership must be reviewed at least quarterly and on role changes.
- Access must be removed immediately when a maintainer no longer requires publish rights.
- Publish rights should follow least privilege: do not grant broader org/package permissions than required.

Recommended periodic review:

```bash
npm owner ls project-arch
```

## npm Token Policy (Least Privilege)

- Use dedicated automation tokens for CI publishing.
- Scope token access to the minimum required package permissions.
- Store tokens only in CI secret storage (for example, `NPM_TOKEN` in repository/org secrets).
- Rotate publish tokens on schedule (at least quarterly) and immediately on suspected compromise.
- Never print or commit tokens; never store tokens in tracked files.

Token rotation helpers:

```bash
npm token list
npm token revoke <token-id>
```

## Hardened Release Procedure

1. Ensure you are on up-to-date `main` and working from a clean checkout.
1. Run local preflight checks:

```bash
task release:check
pnpm release:prepare
```

`pnpm release:prepare` runs a local-only release readiness sweep (git state, version/changelog checks, typecheck/lint/test/build, and `npm pack --dry-run --json` payload checks), writes `.project-arch/release/release-check.json` by default, and prints suggested manual push/tag/publish commands without executing them.

1. Bump version in `project-arch`:

```bash
pnpm --filter project-arch exec npm version <new-version> --no-git-tag-version
```

1. Commit version/changelog updates on `main`.
1. Create and push release tag from `main`:

```bash
git tag v<new-version>
git push origin main
git push origin v<new-version>
```

1. Publish package:

```bash
pnpm --filter project-arch publish --access public
```

1. Verify publication:

```bash
npm view project-arch version
```

## Clean Build Path (Task 04)

The clean publish build path introduced in Task 04 is required for release confidence:

- `pnpm --filter project-arch build` runs `packages/project-arch/scripts/build.mjs`.
- That script removes `dist/` before compile and then builds using `tsconfig.build.json`.
- This prevents stale compiled test artifacts from entering publish payloads.

## JSON Diagnostics Schema Release Policy

For `pa check --json`, treat `schemaVersion` as a public automation contract.

- Schema source of truth: `packages/project-arch/docs/check-json-diagnostics-schema.md`
- Current schema: `1.0`

When changing diagnostics payload:

1. **Additive-only changes** (new optional fields):
   - Keep `schemaVersion` major unchanged (e.g. `1.x`)
   - Update schema doc examples/field notes
   - Mention additive schema update in release notes
1. **Breaking changes** (rename/remove/type change/required field change):
   - Bump `schemaVersion` major
   - Update schema doc with migration notes
   - Call out breaking contract change in release notes and changelog
1. **No-shape changes** (text clarifications only):
   - No schema version bump required

Release checklist for diagnostics schema changes:

- Update `CHECK_DIAGNOSTICS_SCHEMA_VERSION` in `src/core/validation/check.ts` when required
- Keep `pa check --json` output and docs aligned
- Ensure tests covering JSON payload shape pass
