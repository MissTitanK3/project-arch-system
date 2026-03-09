---
schemaVersion: "1.0"
id: "002"
slug: "add-parity-validation-to-check"
title: "Add roadmap/graph parity validation to check"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "validation"
  - "graph"
  - "integrity"
codeTargets:
  - "packages/project-arch/src/core/validation/check.ts"
  - "packages/project-arch/src/cli/commands/check.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "pa check fails when roadmap task count differs from .arch task node count"
  - "pa check fails when milestone-task links are missing"
  - "pa check fails when status differs between task file and graph node"
scope: "Validation parity between roadmap markdown and graph manifests"
acceptanceChecks:
  - "Count mismatch produces non-zero exit with actionable diagnostics"
  - "Missing milestone-task edge is reported"
  - "Status drift task vs graph is reported"
evidence:
  - "Implemented roadmap/.arch task parity checks in packages/project-arch/src/core/validation/check.ts"
  - "Added targeted mismatch tests in packages/project-arch/src/core/validation/check.test.ts"
  - "Validated CLI check behavior with existing command tests in packages/project-arch/src/cli/commands/check.test.ts"
  - "Tests pass: pnpm --filter project-arch test src/core/validation/check.test.ts src/cli/commands/check.test.ts"
  - "Typecheck passes: pnpm --filter project-arch typecheck"
traceLinks: []
dependsOn:
  - "001"
blocks:
  - "003"
  - "007"
---

## Scope

Extend `pa check` to enforce parity between roadmap task files and `.arch` graph artifacts.

## Objective

Convert silent drift into a hard validation failure with diagnostics that identify missing nodes, missing edges, and status mismatches.

## Acceptance Checks

- [x] Validation fails on count mismatches between roadmap tasks and graph task nodes.
- [x] Validation fails when any task lacks a milestone-task edge.
- [x] Validation fails when frontmatter status differs from graph status.

## Implementation Plan

1. Add parity comparison utility in validation layer.
2. Emit structured errors with task IDs and file/manifests involved.
3. Integrate parity checks into existing `pa check` execution path.
4. Add unit tests for each mismatch class.

## Verification

- Run: `pnpm --filter project-arch test src/core/validation/check.test.ts src/cli/commands/check.test.ts`
- Run: `pnpm --filter project-arch typecheck`
- Execute parity checks against seeded artifacts for: count mismatch, missing milestone-task edge, and status drift.

## Evidence

- New failing cases asserted in tests:
  - `should fail when roadmap task count differs from .arch task node count`
  - `should fail when milestone-task edges are missing`
  - `should fail when roadmap task status differs from graph task status`
- All targeted check suites pass (37/37 tests).

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P0-B)

## Dependencies

### Depends On

- `001`

### Blocks

- `003`
- `007`
