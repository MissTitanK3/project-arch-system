# Initial Workflow Set

This document defines the constrained first-pass workflow inventory that `pa` should support once workflow scaffolding is introduced.

## Purpose

- make the first workflow inventory explicit before workflow files are generated
- keep milestone 7 focused on the highest-value recurring agent helper flows
- prevent speculative or low-signal workflows from expanding the first pass

## Prioritization Rule

The first workflow set should cover the repeated moments where agents most often forget to use `pa` commands during normal coding work. First-pass workflows should be few, broadly useful, and aligned to recurring project-governance actions rather than niche repository situations.

## Ratified First Workflow Set

### 1. `before-coding`

Purpose: prepare an agent to start a coding session against the correct repository context before code changes begin.

This workflow should center actions such as:

- resolving current task context
- reviewing the canonical agent entry points and relevant architecture surfaces
- checking what the next required governance step is before editing code

### 2. `after-coding`

Purpose: run the immediate post-edit governance and validation loop after meaningful code changes are made.

This workflow should center actions such as:

- running verification and repository checks
- reconciling changed surfaces with project-architecture expectations
- surfacing follow-up governance actions before the session ends

### 3. `complete-task`

Purpose: close out an active task cleanly once implementation work is done.

This workflow should center actions such as:

- final validation and documentation checks
- updating task state and review artifacts
- ensuring the task closure path follows the repository governance model

### 4. `new-module`

Purpose: guide agents through the repository-governed setup path when introducing a new module, package, app area, or comparable structural surface.

This workflow should center actions such as:

- registering new surfaces and ownership expectations
- linking structural changes back to architecture and roadmap artifacts
- ensuring new structural work does not bypass planning and governance steps

### 5. `diagnose`

Purpose: provide a repeatable helper flow for debugging, drift analysis, or structural health investigation when normal implementation work is blocked or unclear.

This workflow should center actions such as:

- running health, report, or diagnostic command paths
- collecting enough context to distinguish structural problems from task-local problems
- directing agents toward the right reporting or reconciliation surfaces

## Why These Workflows Come First

- they map to recurring moments in normal coding work rather than rare maintenance cases
- they package the `pa` command categories agents are most likely to forget without workflow support
- they are broad enough to matter across repositories but still constrained enough to implement coherently
- they reinforce the canonical governance path instead of creating an alternate operating model

## First-Pass Exclusions

The first workflow set should not include:

- niche repository-specific flows that only apply to one template or domain
- workflows that depend on unresolved compatibility-surface decisions
- broad maintenance bundles that collapse reporting, diagnosis, reconciliation, and repair into one opaque helper
- workflow proliferation for every individual `pa` command

## Reuse Contract

Later milestone 7 work should treat this document as the source of truth for which workflows are in scope for the first-pass scaffold set and why lower-priority candidates remain out of scope.
