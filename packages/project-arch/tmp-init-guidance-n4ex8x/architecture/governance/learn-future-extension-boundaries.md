# Learn Future Extension Boundaries

This document defines why `pa learn --path` remains read-only in milestone 10 and what must happen before any future mutation behavior is considered.

## Purpose

- preserve a clear read-only first implementation pass for `pa learn --path`
- defer `--fix`, `--apply`, or similar mutation behavior until later governance work exists
- prevent advisory reporting from drifting into implicit repository mutation

## Milestone 10 Rule

For milestone 10, `pa learn --path` is read-only.

- it may analyze
- it may classify
- it may report
- it may recommend governed next steps
- it must not modify repository state

## Deferred Extension Flags

The following categories are explicitly deferred from milestone 10:

- `--fix`
- `--apply`
- any flag that writes architecture files, roadmap files, or code
- any flag that auto-runs suggested commands as a side effect of learning

## Why Deferral Is Required

- the learn surface is being introduced first as a scoped understanding and planning command
- the report contract and command ownership model must remain stable before mutation is considered
- automatic repair would otherwise blur the boundary between diagnostics, workflows, and direct scaffold or remediation commands

## Separate-Decision Rule

Any future mutation feature for `pa learn --path` requires a later, separate decision before implementation.

That later decision must define at minimum:

- which surfaces may be modified
- what safety model applies
- how preview, confirmation, and rollback behave
- how mutation behavior differs from existing workflow or remediation surfaces

## Guardrails Against Implicit Escalation

- do not let recommendation output silently become execution behavior
- do not let `pa learn --path` write files just because a drift type is well understood
- do not hide mutation behind convenience flags without reopening the product boundary
- do not bypass the ownership boundaries already defined relative to `pa check`, `pa doctor`, and workflow surfaces

## Relationship To Other Surfaces

- `pa learn --path` remains advisory
- workflows remain the place for guided multi-step execution
- any future apply behavior must be designed in relation to those existing surfaces rather than smuggled into learn by default

## Sequencing Rule

Do not implement mutation behavior for `pa learn --path` until:

1. the read-only learn command surface is implemented and validated
2. the report contract is stable enough to support previewable changes
3. a separate decision explicitly approves mutation behavior

## Reuse Contract

Later learn-command implementation and any future extension proposal should treat this document as the source of truth for why mutation is deferred and what approval boundary must be crossed before that changes.
