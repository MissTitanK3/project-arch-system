# Template Usage Guide

This document defines when agents should use each template type to maintain consistency and avoid over-generation of artifacts.

## Task Template

**File**: `task.ts`

**When to Use**:

- When creating a new task in a milestone task lane (planned, discovered, or backlog)
- Use CLI: `pa task new {phase} {milestone}`

**When NOT to Use**:

- Do not create tasks outside of milestone context
- Do not create multiple tasks for the same work item

---

## Decision Template

**File**: `decision.ts`

**When to Use**:

- When making an architectural decision that affects system design, module structure, or technology choices
- When a task implementation requires an architectural choice between alternatives
- Use CLI: `pa decision new`

**When NOT to Use**:

- For routine implementation choices that don't affect architecture
- For decisions already covered by existing decision records
- During every task (only when architecture decisions are needed)

---

## Domain Spec Template

**File**: Created from `DOMAIN_TEMPLATE.md` in `arch-domains/`

**When to Use**:

- When introducing a new business domain to the system
- When domain boundaries need to be formalized
- Before implementing features that span multiple modules

**When NOT to Use**:

- For every feature or module
- When the domain already exists and is well-defined
- For technical infrastructure that doesn't represent a business domain

**Typical Frequency**: 1-5 times per project phase, not per task

---

## Architecture Spec Template

**File**: `architecture.ts` (creates `ARCHITECTURE_SPEC_TEMPLATE.md`)

**When to Use**:

- When documenting a significant architectural component or system
- When defining a new runtime architecture layer
- At the start of a major architectural milestone
- When architectural complexity requires formal documentation

**When NOT to Use**:

- For individual features or small components
- When existing architecture documentation is sufficient
- During routine task implementation

**Typical Frequency**: 2-8 times per project, not per milestone

---

## Concept-to-Artifact Mapping

**File**: `conceptMap.ts` (creates `concept-map.json`)

**When to Use**:

- At milestone planning time to map concepts to implementation artifacts
- When updating architectural traceability after major changes
- During architecture reviews to verify concept coverage

**When NOT to Use**:

- During individual task implementation
- For every code change
- When traceability is already established

**Typical Frequency**: Once per milestone (updated as needed)

---

## Milestone Gap Closure Report

**File**: `milestoneGapClosure.ts` (creates gap closure report)

**When to Use**:

- **ONLY when ALL tasks in a milestone have status "done"**
- During milestone retrospective or completion review
- Before transitioning to the next milestone
- When documenting lessons learned for future milestones

**When NOT to Use**:

- During task creation
- When any task in the milestone is still in-progress or blocked
- For individual task completion
- During mid-milestone reviews (use progress tracking instead)

**Typical Frequency**: Once per milestone at completion

**Template Location**: `architecture/reference/GAP_CLOSURE_REPORT_TEMPLATE.md`

**Trigger Conditions**:

1. All tasks in `roadmap/phases/{phase}/milestones/{milestone}/tasks/planned/` have `status: "done"`
2. All tasks in `roadmap/phases/{phase}/milestones/{milestone}/tasks/discovered/` have `status: "done"`
3. Milestone objectives are met or formally deferred
4. Team is ready to transition to next milestone

---

## Summary Matrix

| Template           | Frequency          | Trigger Event                       |
| ------------------ | ------------------ | ----------------------------------- |
| Task               | Per work item      | Creating new task                   |
| Decision           | As needed          | Architectural choice required       |
| Domain Spec        | 1-5 per phase      | New domain introduced               |
| Architecture Spec  | 2-8 per project    | Significant architectural component |
| Concept Map        | Once per milestone | Milestone planning or review        |
| Gap Closure Report | Once per milestone | All tasks done                      |

---

## Agent Rules

1. **Do not create templates preemptively** - only create when the trigger condition is met
2. **Do not duplicate existing artifacts** - check if template already exists before creating
3. **Follow CLI tooling** - use `pa` commands when available instead of manual template instantiation
4. **Validate timing** - ensure trigger conditions are satisfied before template creation
5. **Maintain traceability** - link templates to originating tasks, decisions, or milestones
