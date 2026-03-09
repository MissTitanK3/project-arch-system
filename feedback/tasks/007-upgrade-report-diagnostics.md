---
schemaVersion: "1.0"
id: "007"
slug: "upgrade-report-diagnostics"
title: "Upgrade report with provenance, parity, and inconsistency diagnostics"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "report"
  - "diagnostics"
  - "ux"
codeTargets:
  - "packages/project-arch/src/core/reports/generateReport.ts"
  - "packages/project-arch/src/cli/commands/report.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "Report includes source-of-truth provenance per metric"
  - "Report includes last sync timestamp"
  - "Report includes roadmap-vs-graph parity summary"
  - "Report includes inconsistency table with file paths"
scope: "Operational diagnostics in report output"
acceptanceChecks:
  - "[x] Concise report retains readability while exposing diagnostics"
  - "[x] Verbose mode includes full inconsistency table"
evidence:
  - "Updated: packages/project-arch/src/core/manifests/graph.ts - Added lastSync timestamp (ISO 8601) to graph.json generation"
  - "Enhanced: packages/project-arch/src/core/reports/generateReport.ts - Added provenance annotations, parity checking, verbose mode support"
  - "Added: loadGraphMetadata() function - Loads graph.json with timestamp and node counts"
  - "Added: checkParityDiagnostics() function - Compares roadmap task status with .arch/nodes/tasks.json for mismatches"
  - "Added: renderParitySummary() function - Displays PASS/FAIL status with task counts and mismatch counts"
  - "Added: renderInconsistencyTable() function - Verbose mode table with Task ID, Roadmap Status, Graph Status, File Path columns"
  - "Updated: packages/project-arch/src/sdk/report.ts - Added verbose option parameter { verbose?: boolean; cwd?: string }"
  - "Updated: packages/project-arch/src/cli/commands/report.ts - Added -v/--verbose flag for detailed diagnostics"
  - "Provenance: All metrics now include [source: ...] annotations indicating data origin (manifest, roadmap files, calculated, etc.)"
  - "Graph sync: New 'graph sync status' row shows last sync timestamp or '(graph not synced)' message"
  - "Parity check: New section with ✓ PASS or ✗ FAIL status, tasks checked count, and mismatches count"
  - "Tests: packages/project-arch/src/core/reports/generateReport.test.ts - Added 8 new tests for provenance, timestamps, parity, verbose mode"
  - "Tests: packages/project-arch/src/cli/commands/report.test.ts - Added 5 new tests for CLI verbose flag, provenance, sync status"
  - "Tests: packages/project-arch/src/sdk/report.test.ts - Added 4 new tests for SDK verbose mode and new report features"
  - "Test run: All 37 report-related tests passing (20 core + 12 CLI + 5 SDK)"
  - "Typecheck: pnpm --filter project-arch typecheck - No errors"
traceLinks: []
dependsOn:
  - "001"
  - "002"
  - "003"
blocks: []
---

## Scope

Enhance report output to make data provenance and synchronization health directly visible.

## Objective

Turn `pa report` into an actionable diagnostic surface instead of a passive summary by adding provenance, parity, timestamps, and inconsistency details.

## Acceptance Checks

- [ ] Every major metric identifies its source artifact.
- [ ] Last synchronization timestamp is displayed.
- [ ] Parity summary clearly indicates pass/fail and counts.
- [ ] Inconsistency table includes IDs and file paths.

## Implementation Plan

1. Extend report model to include provenance and parity metadata.
2. Capture and render last sync timestamp.
3. Add inconsistency table formatting for concise and verbose views.
4. Add tests for output shape and correctness.

## Verification

- Run: `pnpm --filter project-arch test report.test.ts`
- Manually inspect sample concise and verbose outputs.

## Evidence

- Snapshot tests for concise and verbose modes.
- Captured sample output for parity failure scenario.

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P2-G)

## Dependencies

### Depends On

- `001`
- `002`
- `003`

### Blocks

- None.
