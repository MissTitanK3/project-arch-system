# Revised Setup Template Shape

This document assembles the reusable setup planning rules into a concrete, project-agnostic milestone template shape that is more granular than the older eight-task setup pattern.

## Purpose

- provide a concrete replacement shape for coarse setup templates
- show how planning tranches become actual planned setup tasks
- keep discovery reserved for meaningful project-specific expansion rather than missing template structure

## Recommended Setup Sequence

Use the following sequence as the default shape for future setup milestones:

1. define project overview
2. define project goals and success criteria
3. map user or operator journey
4. define scope and non-scope
5. define taxonomy and authority model
6. define lifecycle and state boundaries
7. define system and capability boundaries
8. define ownership and interface model
9. define documentation structure and authoring workflow
10. reconcile taxonomy and terminology
11. finalize setup synthesis
12. validate and clean up setup outputs

## Template Shape By Planning Tranche

| Planning tranche | Recommended setup task shape |
| --- | --- |
| Project framing | tasks 1 through 4 |
| Taxonomy and authority | task 5 |
| Lifecycle and state modeling | task 6 |
| Capability and system modeling | task 7 |
| Ownership and interface boundaries | task 8 |
| Documentation structure and authoring model | task 9 |
| Taxonomy normalization and reconciliation | task 10 |
| Validation and cleanup | tasks 11 and 12 |

## Placement Rules

- tasks 1 through 4 establish framing before deeper modeling begins
- taxonomy and authority work should appear before later authoring and reconciliation tasks
- synthesis belongs near the end after the major definition tasks exist
- validation and cleanup belong last so they review a coherent setup result

## Discovery Rule

Discovery should remain available for project-specific edge cases, contradictions found while applying the planned template, and genuine emergent expansion. It should not be the first place recurring setup categories appear.

## Improvement Over The Older Shape

Compared with the older eight-task setup pattern, this revised shape:

- separates taxonomy and authority work from generic architecture finalization
- gives lifecycle and state modeling an explicit place
- gives documentation structure and authoring guidance an explicit place
- gives normalization and terminology reconciliation an explicit place
- moves synthesis and validation into distinct late-stage work
- reduces pressure for discovery to compensate for missing setup structure

## Implementation Note

This guide defines the recommended future setup milestone shape. The current init scaffold may still use a smaller bootstrap sequence until template generation is updated to adopt this shape directly.

## Reuse Contract

Use this guide together with `setup-planning-tranches.md`, `setup-task-ordering.md`, `setup-discovery-boundary.md`, and `setup-validation-placement.md` when future setup templates are generated or reviewed.
