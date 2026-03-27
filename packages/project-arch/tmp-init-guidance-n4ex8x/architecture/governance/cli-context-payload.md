# CLI Context Payload

This document defines the minimum structured payload that a future `pa context --json` surface must return so workflows and agent integrations can consume repository context without guessing.

## Purpose

- define the minimum machine-readable context contract for downstream automation
- make required fields explicit before command implementation begins
- ensure future workflow scaffolding can replace unresolved placeholders with stable structured values

## Minimum Payload

```json
{
  "version": 1,
  "timestamp": "2026-03-26T00:00:00.000Z",
  "projectRoot": "/absolute/path/to/project",
  "active": {
    "project": {
      "id": "shared",
      "path": "roadmap/projects/shared",
      "title": "Shared"
    },
    "phase": {
      "id": "phase-1",
      "path": "roadmap/projects/shared/phases/phase-1",
      "title": "Phase 1"
    },
    "milestone": {
      "id": "milestone-2",
      "path": "roadmap/projects/shared/phases/phase-1/milestones/milestone-2",
      "title": "Milestone 2"
    },
    "task": {
      "id": "003-implement-context",
      "path": "roadmap/projects/shared/phases/phase-1/milestones/milestone-2/tasks/planned/003-implement-context.md",
      "title": "Implement Context",
      "status": "in_progress"
    }
  },
  "recommended": {
    "task": {
      "id": "004-next-task",
      "path": "roadmap/projects/shared/phases/phase-1/milestones/milestone-2/tasks/planned/004-next-task.md",
      "title": "Next Task",
      "status": "todo"
    }
  }
}
```

## Required Fields

- `version`: payload contract version so consumers can detect breaking changes safely
- `timestamp`: generation time for the payload
- `projectRoot`: absolute project root used to resolve relative roadmap paths safely
- `active.project.id`, `active.project.path`, `active.project.title`: the current active project context
- `active.phase.id`, `active.phase.path`, `active.phase.title`: the current active phase context within that project
- `active.milestone.id`, `active.milestone.path`, `active.milestone.title`: the current active milestone context
- `active.task.id`, `active.task.path`, `active.task.title`, `active.task.status`: the current actionable task context

## Optional Or Deferrable Fields

- `recommended`: optional when no recommendation engine or `pa next` integration is available yet
- future metadata such as owners, labels, blockers, or decision links: deferrable until a later milestone requires them
- additional active context such as current decision or current subtask: optional unless a later consumer proves it is required

## Active Versus Recommended Context

The payload should represent active context and recommended context separately.

- `active` is the context the repository is currently executing against
- `recommended` is the next suggested context, if the project exposes one

Consumers must not treat `recommended` as a substitute for `active` context.

## Placeholder Elimination

The minimum payload must provide enough structured information that downstream tools do not have to carry unresolved placeholders such as `<phase>`, `<milestone>`, or `<task>` in workflow templates.

At minimum, a consumer should be able to read the payload and resolve:

- the current phase identifier and path
- the current milestone identifier and path
- the current task identifier, path, title, and status

## Stability Rules

- field names in the minimum payload should remain stable once implemented
- additions should be backward compatible whenever possible
- consumers should rely on `version` rather than inferring compatibility
- the minimum payload should stay small and avoid pulling in broad reporting data that belongs to other commands

## Reuse Contract

Later milestone work should treat this document as the source of truth for the minimum machine-readable context payload required before workflow scaffolding and agent integrations consume repository context directly.
