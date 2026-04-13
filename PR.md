# project-arch CLI runtime release

## Summary

This PR prepares the next CLI-only `project-arch` release. It ships the runtime inventory/readiness and agent execution surfaces from `feedback/7-runtime-inventory-and-project-linking-spec.md`, while leaving the VS Code extension and Preact artifact-browser evaluation from `feedback/10-preact-artifact-browser-evaluation-spec.md` out of the release.

Recommended release version: `2.1.0` minor release. The package version has been bumped to `2.1.0`.

## What Changed

- Added first-class runtime profile management through `pa runtime`:
  - `pa runtime list`
  - `pa runtime scan`
  - `pa runtime register`
  - `pa runtime check`
  - `pa runtime link`
  - `pa runtime update`
  - `pa runtime enable`
  - `pa runtime disable`
  - `pa runtime default`
  - `pa runtime unlink`
- Added repository-owned runtime profile config at `.project-arch/runtime.config.json` with schema-backed validation for profile ids, runtime ids, default profile, model selection, bounded common parameters, adapter options, and preferred-use metadata.
- Added merged runtime inventory/readiness contracts for CLI and SDK consumers, including runtime availability, linked profile state, adapter-backed option validation, readiness diagnostics, and actionable next steps.
- Added agent runtime lifecycle commands:
  - `pa agent prepare`
  - `pa agent run`
  - `pa agent status`
  - `pa agent validate`
  - `pa agent reconcile`
  - `pa agent audit`
  - `pa agent orchestrate`
  - `pa result import`
- Added runtime-local operational state under `.project-arch/agent-runtime/` for contracts, prompts, launches, run records, results, orchestration records, and audit logs.
- Added SDK exports for `runtime`, `agent`, `result`, `contracts`, and `workflows`, plus command metadata for the runtime profile surface.
- Aligned validation, doctor, reconciliation, init scaffolding, help topics, and generated docs with schema version `2.0`, project-scoped roadmap paths, runtime profile validation, and canonical `.project-arch/workflows/*.workflow.md` guidance.

## Release Notes

See `RELEASE_NOTES.md` and the new `2.1.0` entry in `packages/project-arch/CHANGELOG.md`.

## Out Of Scope

- VS Code extension release packaging.
- Preact artifact-browser experimental view.
- Any `apps/project-arch-extension` release notes or extension-facing version bump.

## Validation

- `pnpm install --frozen-lockfile`: passed
- `pnpm --filter project-arch build`: passed
- `pnpm --filter project-arch typecheck`: passed
- `pnpm --filter project-arch lint`: passed
- `pnpm --filter project-arch test`: passed, 183 files and 1640 tests
- `npm pack --dry-run`: passed for `project-arch@2.1.0`
- `pnpm --filter project-arch release:prepare -- --version 2.1.0`: failed until the release commit is clean and the new package files are tracked
