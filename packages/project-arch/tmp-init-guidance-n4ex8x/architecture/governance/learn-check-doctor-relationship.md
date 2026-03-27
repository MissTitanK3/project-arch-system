# Learn, Check, And Doctor Relationship

This document defines the ownership boundary between `pa learn --path`, `pa check`, and `pa doctor`.

## Purpose

- prevent `pa learn --path` from becoming a duplicate validation command
- preserve existing ownership for repository-wide diagnostics and preflight flow
- define how learn may reuse diagnostics without replacing the owning surface

## Command Ownership

- `pa check` owns repository-wide structural validation and diagnostic emission
- `pa doctor` owns preflight command orchestration and the broad validation flow
- `pa learn --path` owns scoped interpretation of relevant drift for one or more explicit paths

## `pa learn --path` Versus `pa check`

`pa check` answers: what is wrong across the repository right now?

`pa learn --path` answers: what do these explicit paths appear to be missing, drifting from, or needing next?

Boundary rules:

- `pa check` may emit flat diagnostics across all relevant repository surfaces
- `pa learn --path` should narrow attention to the analyzed paths and their immediate architectural relationships
- `pa learn --path` may reuse `pa check`-style findings, but it should reinterpret them in a path-scoped way rather than simply replaying the full diagnostic list

## `pa learn --path` Versus `pa doctor`

`pa doctor` answers: is the repository broadly ready according to the preflight sequence?

`pa learn --path` answers: what targeted understanding or sync planning does this specific path set need?

Boundary rules:

- `pa doctor` remains the single-command preflight surface
- `pa learn --path` must not absorb linting, policy checks, or full-repository validation orchestration
- `pa learn --path` may suggest running `pa doctor`, but it does not replace it

## Reuse Without Replacement

`pa learn --path` may consume existing diagnostic information when useful.

- it may classify and regroup findings originally detected by repository-wide checks
- it may map those findings to the analyzed paths and related modules
- it must not claim ownership of the underlying validation rules that belong to `pa check`
- it must not become a wrapper that silently runs preflight orchestration and presents itself as `pa doctor`

## Usage Guidance

Use `pa check` when:

- the goal is repository-wide validation
- the user needs a full diagnostic sweep
- the user wants canonical validation output

Use `pa doctor` when:

- the goal is preflight confirmation before completion or transition
- the user wants the full validation sequence in one command

Use `pa learn --path` when:

- the goal is understanding a specific file or directory in context
- the user needs path-scoped drift interpretation and follow-up planning
- the user wants actionable guidance without mutating repository state

## Anti-Overlap Rules

- do not turn `pa learn --path` into a second repository-wide validator
- do not turn `pa learn --path` into a renamed `pa doctor` flow
- do not hide command orchestration behind the learn surface
- do not blur flat diagnostics with path-scoped interpretation

## Help Text Implication

Later CLI help and docs should present the three commands as complementary:

- `pa check`: validate the repository
- `pa doctor`: run the preflight validation flow
- `pa learn --path`: interpret one or more explicit paths and suggest next governed steps

## Reuse Contract

Later milestone 10 work should treat this document as the source of truth for command ownership, reuse boundaries, and user-facing command selection guidance.
