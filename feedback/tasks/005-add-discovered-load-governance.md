---
schemaVersion: "1.0"
id: "005"
slug: "add-discovered-load-governance"
title: "Add discovered-load governance and replan checkpoint"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "planning"
  - "governance"
  - "reporting"
codeTargets:
  - "packages/project-arch/src/core/reports/generateReport.ts"
  - "packages/project-arch/src/cli/commands/report.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "Report computes discovered ratio and compares against threshold"
  - "Threshold breach emits warning"
  - "Milestone completion requires explicit replan checkpoint on breach"
scope: "Planning debt controls and reporting"
acceptanceChecks:
  - "Threshold defaults to 40% and is configurable"
  - "Completion blocked when threshold breached and no checkpoint present"
evidence:
  - "Added discovered-load governance utilities in packages/project-arch/src/core/governance/discoveredLoad.ts"
  - "Updated report computation/warnings in packages/project-arch/src/core/reports/generateReport.ts"
  - "Added milestone completion gate in packages/project-arch/src/core/milestones/createMilestone.ts"
  - "Added CLI/SDK complete support in packages/project-arch/src/cli/commands/milestone.ts and packages/project-arch/src/sdk/milestones.ts"
  - "Tests pass: pnpm --filter project-arch test src/core/reports/generateReport.test.ts src/cli/commands/report.test.ts src/core/milestones/createMilestone.test.ts src/cli/commands/milestone.test.ts src/sdk/milestones.test.ts src/sdk/registry.test.ts"
  - "Typecheck passes: pnpm --filter project-arch typecheck"
traceLinks: []
dependsOn:
  - "001"
blocks: []
---

## Scope

Add governance around discovered/planned balance and enforce replan checkpoints when discovered work dominates.

## Objective

Expose planning debt in `pa report` and prevent silent milestone completion without explicit replanning when discovered ratio exceeds policy.

## Acceptance Checks

- [x] Report includes discovered ratio percentage.
- [x] Report warns when ratio exceeds configured threshold.
- [x] Milestone completion enforces checkpoint requirement when threshold is exceeded.

## Implementation Plan

1. Add discovered ratio + threshold computation to report pipeline.
2. Add warning output format and config lookup.
3. Add milestone completion gate tied to replan checkpoint marker.
4. Add tests for below-threshold, above-threshold, and checkpoint-present flows.

## Verification

- Run: `pnpm --filter project-arch test src/core/reports/generateReport.test.ts src/cli/commands/report.test.ts src/core/milestones/createMilestone.test.ts src/cli/commands/milestone.test.ts src/sdk/milestones.test.ts src/sdk/registry.test.ts`
- Run: `pnpm --filter project-arch typecheck`

## Evidence

- Report output includes `discovered ratio` metric and emits `Planning Governance Warnings` when discovered load exceeds policy threshold.
- Threshold defaults to 40% and is configurable via `roadmap/governance.json` (`discoveredLoadThresholdPercent`) or `PA_DISCOVERED_LOAD_THRESHOLD_PERCENT`.
- Milestone completion is blocked on threshold breach without `replan-checkpoint.md`, and succeeds when checkpoint marker exists.

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P1-E)

## Dependencies

### Depends On

- `001`

### Blocks

- None.
