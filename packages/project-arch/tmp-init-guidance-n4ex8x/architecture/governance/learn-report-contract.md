# Learn Report Contract

This document defines the minimum human-readable and JSON output contract for `pa learn --path`.

## Purpose

- make `pa learn --path` output concrete enough for CLI implementation
- define the minimum machine-readable payload for SDK and automation consumers
- keep the report recommendation-oriented and read-only

## Human-Readable Report Structure

The first implementation pass should emit a concise report with these sections in order:

1. scope header
2. findings grouped by category
3. per-category details for the analyzed path set
4. recommended follow-up commands
5. summary counts

The human-readable report should stay path-scoped and avoid dumping unrelated repository-wide diagnostics.

## Required Human-Readable Sections

- `Scope`: the analyzed file paths or directory paths
- `Findings`: grouped sections such as module registration, architecture decisions, task coverage, and domain or tagging gaps
- `Path Notes`: whether the finding applies to a file, directory, or grouped path set
- `Recommended Follow-Up`: explicit governed next steps expressed as commands or command categories
- `Summary`: total gaps, grouped counts, and whether any analyzed paths are already in sync

## JSON Output Contract

The first JSON contract should include:

- `schemaVersion`
- `timestamp`
- `analyzedPaths`
- `findings`
- `summary`
- `suggestedCommands`

The JSON payload must be stable enough for SDK reuse and scripted consumers without requiring the console renderer to be parsed.

## Required JSON Fields

The first implementation pass should require:

- `schemaVersion: string`
- `timestamp: string` in ISO-8601 format
- `analyzedPaths: string[]`
- `findings: LearnFinding[]`
- `summary.totalGaps: number`
- `summary.byCategory: Record<string, number>`
- `suggestedCommands: string[]`

Each `LearnFinding` should include at minimum:

- `category`
- `severity`
- `pathScope`
- `message`
- `evidence`
- `recommendedAction`

## File Versus Directory Representation

- file-scoped analysis should identify the exact file path in `pathScope`
- directory-scoped analysis should identify the directory and may aggregate subordinate evidence
- multi-path analysis should preserve each explicit input path while allowing grouped summary counts

The contract should never hide which analyzed path caused a finding.

## Follow-Up Guidance Rule

Recommended follow-up must remain advisory.

- suggestions may name exact `pa` commands
- suggestions may reference command categories when exact identifiers are not yet known
- suggestions must not imply that `pa learn --path` mutates repository state

## Read-Only Reporting Rule

Both human-readable and JSON output must preserve the read-only boundary established for `pa learn --path`.

- report findings
- explain drift
- suggest governed next steps
- do not apply fixes
- do not silently rewrite files

## First-Pass Example Shape

Human-readable example categories may include:

- Module Registration
- Architecture Decisions
- Task Coverage
- Domain Tags

JSON example shape:

```json
{
  "schemaVersion": "1.0",
  "timestamp": "2026-03-26T16:03:00Z",
  "analyzedPaths": ["packages/ui"],
  "findings": [
    {
      "category": "task-coverage",
      "severity": "warning",
      "pathScope": "packages/ui",
      "message": "Source files are not linked to task codeTargets.",
      "evidence": ["packages/ui/src/components/Header.tsx"],
      "recommendedAction": "pa task new <phase> <milestone> --project <projectId>"
    }
  ],
  "summary": {
    "totalGaps": 1,
    "byCategory": {
      "task-coverage": 1
    }
  },
  "suggestedCommands": ["pa task new <phase> <milestone> --project <projectId>"]
}
```

## Reuse Contract

Later milestone 10 work should treat this document as the source of truth for minimum learn-report rendering, JSON payload structure, and how recommendations remain advisory.
