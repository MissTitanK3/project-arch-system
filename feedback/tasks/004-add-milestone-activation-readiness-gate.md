---
schemaVersion: "1.0"
id: "004"
slug: "add-milestone-activation-readiness-gate"
title: "Add readiness gate for milestone activation"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "milestones"
  - "governance"
  - "validation"
codeTargets:
  - "packages/project-arch/src/cli/commands/milestone.ts"
  - "packages/project-arch/src/core/milestones/createMilestone.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "Milestone activation requires at least one planned task"
  - "Milestone activation requires targets file"
  - "Milestone activation requires success criteria/checklist"
scope: "Milestone lifecycle guardrails"
acceptanceChecks:
  - "Activation blocked with clear diagnostics when requirements are missing"
  - "Activation succeeds when all prerequisites are present"
evidence:
  - "Added milestone activation readiness gate in packages/project-arch/src/core/milestones/createMilestone.ts"
  - "Added CLI activate command in packages/project-arch/src/cli/commands/milestone.ts"
  - "Added SDK activation API in packages/project-arch/src/sdk/milestones.ts"
  - "Added readiness failure/success tests in core, CLI, and SDK milestone test suites"
  - "Typecheck passes: pnpm --filter project-arch typecheck"
  - "Tests pass: pnpm --filter project-arch test src/core/milestones/createMilestone.test.ts src/cli/commands/milestone.test.ts src/sdk/milestones.test.ts src/sdk/registry.test.ts"
traceLinks: []
dependsOn: []
blocks: []
---

## Scope

Gate milestone activation on minimum executable readiness artifacts.

## Objective

Prevent milestones from being marked active without actionable planned work and completion criteria.

## Acceptance Checks

- [x] Activation fails when planned lane has zero tasks.
- [x] Activation fails when targets file is missing.
- [x] Activation fails when success criteria/checklist is missing.

## Implementation Plan

1. Define readiness predicate and required files.
2. Enforce predicate in milestone activate command path.
3. Emit explicit remediation diagnostics.
4. Add CLI and core tests for blocked/allowed activation cases.

## Verification

- Run: `pnpm --filter project-arch typecheck`
- Run: `pnpm --filter project-arch test src/core/milestones/createMilestone.test.ts src/cli/commands/milestone.test.ts src/sdk/milestones.test.ts src/sdk/registry.test.ts`
- Validate `pa milestone activate` failure diagnostics and successful activation path.

## Evidence

- Blocked activation diagnostics validated for missing planned task, missing targets file, and missing success criteria/checklist.
- Successful activation validated when prerequisites are present; manifest active phase/milestone updated.
- Milestone-focused suites passed (core/CLI/SDK/registry).

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P1-D)

## Dependencies

### Depends On

- None.

### Blocks

- None.
