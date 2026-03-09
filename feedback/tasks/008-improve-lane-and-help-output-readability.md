---
schemaVersion: "1.0"
id: "008"
slug: "improve-lane-and-help-output-readability"
title: "Improve lane listing and help output readability"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "cli"
  - "ux"
  - "output"
codeTargets:
  - "packages/project-arch/src/cli/help/format.ts"
  - "packages/project-arch/src/cli/help/topics.ts"
  - "packages/project-arch/src/core/reports/generateReport.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "Long lane ID listings avoid unreadable wrapping"
  - "Help output removes duplicated blocks"
  - "Concise and verbose display modes available"
scope: "CLI readability under high-volume milestones"
acceptanceChecks:
  - "Rendering remains stable for large lane/task counts"
  - "Users can opt into detailed output without cluttering default view"
evidence:
  - "Implemented smart ID list truncation utility for concise lane output: packages/project-arch/src/utils/formatIdList.ts"
  - "Added verbose expansion support to task lanes command via --verbose: packages/project-arch/src/cli/commands/task.ts"
  - "Updated lane command help metadata to document concise vs verbose behavior: packages/project-arch/src/cli/commands/task.ts"
  - "Added formatter tests covering large lists, edge cases, and verbose mode: packages/project-arch/src/utils/formatIdList.test.ts"
  - "Validation: pnpm --filter project-arch typecheck"
  - "Validation: pnpm --filter project-arch test formatIdList.test.ts (23/23 passing)"
  - "Validation: pnpm --filter project-arch test (708/708 passing)"
traceLinks: []
dependsOn: []
blocks: []
---

## Scope

Improve CLI output formatting for long task lists and help surfaces during high-volume execution.

## Objective

Reduce operator friction by making default output concise and readable while preserving access to detailed views.

## Acceptance Checks

- [x] ID list rendering remains readable with large counts.
- [x] Duplicate help sections are removed.
- [x] `--verbose` style output mode provides detailed expansion.

## Implementation Plan

1. Audit current formatters for wrap/duplication hotspots.
2. Redesign list rendering for long ID sets.
3. Introduce concise vs verbose output mode behavior.
4. Add tests/snapshots for large-list formatting.

## Verification

- Run: `pnpm --filter project-arch test help.test.ts`
- Run: `pnpm --filter project-arch test report.test.ts`

## Evidence

- Smart truncation in concise mode now renders long lists as: `001, 002, 003 ... 097, 098, 099 (99 total)`.
- Verbose mode (`pa task lanes <phase> <milestone> --verbose`) prints full ID expansion.
- Added focused formatter coverage in `packages/project-arch/src/utils/formatIdList.test.ts`.
- Verified no regressions with full package tests (`708 passed`).

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P2-H)

## Dependencies

### Depends On

- None.

### Blocks

- None.
