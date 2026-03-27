# Validation And Cleanup Placement

This document defines where synthesis, validation, cleanup, and normalization work should appear inside setup milestones.

## Purpose

- keep validation work late enough to assess a coherent setup result rather than partial drafts
- keep cleanup and normalization work close to the synthesis they depend on
- prevent validation and cleanup from being omitted, discovered late, or used as vague umbrella tasks

## Placement Rule

Validation and cleanup belong near the end of a setup milestone, after the core definition work is complete and after at least one synthesis task has reconciled the major setup artifacts.

## Sequence Relationship

Use this sequence as the default model:

1. definition work
2. synthesis and reconciliation
3. validation and cleanup

Validation should review synthesized structure, not partially completed inputs.
Cleanup should refine or normalize the synthesized structure, not replace definition work that never happened.

## Validation Responsibilities

Late-stage setup validation may include:

- checking cross-document consistency
- confirming planned setup documents are populated and non-placeholder
- verifying taxonomy usage, authority rules, and dependency guidance
- confirming setup outputs are usable by later milestones and agent workflows

## Cleanup And Normalization Responsibilities

Late-stage cleanup or normalization may include:

- resolving duplicated terminology
- consolidating overlapping notes after synthesis
- normalizing document names, locations, or references
- removing stale transitional wording exposed by the completed setup pass

## Separation Rule

- Synthesis is responsible for reconciling the main setup artifacts.
- Validation is responsible for checking whether the reconciled result is coherent.
- Cleanup is responsible for trimming drift, duplication, or stale residue after validation reveals it.
- A milestone may combine validation and cleanup in one late-stage task if the scope stays concrete.

## Anti-Pattern

Validation or cleanup should not appear early in the milestone as a stand-in for unfinished definition work. If validation finds missing core structure, that is feedback on earlier planned tasks or on the setup template itself.

## Reuse Contract

Use this guide with `setup-task-ordering.md` and `setup-discovery-boundary.md` so future setup templates place validation and cleanup intentionally rather than treating them as accidental tail work.
