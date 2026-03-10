# `pa check --json` Diagnostics Contract

This document defines the machine-readable JSON contract emitted by:

```bash
pa check --json
```

## Contract Version

- Current version: `1.0`
- Status: stable for automation consumers

## Versioning Rules

- Patch (`1.0.x`): clarifications only, no payload shape changes.
- Minor (`1.x`): additive changes only (new optional fields).
- Major (`x.0`): breaking changes (field removal/rename/type change).

## Payload Shape (`1.0`)

```json
{
  "schemaVersion": "1.0",
  "status": "ok | invalid",
  "summary": {
    "errorCount": 0,
    "warningCount": 0,
    "diagnosticCount": 0
  },
  "diagnostics": [
    {
      "code": "CHECK_ERROR | CHECK_WARNING | <DRIFT_CODE>",
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
- `diagnostics[].code`: stable machine-friendly identifier when available.
- `diagnostics[].severity`: one of `error` or `warning`.
- `diagnostics[].message`: human-readable diagnostic text.
- `diagnostics[].path`: extracted repository-relative path when detectable; otherwise `null`.
- `diagnostics[].hint`: remediation hint when available; otherwise `null`.

## Consumer Guidance

- Treat unknown `code` values as valid and forward-compatible.
- Do not parse business logic from `message` text when `code` is available.
- Use `summary` fields for aggregate CI gates; use `diagnostics` for remediation workflows.

## Example

```json
{
  "schemaVersion": "1.0",
  "status": "invalid",
  "summary": {
    "errorCount": 1,
    "warningCount": 1,
    "diagnosticCount": 2
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
