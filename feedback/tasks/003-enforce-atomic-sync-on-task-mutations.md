---
schemaVersion: "1.0"
id: "003"
slug: "enforce-atomic-sync-on-task-mutations"
title: "Enforce atomic sync across task mutation surfaces"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "tasks"
  - "consistency"
  - "transaction"
codeTargets:
  - "packages/project-arch/src/core/tasks/createTask.ts"
  - "packages/project-arch/src/core/tasks/updateTask.ts"
  - "packages/project-arch/src/core/manifests/graph.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "Task create/update applies roadmap and graph changes atomically"
  - "Failures roll back partial updates"
  - "Error output explains failed surface and rollback result"
scope: "Task mutation transaction semantics"
acceptanceChecks:
  - "Injected write failure does not leave partial roadmap/graph state"
  - "Successful mutation updates all required surfaces"
evidence:
  - "Added atomic mutation wrapper in packages/project-arch/src/core/tasks/atomicMutation.ts"
  - "Refactored task create flow to transactional roadmap+graph sync in packages/project-arch/src/core/tasks/createTask.ts"
  - "Refactored task status update flow to transactional roadmap+graph sync in packages/project-arch/src/core/tasks/updateTask.ts"
  - "Added rollback failure-injection tests in packages/project-arch/src/core/tasks/createTask.test.ts and packages/project-arch/src/core/tasks/updateTask.test.ts"
  - "Tests pass: pnpm --filter project-arch test src/core/tasks/createTask.test.ts src/core/tasks/updateTask.test.ts src/cli/commands/task.test.ts"
  - "Typecheck passes: pnpm --filter project-arch typecheck"
traceLinks: []
dependsOn:
  - "002"
blocks:
  - "007"
---

## Scope

Wrap task creation and status mutation operations in an atomic synchronization contract spanning markdown task files and graph manifests.

## Objective

Eliminate partial writes and stale graph/task state by ensuring mutating commands either fully succeed or fully fail with rollback.

## Acceptance Checks

- [x] Create/update task commands perform all required writes as one operation.
- [x] Mid-operation failures roll back previously written artifacts.
- [x] Tests cover both success and failure/rollback paths.

## Implementation Plan

1. Identify all write surfaces touched by task create/update flows.
2. Introduce transaction wrapper with rollback actions.
3. Refactor command handlers to use transactional write path.
4. Add failure-injection tests for rollback correctness.

## Verification

- Run: `pnpm --filter project-arch test src/core/tasks/createTask.test.ts src/core/tasks/updateTask.test.ts src/cli/commands/task.test.ts`
- Run: `pnpm --filter project-arch typecheck`
- Validate injected graph failure rolls back roadmap task file updates in create/update tests.

## Evidence

- Transaction failure tests prove rollback for both create and update mutations when graph sync fails.
- Successful mutation tests still pass for create/update and CLI task flows.
- End-to-end targeted suites pass (23/23 tests).

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P0-C)

## Dependencies

### Depends On

- `002`

### Blocks

- `007`
