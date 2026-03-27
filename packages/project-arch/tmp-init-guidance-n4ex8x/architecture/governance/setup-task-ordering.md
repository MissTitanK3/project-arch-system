# Setup Task Ordering And Dependency Rules

This document defines the reusable ordering model for setup milestone tasks so broad synthesis appears after prerequisite definition work rather than competing with it.

## Purpose

- keep setup milestones sequenced in a way that reduces discovery churn
- make prerequisite relationships visible in generated task templates
- ensure synthesis and validation tasks happen after the documents they reconcile actually exist

## Ordering Model

Setup milestones should generally move through these stages in order:

1. project framing
2. taxonomy and authority setup
3. lifecycle and state modeling
4. capability and system modeling
5. ownership and interface boundaries
6. documentation structure and authoring guidance
7. normalization and reconciliation
8. final synthesis and validation

## Dependency Rules

- Broad synthesis tasks must depend on the definition tasks whose outputs they reconcile.
- Finalization tasks should be the last planned tasks in the setup sequence unless a later task is purely mechanical verification.
- Validation and cleanup tasks may follow synthesis, but they should not replace synthesis.
- Definition tasks should not depend on later synthesis tasks.
- A task may depend on parallel definition work across multiple tranches when it is responsible for cross-document consistency.

## Early, Mid, And Late Placement

### Early Sequence

Place framing and authority work early so later tasks have stable vocabulary, scope, and source-of-truth rules.

Typical early tasks:

- define project overview
- define project goals
- map user journey
- define scope and non-scope

### Mid Sequence

Place system, state, runtime, and ownership-definition work in the middle once project framing exists.

Typical mid-sequence tasks:

- define system boundaries
- define module model
- define runtime architecture

### Late Sequence

Place broad synthesis, consistency review, and setup validation at the end after prerequisite definition tasks are complete.

Typical late tasks:

- finalize architecture foundation readiness
- run consistency sweeps
- validate setup completeness

## Finalization Rule

Tasks such as `finalize architecture foundation` are end-of-sequence synthesis tasks. They must not appear before the domain, module, runtime, and framing definitions they are intended to reconcile.

## Template Rule

Future setup templates should encode these dependency expectations directly in planned task metadata so the generated sequence communicates why synthesis occurs late.

## Reuse Contract

Later template work should use this ordering model together with `setup-planning-tranches.md` so setup milestones stay domain-agnostic while still producing a coherent execution sequence.
