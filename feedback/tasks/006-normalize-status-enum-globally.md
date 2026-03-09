---
schemaVersion: "1.0"
id: "006"
slug: "normalize-status-enum-globally"
title: "Normalize and validate status vocabulary across surfaces"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "schema"
  - "status"
  - "compatibility"
codeTargets:
  - "packages/project-arch/src/schemas/task.ts"
  - "packages/project-arch/src/core/manifests/graph.ts"
  - "packages/project-arch/src/core/validation/check.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "One canonical status enum used in task files and graph nodes"
  - "Validation rejects non-canonical statuses"
  - "Migration or compatibility path defined for existing data"
scope: "Status schema convergence"
acceptanceChecks:
  - "[x] All parsers and validators enforce canonical enum"
  - "[x] Legacy status values are migrated or mapped deterministically"
evidence:
  - "Created: packages/project-arch/src/schemas/statusNormalization.ts - Canonical enum with legacy format migration using Zod preprocessing"
  - "Updated: packages/project-arch/src/schemas/task.ts - Imports and re-exports canonical status schema"
  - "Updated: packages/project-arch/src/core/templates/conceptMap.ts - Fixed to use canonical in_progress instead of in-progress"
  - "Updated: packages/project-arch/src/cli/commands/task.ts - Added display formatting for user-facing output (in-progress for readability)"
  - "Updated: packages/project-arch/src/cli/help/topics.ts - Updated docs to use canonical format"
  - "Tests: packages/project-arch/src/schemas/statusNormalization.test.ts - 24 tests covering normalization, validation, and migration"
  - "Tests: packages/project-arch/src/schemas/task.test.ts - Added legacy format migration tests"
  - "Test run: pnpm --filter project-arch test src/schemas/statusNormalization.test.ts src/schemas/task.test.ts - All 47 tests passed"
  - "Test run: pnpm --filter project-arch test src/core/validation/check.test.ts - All 31 tests passed"
  - "Typecheck: pnpm --filter project-arch typecheck - No errors"
traceLinks: []
dependsOn:
  - "002"
blocks: []
---

## Scope

Unify task status vocabulary across markdown frontmatter, graph nodes, and CLI display/commands.

## Objective

Remove semantic drift caused by mixed status formats and ensure schema-level enforcement everywhere status is parsed or emitted.

## Acceptance Checks

- [ ] Canonical enum is documented and enforced in schemas.
- [ ] All status readers/writers use canonical values.
- [ ] Legacy values are handled by a deterministic migration or mapping rule.

## Implementation Plan

1. Pick canonical status enum and document mapping.
2. Update schemas, serializers, and CLI handlers.
3. Add migration/compat mode for existing repositories.
4. Add regression tests covering all status transitions.

## Verification

- Run: `pnpm --filter project-arch test task.test.ts`
- Run: `pnpm --filter project-arch test check.test.ts`

## Evidence

- Test output for enum validation and migration path.
- Example before/after status representation in manifests.

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P1-F)

## Dependencies

### Depends On

- `002`

### Blocks

- None.
