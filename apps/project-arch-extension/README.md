# project-arch-extension

Scaffold workspace app for the Project Arch VS Code extension.

This package currently defines only the minimal TypeScript layout and monorepo participation hooks needed for later milestone tasks.

Current activation boundary:

- Entrypoint: `src/extension.ts`
- Activation: `onStartupFinished` plus command-driven activation from contributed task actions
- Initial task-action command contributions:
  - `projectArch.implementTask`
  - `projectArch.generateTaskPlan`
  - `projectArch.explainTask`

The commands now provide local task workflow orchestration with explicit entry boundaries:

- `Implement Task` orchestrates `agent prepare -> result import -> agent validate -> agent reconcile`.
- `Generate Task Plan` runs local `agent prepare` scaffolding.
- `Explain Task` runs local `agent prepare --prompt-only` scaffolding.
- `Review Local Result (Diff-First)` opens local file diffs from canonical runtime result artifacts.
- `View Local Workflow Status` reports canonical local workflow progress/failure state and next steps.
- `Project Arch Artifacts` Explorer tree provides repository-backed navigation across canonical task, run, diff, and audit artifacts.
- `Open Artifact Inspector` provides a file-backed panel with metadata, content, and related-artifact tabs, plus quick actions to open or reveal canonical linked artifacts (task, run, diff/reconcile, and audit paths).
- Artifact open behavior is normalized across tree, panel, and diff-first review actions: canonical run and reconcile review actions open in the same inspector surface while preserving file-backed paths for raw opens.
- Artifact inspector/file commands can also be launched without a tree selection (for example, from Command Palette) and now offer a canonical artifact picker backed by repository files.

Structured outputs are persisted as latest local workflow state in extension workspace state for later review UX tasks.

Build and packaging workflow:

- `pnpm --filter project-arch-extension typecheck`
- `pnpm --filter project-arch-extension test`
- `pnpm --filter project-arch-extension build`
- `pnpm --filter project-arch-extension package:vsix`

Bounded package surface:

- VSIX packaging is constrained to extension runtime assets only (`dist/**`, `resources/**`, manifest/license/readme files).
- Package boundary enforcement is driven by `.vscodeignore` so development-only paths stay out of the shipped extension artifact.
- Development-only artifacts (for example `.sandbox/` and `scripts/`) are excluded from package output.
- Experimental asset inclusion is still validated explicitly through:
  - `pnpm --filter project-arch-extension validate:webview:experimental:vsix`

Experimental artifact browser frontend loop (bounded):

- One-time build for deterministic frontend asset output:
  - `pnpm --filter project-arch-extension build:webview:experimental`
- Incremental frontend iteration (watch only the experimental client boundary):
  - `pnpm --filter project-arch-extension watch:webview:experimental`
- Validate emitted experimental asset boundary (bundle + sourcemap markers):
  - `pnpm --filter project-arch-extension validate:webview:experimental`
- Validate provider + host behavior with focused tests:
  - `pnpm --filter project-arch-extension test -- src/navigation/artifactNavigationTree.test.ts`
- Validate packaged VSIX includes experimental frontend assets:
  - `pnpm --filter project-arch-extension package:vsix`
  - `pnpm --filter project-arch-extension validate:webview:experimental:vsix`

Tooling overhead introduced by milestone-2 experimental boundary:

- Added bounded frontend bundling dependency and script:
  - `esbuild`
  - `scripts/build-experimental-webview.mjs`
- Added explicit asset-boundary validation script and tests:
  - `scripts/validate-experimental-webview-assets.mjs`
  - `scripts/validate-experimental-webview-assets.test.mjs`
- Added dedicated frontend typecheck path:
  - `typecheck:experimental-webview`

This overhead remains scoped to the experimental webview boundary and does not move unrelated extension views onto a frontend bundling toolchain.

Milestone-3 parity and coexistence boundary:

- Baseline and experimental artifact views now share one host-side action/command semantics boundary.
- The experimental view keeps its dedicated Preact rendering entrypoint while reusing canonical host-owned workflow, inspector, command-staging, and stage-chat semantics.
- Coexistence remains rollback-safe because both surfaces continue to resolve through the same repository-backed authority and command-routing behavior.

Shared shell/component foundation loop (bounded):

- Focused shared-layer tests (shell state, token boundary, shared exports, validation script checks):
  - `pnpm --filter project-arch-extension test:shared-shell-layer`
- Focused shared-layer source/boundary validation:
  - `pnpm --filter project-arch-extension validate:shared-shell-layer`
- Full bounded shared-layer verification (build + typecheck + focused tests + built-asset boundary check):
  - `pnpm --filter project-arch-extension verify:shared-shell-layer`

Shared shell/component layer boundaries:

- Shared visual tokens and shell/component selectors live under:
  - `src/navigation/preact/styles/tokens.css`
- Shared shell layout/state boundaries live under:
  - `src/navigation/preact/shell/`
- Shared-shell validation script boundary:
  - `scripts/validate-shared-shell-layer.mjs`

This loop is intentionally scoped to the shared Preact shell/component layer and does not include milestone-6 navigation/guidance behavior validation.

Shared shell navigation/guidance loop (bounded):

- Focused extension-facing consolidation tests (activation/manifest retention + consolidation validator):
  - `pnpm --filter project-arch-extension test:shell-surface-consolidation`
- Focused consolidation boundary validation:
  - `pnpm --filter project-arch-extension validate:shell-surface-consolidation`
- Full bounded shell-behavior verification (host build + webview typecheck + focused tests + built webview marker validation):
  - `pnpm --filter project-arch-extension verify:shell-surface-consolidation`

Milestone-6 shared shell behavior boundaries:

- Left navigation and right guidance behavior are implemented as sheet-style overlays so they do not reserve dedicated surface width.
- The left navigation opens from a hamburger trigger and selects the active surface for the shared main pane.
- The right guidance sheet is payload-driven and shell-owned; migrated surfaces open it through reusable guidance actions rather than embedded per-view panels.
- Dedicated VS Code-contributed views remain present until later migration milestones move their content into the shared shell.

Artifact-browser shell migration loop (bounded):

- Focused migration-safety tests for coexistence and regression coverage:
  - `pnpm --filter project-arch-extension test:artifact-browser-migration-safety`
- Focused migration-safety boundary validation:
  - `pnpm --filter project-arch-extension validate:artifact-browser-migration-safety`
- Full bounded artifact-browser migration verification (host build + webview typecheck + composition/parity/consolidation/migration-safety tests + built webview marker checks):
  - `pnpm --filter project-arch-extension verify:artifact-browser-migration-safety`

Milestone-7 artifact-browser migration boundaries:

- The artifact browser is the first full migrated surface inside the shared shell and shared component layer.
- Artifact workflow and command semantics remain host-owned and parity-validated through shared message-contract boundaries.
- Baseline and experimental artifact contributions remain present for coexistence and rollback-safe migration while broader surfaces are still pending milestone-8 migration.

Milestone-8 multi-surface migration and coexistence loop (bounded):

- Runs/runtimes migration slice verification:
  - `pnpm --filter project-arch-extension verify:runs-runtimes-shell-composition`
- Lifecycle/command migration slice verification:
  - `pnpm --filter project-arch-extension verify:lifecycle-command-shell-composition`
- Shared navigation/guidance integration verification:
  - `pnpm --filter project-arch-extension verify:shared-navigation-guidance-integration`
- Multi-surface coexistence + regression safety verification:
  - `pnpm --filter project-arch-extension verify:multi-surface-coexistence-regression-safety`

Milestone-8 boundary alignment expectations:

- Runtime migration references remain anchored to `apps/project-arch-extension/src/navigation/experimentalArtifactBrowser`.
- Shared-shell navigation and contextual-guidance contracts are reused across artifacts, runs, runtimes, lifecycle, and command surfaces.
- Consolidation/regression validation composes migration-slice checks with coexistence safety and built-output boundary markers.

Milestone-9 checkpoint outcome (bounded):

- Recorded checkpoint decision: `continue-with-bounded-refinement`
- Decision record:
  - `feedback/phases/phase-preact-artifact-browser-evaluation/milestones/milestone-9-migration-validation-surface-consolidation-review-and-next-checkpoint-decision-capture/next-checkpoint-migration-decision-record.md`

Milestone-9 continuation guardrails:

- Keep runtime-linked shell integration anchored to `apps/project-arch-extension/src/navigation/experimentalArtifactBrowser`.
- Keep continuation evidence-first with explicit validation and fail-path regression guardrails.
- Preserve rollback-safe coexistence boundaries; do not imply broad migration expansion without another explicit checkpoint.

Project Arch consumption boundary:

- Default transport boundary: `pa ... --json` CLI commands
- Canonical contract parsing: `project-arch` SDK `contracts` hooks
- Canonical run-artifact transport: CLI JSON surfaces with schema-backed parsing at extension boundaries

This extension intentionally does not duplicate control-plane runtime logic, schema ownership, or run-artifact lookup internals.
