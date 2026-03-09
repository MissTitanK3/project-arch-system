---
schemaVersion: "1.0"
id: "010"
slug: "fix-sandbox-eslint-next-js-config-export-mismatch"
title: "Fix sandbox scaffold ESLint next-js config export mismatch"
lane: "planned"
status: "in_progress"
createdAt: "2026-03-09"
updatedAt: "2026-03-09"
discoveredFromTask: null
tags:
  - "scaffolding"
  - "lint"
  - "eslint"
  - "sandbox"
codeTargets:
  - "packages/create-project-arch/templates"
  - "packages/create-project-arch/src"
publicDocs:
  - "packages/create-project-arch/README.md"
decisions: []
completionCriteria:
  - "Projects generated via sandbox:init pass pnpm lint without manual edits"
  - "App ESLint configs import/export the correct symbol from @repo/eslint-config/next-js"
  - "Regression coverage exists for scaffolding output to prevent reintroduction"
scope: "Scaffolded workspace lint health for arch-ui template"
acceptanceChecks:
  - "sandbox:init creates testProject and pnpm lint succeeds"
  - "apps/arch eslint config uses a valid export from @repo/eslint-config/next-js"
  - "Template-level verification captures this mismatch in CI/local checks"
evidence:
  - "Updated template wiring in packages/create-project-arch/templates/arch-ui/eslint.config.js to import/export nextJsConfig from @repo/eslint-config/next-js."
  - "Added regression coverage in packages/create-project-arch/src/cli.test.ts asserting arch-ui template imports @repo/eslint-config/next-js and uses nextJsConfig."
  - "Verified create-project-arch tests pass: pnpm --filter create-project-arch test (2 passed)."
  - "Verified scaffold output before cleanup: generated testProject/apps/arch/eslint.config.js contains import { nextJsConfig } from '@repo/eslint-config/next-js'; export default nextJsConfig;"
traceLinks: []
dependsOn: []
blocks:
  - "Full sandbox lint still fails due to unrelated existing warnings in generated workspace (e.g. react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars, turbo/no-undeclared-env-vars), not due to next-js export mismatch."
---

## Scope

Resolve the generated ESLint config mismatch where scaffolded apps import a symbol that is not exported by `@repo/eslint-config/next-js`.

## Objective

Ensure a fresh scaffold from `sandbox:init` is immediately lint-clean and does not require manual repair.

## Acceptance Checks

- [ ] `pnpm run sandbox:init` completes and generated `testProject` passes `pnpm lint`.
- [x] Generated app ESLint config references the actual exported identifier from `@repo/eslint-config/next-js`.
- [x] A regression check exists (test or validation script) that fails if scaffolded ESLint wiring drifts.

## Implementation Plan

1. Fix the template ESLint config import/export wiring for Next.js apps.
2. Regenerate a sandbox project and confirm `pnpm lint` passes.
3. Add or update a scaffolder validation step that catches invalid config symbol imports.

## Verification

- Run: `pnpm run sandbox:init`
- Run: `cd testProject && pnpm lint`

## Evidence

- Before/after lint results from generated sandbox project.
- Reference to template/config files updated to align import/export names.
- `pnpm run sandbox:init` completed successfully and generated sandbox content with fixed `apps/arch/eslint.config.js` wiring.
- `pnpm --filter create-project-arch test` passes with regression coverage for the template symbol.
- `pnpm --filter arch lint` in generated sandbox no longer fails on import/export mismatch; remaining failures are pre-existing lint warnings enforced by `--max-warnings 0`.

## Progress Update

- Implemented core fix and regression coverage.
- Acceptance check #1 remains open because full sandbox `pnpm lint` currently fails for unrelated warnings outside this task's mismatch scope.

## Trace Links

- Source issue: sandbox validation failure during `pnpm lint` in generated `testProject` (`apps/arch/eslint.config.js` importing `{ config }` from `@repo/eslint-config/next-js` while package exports `nextJsConfig`).

## Dependencies

### Depends On

- None.

### Blocks

- None.
