---
schemaVersion: "1.0"
id: "001"
slug: "canonicalize-active-state-source"
title: "Canonicalize active phase/milestone source for reporting"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "report"
  - "manifests"
  - "consistency"
codeTargets:
  - "packages/project-arch/src/core/reports/generateReport.ts"
  - "packages/project-arch/src/cli/commands/report.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "Report active phase/milestone always comes from roadmap/manifest.json"
  - "Command emits inconsistency diagnostics when secondary state disagrees"
scope: "Reporting state source-of-truth behavior"
acceptanceChecks:
  - "Given conflicting secondary state, pa report still reflects roadmap/manifest.json"
  - "Diagnostics include mismatched surface and offending path"
evidence:
  - "Updated report diagnostics in packages/project-arch/src/core/reports/generateReport.ts to include activePhase/activeMilestone mismatches, secondary surface, and offending path"
  - "Added/updated tests in packages/project-arch/src/core/reports/generateReport.test.ts and packages/project-arch/src/cli/commands/report.test.ts"
  - "Typecheck passes: pnpm --filter project-arch typecheck"
  - "Regression tests pass: pnpm --filter project-arch test src/core/reports/generateReport.test.ts src/cli/commands/report.test.ts"
traceLinks: []
dependsOn: []
blocks:
  - "002"
  - "007"
---

## Scope

Make roadmap manifest state the canonical source for active phase and active milestone in reporting flows.

## Objective

Remove active-state ambiguity by forcing `pa report` to read active state directly from `roadmap/manifest.json` and surface explicit mismatch diagnostics for non-canonical surfaces.

## Acceptance Checks

- [x] `pa report` active phase matches `roadmap/manifest.json` in all scenarios.
- [x] `pa report` active milestone matches `roadmap/manifest.json` in all scenarios.
- [x] A mismatch table is emitted when another surface disagrees.

## Implementation Plan

1. Trace report generation path and identify all places active state is inferred.
2. Refactor active-state lookup to manifest-first logic.
3. Add consistency checks against any derived/secondary surface.
4. Add/update tests for aligned and misaligned states.

## Verification

- Run: `pnpm --filter project-arch typecheck`
- Run: `pnpm --filter project-arch test src/core/reports/generateReport.test.ts src/cli/commands/report.test.ts`
- Validate CLI output includes mismatch diagnostics with surface and offending path.

## Evidence

- Typecheck completed with exit code 0.
- Report regression tests passed (16/16 tests, 2/2 files).
- Core report now emits consistency diagnostics including `activePhase`/`activeMilestone`, `filesystem` surface, and offending path patterns.

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P0-A)

## Dependencies

### Depends On

- None.

### Blocks

- `002`
- `007`
