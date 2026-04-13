# `pa check --json` Diagnostics Contract

This document defines the machine-readable JSON contract emitted by:

```bash
pa check --json
```

## Contract Version

- Current version: `2.0`
- Status: stable for automation consumers

## Versioning Rules

- Patch (`2.0.x`): clarifications only, no payload shape changes.
- Minor (`2.x`): additive changes only (new optional fields).
- Major (`x.0`): breaking changes (field removal/rename/type change).

## Payload Shape (`2.0`)

```json
{
  "schemaVersion": "2.0",
  "status": "ok | invalid",
  "summary": {
    "errorCount": 0,
    "warningCount": 0,
    "diagnosticCount": 0
  },
  "graphDiagnostics": {
    "built": true,
    "completeness": {
      "score": 100,
      "threshold": 100,
      "sufficient": true,
      "connectedDecisionNodes": 0,
      "totalDecisionNodes": 0
    },
    "disconnectedNodes": {
      "decisionsWithoutDomain": [],
      "decisionsWithoutTaskBackReferences": [],
      "domainsWithoutDecisions": [],
      "taskReferencesToMissingDecisions": []
    }
  },
  "diagnostics": [
    {
      "code": "<STABLE_CODE>",
      "severity": "error | warning",
      "message": "string",
      "path": "string | null",
      "hint": "string | null"
    }
  ]
}
```

## Field Semantics

- `status`: `ok` when no errors are present; `invalid` when one or more errors exist.
- `schemaVersion`: contract version of this JSON payload.
- `summary.errorCount`: number of error diagnostics.
- `summary.warningCount`: number of warning diagnostics.
- `summary.diagnosticCount`: total diagnostics count.
- `diagnostics`: ordered list of all diagnostics emitted by `check`.
- `graphDiagnostics`: dedicated graph-completeness section, including score and disconnected-node report.
- `diagnostics[].code`: stable machine-friendly identifier.
- `diagnostics[].severity`: one of `error` or `warning`.
- `diagnostics[].message`: human-readable diagnostic text.
- `diagnostics[].path`: extracted repository-relative path when detectable; otherwise `null`.
- `diagnostics[].hint`: remediation hint when available; otherwise `null`.

## Consumer Guidance

- Treat unknown `code` values as valid and forward-compatible.
- Do not parse business logic from `message` text when `code` is available.
- Use `summary` fields for aggregate CI gates; use `diagnostics` for remediation workflows.

## Stable Diagnostic Code Coverage

`pa check --json` emits stable code values for key repository validation classes, including:

- `DUPLICATE_TASK_ID`
- `MISSING_TASK_CODE_TARGET`, `MISSING_DECISION_CODE_TARGET`
- `MISSING_TASK_PUBLIC_DOC`, `MISSING_DECISION_PUBLIC_DOC`
- `TASK_UNDECLARED_MODULE`, `DECISION_UNDECLARED_MODULE`
- `TASK_UNDECLARED_DOMAIN`
- `INVALID_DECISION_TASK_LINK`, `MISSING_LINKED_TASK`, `MISSING_SUPERSEDED_DECISION`
- `PROJECT_DECISION_INDEX_MISSING_ENTRY`, `PHASE_DECISION_INDEX_MISSING_ENTRY`, `MILESTONE_DECISION_INDEX_MISSING_ENTRY`
- `MISSING_LANE_DIRECTORY`, `MISSING_GRAPH_ARTIFACT`, `GRAPH_PARITY_MISMATCH`
- `INVALID_CONCEPT_MAP_SCHEMA`
- `INVALID_RECONCILE_CONFIG_SCHEMA`

For diagnostics emitted by other subsystems (for example drift checks), producer-specific stable codes are preserved.
If a diagnostic is not mapped to a specific stable code, fallback values are `CHECK_ERROR` or `CHECK_WARNING`.

## Example

```json
{
  "schemaVersion": "2.0",
  "status": "invalid",
  "summary": {
    "errorCount": 1,
    "warningCount": 1,
    "diagnosticCount": 2
  },
  "graphDiagnostics": {
    "built": true,
    "completeness": {
      "score": 75,
      "threshold": 80,
      "sufficient": false,
      "connectedDecisionNodes": 3,
      "totalDecisionNodes": 4
    },
    "disconnectedNodes": {
      "decisionsWithoutDomain": ["project:20260322:orphan"],
      "decisionsWithoutTaskBackReferences": [],
      "domainsWithoutDecisions": ["payments"],
      "taskReferencesToMissingDecisions": []
    }
  },
  "diagnostics": [
    {
      "code": "UNMAPPED_MODULE",
      "severity": "error",
      "message": "packages/new-module not declared in arch-model/modules.json",
      "path": "packages/new-module",
      "hint": null
    },
    {
      "code": "UNTRACKED_IMPLEMENTATION",
      "severity": "warning",
      "message": "packages/ui/src/Button.tsx not associated with any task or decision codeTarget",
      "path": "packages/ui/src/Button.tsx",
      "hint": null
    }
  ]
}
```
