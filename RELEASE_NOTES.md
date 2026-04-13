# project-arch CLI 2.1.0 Release Notes

Release date: 2026-04-13

This release focuses on the CLI and SDK only. The VS Code extension and Preact artifact-browser evaluation remain outside the release.

## Highlights

- Runtime profiles are now a first-class project surface. Repositories can link runtime/model profiles in `.project-arch/runtime.config.json`, choose a default profile, enable or disable launch targets, and inspect readiness before running agent work.
- `pa runtime` now exposes runtime inventory, scanning, registration, readiness checks, and profile mutations with JSON output for downstream tools.
- `pa agent` now supports a prepare-run-import-validate-reconcile lifecycle, including direct runtime launches, launch status inspection, audit history, and planner-to-reconciler orchestration.
- Agent outputs are persisted under `.project-arch/agent-runtime/`, keeping runtime-local state separate from canonical roadmap and architecture state until explicit import, validation, and reconciliation.
- CLI help, SDK command metadata, doctor checks, repository validation, reconciliation reports, and init scaffolding now align around schema version `2.0`, project-scoped roadmap paths, and canonical `.project-arch/workflows/*.workflow.md` workflow guidance.

## Changelog

### Added

- `pa runtime list`, `scan`, `register`, `check`, `link`, `update`, `enable`, `disable`, `default`, and `unlink`.
- `.project-arch/runtime.config.json` as the repository-owned runtime profile config file.
- Runtime inventory and readiness contracts with adapter-backed diagnostics for unavailable runtimes, missing models, invalid adapter options, disabled profiles, and adapter readiness failures.
- `pa agent prepare`, `run`, `status`, `validate`, `reconcile`, `audit`, and `orchestrate`.
- `pa result import` for importing runtime result bundles into the agent runtime lifecycle.
- SDK exports for `runtime`, `agent`, `result`, `contracts`, and `workflows`.
- Runtime-local agent artifacts for contracts, prompts, launches, run records, result bundles, orchestration state, and audit history.
- Escalation draft output during agent reconciliation for reviewable follow-up decisions.

### Changed

- CLI help and SDK command metadata now document the runtime and agent MVP surfaces.
- `pa init --with-workflows` now targets `.project-arch/workflows/*.workflow.md` instead of markdown guidance under `.github/workflows/`.
- Fresh scaffolded roadmap artifacts now use schema version `2.0` and project-scoped paths under `roadmap/projects/shared/phases/...`.
- Repository validation now reports schema version `2.0` diagnostics and warns when legacy markdown workflow guidance remains under `.github/workflows/*.md`.
- Reconciliation reports now use schema version `2.0` and can carry agent run traceability.
- Doctor health checks now validate runtime profile config shape.

### Compatibility

- Legacy `roadmap/phases/...` paths remain readable where compatibility support exists, but fresh guidance and initialized output use `roadmap/projects/shared/phases/...`.
- Legacy markdown workflow guidance under `.github/workflows/*.md` is treated as non-canonical transition context. Fresh generated workflow documents now live under `.project-arch/workflows/*.workflow.md`.
- The extension Preact artifact-browser evaluation is not part of this CLI release.

### Validation

- `pnpm install --frozen-lockfile`: passed
- `pnpm --filter project-arch build`: passed
- `pnpm --filter project-arch typecheck`: passed
- `pnpm --filter project-arch lint`: passed
- `pnpm --filter project-arch test`: passed, 183 files and 1640 tests
- `npm pack --dry-run`: passed for `project-arch@2.1.0`
- `pnpm --filter project-arch release:prepare -- --version 2.1.0`: failed until the release commit is clean and the new package files are tracked
