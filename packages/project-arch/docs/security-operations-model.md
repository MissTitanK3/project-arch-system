# Security & Operations Model

This document defines the security-facing operator model for `project-arch`.

## Scope

The model covers:

- file creation and modification side effects,
- network behavior,
- subprocess usage,
- runtime configuration loading paths.

## File Creation and Modification

### Initialization (`pa init`)

`pa init` scaffolds and manages repository architecture state, including:

- `roadmap/`
- `architecture/`
- `arch-domains/`
- `arch-model/`
- `.project-arch/`
- `.arch/agents-of-arch/`

Re-init behavior:

- default: conflicting managed files are skipped and reported,
- `--force`: managed files are overwritten.

### Commands that create artifacts

These commands create new files/directories as part of normal operation:

- `pa phase new`
- `pa milestone new`
- `pa task new`
- `pa task discover`
- `pa task idea`
- `pa decision new`
- `pa agents new`
- `pa reconcile task` (writes reports under `.project-arch/reconcile/`)

### Commands that modify artifacts

These commands can update existing files (or create missing managed state where noted):

- `pa decision link`
- `pa decision status`
- `pa decision supersede`
- `pa task register-surfaces` (unless `--dry-run`)
- `pa lint frontmatter --fix`
- `pa fix frontmatter --yes`
- `pa normalize --yes`
- `pa policy setup` (creates `roadmap/policy.json` when missing)
- `pa agents sync` (writes `.arch/agents-of-arch/registry.json` unless `--check`)
- `pa reconcile prune --apply`
- `pa reconcile compact --apply`
- `pa feedback` review/prune/export/rebuild/clear-derived/sync flows

### Automatic failure feedback capture

When CLI invocations fail (non-zero exit or thrown error), feedback capture can append observations to:

- `.arch/feedback/observations/YYYY-MM-DD.jsonl`

Capture is best-effort and does not fail the user command if feedback writing fails.

## Network Behavior

Normal CLI operation is offline and repository-local.

- No hidden HTTP(S) requests are issued by normal command execution.
- Core operations read and write local files under the current working tree.

## Subprocess Usage

Known subprocess invocations in the CLI:

- `pa check --changed`: runs `git status --porcelain` to infer changed paths.
- `pa doctor`: runs `pnpm lint:md` for markdown lint in its 3-step preflight.

## Runtime Config Loading

The CLI reads these runtime configuration files when present:

- `roadmap/policy.json`
  - policy profile resolution,
  - optional profile override via `PA_POLICY_PROFILE` env var.
- `.project-arch/graph.config.json`
  - graph suppression/classification rules.
- `.project-arch/reconcile.config.json`
  - reconciliation trigger include/exclude/override rules.
- `.project-arch/reconcile-config.json`
  - legacy reconcile config filename accepted for compatibility.
