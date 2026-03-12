# Reconciliation Report Schema

This document defines the output contract for reconciliation reports produced by `pa reconcile` and `pa backfill`.

## Contract Version

- Current version: `1.0`
- Status: stable

## Versioning Rules

- Patch (`1.0.x`): clarifications only, no payload shape changes.
- Minor (`1.x`): additive changes only (new optional fields).
- Major (`x.0`): breaking changes (field removal, rename, or type change).

## Source

Schema is defined in `packages/project-arch/src/schemas/reconciliationReport.ts` using Zod.  
Derives from the output contract described in `feedback/reconciliation-implementation-rfc.md` (RFC-IR-001).

---

## Shape (`1.0`)

```typescript
{
  schemaVersion: "1.0",
  id: string,
  type: "local-reconciliation" | "tooling-feedback",
  status: "no reconciliation needed" | "reconciliation suggested" | "reconciliation required" | "reconciliation complete",
  taskId: string,
  date: "YYYY-MM-DD",
  author?: string,
  summary?: string,
  changedFiles: string[],
  affectedAreas: string[],
  missingUpdates: string[],
  missingTraceLinks: string[],
  decisionCandidates: string[],
  standardsGaps: string[],
  proposedActions: string[],
  feedbackCandidates: string[],
  notes?: string
}
```

---

## Field Semantics

| Field | Required | Type | Description |
| --- | --- | --- | --- |
| `schemaVersion` | yes | `"1.0"` | Locked contract version. |
| `id` | yes | `string` | Unique identifier for this report instance. |
| `type` | yes | enum | `local-reconciliation` — scoped to the current repository. `tooling-feedback` — scoped to `project-arch` tooling. |
| `status` | yes | enum | One of the four reconciliation statuses (see below). |
| `taskId` | yes | `string` | The task ID that triggered this report. |
| `date` | yes | `YYYY-MM-DD` | ISO 8601 date the report was produced. |
| `author` | no | `string` | Agent or human who produced the report. |
| `summary` | no | `string` | One or two sentences describing what triggered this report and what it covers. |
| `changedFiles` | yes | `string[]` | Files changed by the source task. Empty array when none. |
| `affectedAreas` | yes | `string[]` | Architecture areas, domains, model files, or `project-arch` components affected. |
| `missingUpdates` | yes | `string[]` | Architecture docs, model files, trace links, or standards that need to be updated. |
| `missingTraceLinks` | yes | `string[]` | Specific trace links that are absent and should be added. |
| `decisionCandidates` | yes | `string[]` | Items that should become explicit architecture decisions. |
| `standardsGaps` | yes | `string[]` | Standards implied or changed by this work that are not yet codified. |
| `proposedActions` | yes | `string[]` | Concrete next steps (update file X, add decision for Y). |
| `feedbackCandidates` | yes | `string[]` | Systemic gaps that should become `project-arch` tooling improvements. |
| `notes` | no | `string` | Optional freeform context, caveats, or reviewer instructions. |

---

## Status Enum

| Value | Meaning |
| --- | --- |
| `no reconciliation needed` | Work is complete. No architecture drift or update is required. |
| `reconciliation suggested` | Minor gaps exist. Reconciliation is recommended but not blocking. |
| `reconciliation required` | Significant drift, boundary change, or standards gap detected. Mandatory before dependent work proceeds. |
| `reconciliation complete` | Reconciliation has been performed and all required outputs are updated. |

---

## Type Enum

| Value | Scope of `affectedAreas` |
| --- | --- |
| `local-reconciliation` | Current repository (`architecture/`, `arch-model/`, `roadmap/decisions/`, etc.) |
| `tooling-feedback` | `project-arch` components (CLI, schemas, standards scaffolding, reasoning structure) |

---

## Durable Output Locations

Accepted reconciliation reports are promoted to:

- `architecture/` — for architecture doc updates
- `arch-model/` — for module/ownership model updates
- `roadmap/decisions/` — for decision candidates that are accepted
- `.project-arch/reconcile/` — temporary staging location before promotion

---

## Human-Readable Markdown Derivation

The Markdown report template defined in `architecture/workflows/implementation-reconciliation.md` maps directly to this schema. Each section heading corresponds to a field:

| Markdown section | Schema field |
| --- | --- |
| `## Summary` | `summary` |
| `## Changed Files` | `changedFiles` |
| `## Affected Areas` | `affectedAreas` |
| `## Missing Updates` | `missingUpdates` |
| `## Decision Candidates` | `decisionCandidates` |
| `## Standards Affected` | `standardsGaps` |
| `## Proposed Actions` | `proposedActions` |
| `## Feedback Candidates` | `feedbackCandidates` |
| `## Notes` | `notes` |
| frontmatter `Status` | `status` |
| frontmatter `Type` | `type` |
| frontmatter `Source Task` | `taskId` |
| frontmatter `Date` | `date` |
| frontmatter `Author` | `author` |

---

## Example: Local Reconciliation Report

```json
{
  "schemaVersion": "1.0",
  "id": "reconcile-001",
  "type": "local-reconciliation",
  "status": "reconciliation complete",
  "taskId": "001",
  "date": "2026-03-12",
  "author": "agent",
  "summary": "Implemented implementation-reconciliation.md workflow doc and registered the reconciliation report schema.",
  "changedFiles": [
    "testProject/architecture/workflows/implementation-reconciliation.md",
    "packages/project-arch/src/schemas/reconciliationReport.ts"
  ],
  "affectedAreas": [
    "architecture/workflows",
    "packages/project-arch/src/schemas"
  ],
  "missingUpdates": [],
  "missingTraceLinks": [],
  "decisionCandidates": [],
  "standardsGaps": [],
  "proposedActions": [],
  "feedbackCandidates": [],
  "notes": ""
}
```

## Example: Tooling Feedback Report

```json
{
  "schemaVersion": "1.0",
  "id": "feedback-001",
  "type": "tooling-feedback",
  "status": "reconciliation suggested",
  "taskId": "005",
  "date": "2026-03-12",
  "summary": "Trigger detection is not yet exposed in the pa CLI.",
  "changedFiles": [],
  "affectedAreas": ["project-arch/cli"],
  "missingUpdates": ["CLI does not expose reconciliation trigger detection"],
  "missingTraceLinks": [],
  "decisionCandidates": ["Add reconciliation trigger config to pa CLI"],
  "standardsGaps": ["No standard for reconciliation trigger threshold"],
  "proposedActions": ["Open project-arch issue for pa reconcile --trigger-check flag"],
  "feedbackCandidates": ["pa reconcile trigger-check not yet available"],
  "notes": "Observed in milestone-1 and milestone-2."
}
```
