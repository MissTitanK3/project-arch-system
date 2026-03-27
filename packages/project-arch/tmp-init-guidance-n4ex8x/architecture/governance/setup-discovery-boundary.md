# Discovery Vs Planned Work Boundary

This document defines what should be seeded as planned setup work and what should still emerge through discovery once setup templates are improved.

## Purpose

- prevent discovery from acting as a substitute for missing setup template structure
- preserve discovery for real expansion, reconciliation, and project-specific variation
- make setup template reviews measurable by distinguishing missing planned work from legitimate discoveries

## Planned Work Criteria

Work should be seeded as planned setup work when it is generic enough to recur across many repositories and can be anticipated before project-specific execution begins.

Planned work should include:

- project framing
- taxonomy and authority definition
- lifecycle and state modeling lanes
- capability and system modeling lanes
- ownership and interface boundary definition
- documentation structure and authoring guidance
- terminology normalization and reconciliation lanes
- synthesis, validation, and cleanup lanes

## Discovery Criteria

Discovery should still be used when the work only becomes visible after planned setup tasks have started and the issue cannot be responsibly predicted by a project-agnostic template.

Discovery is appropriate for:

- project-specific edge cases
- contradictions uncovered while reconciling completed planned work
- expansions triggered by real repository structure, implementation constraints, or domain complexity
- risks or opportunities that were not generic setup categories
- one-off cleanup required by legacy drift or unusual repository history

## Not Valid Discovery

Discovery should not be used for work that is actually a missing planning tranche or a predictable setup responsibility.

The following are signs of invalid discovery:

- a discovered task repeats a generic setup category that should already exist in planned work
- multiple discovered tasks are created just to restore missing structure in framing, authority, modeling, or validation
- discovery is being used because the template grouped too much work into a vague umbrella task
- the task could have been named before execution without needing project-specific evidence

## Review Rule

When reviewing setup outcomes, repeated discovered tasks should be treated as feedback on the setup template before they are treated as normal project churn.

## Template Rule

Future setup templates should be expanded when discovery repeatedly produces the same category of work across projects. Discovery should narrow over time as reusable planning tranches improve.

## Reuse Contract

Use this boundary together with `setup-planning-tranches.md` and `setup-task-ordering.md` when reviewing or generating setup milestones so discovery remains meaningful rather than compensatory.
