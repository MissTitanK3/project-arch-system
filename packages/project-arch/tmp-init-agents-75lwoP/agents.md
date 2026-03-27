# Agents Guide

This file is the root entry point for LLMs and autonomous agents operating in this repository.

Agents must follow the read order and operating rules defined below before making any repository changes.

---

## 1. Read Order

Agents must read documentation in the following order before executing work.

1. `architecture/system.md`

   - Single entrypoint that summarizes architecture, domains, model, and roadmap context.

1. `architecture/governance/REPO-MODEL.md`

   - Repository architecture model and authority hierarchy.

1. `arch-model/README.md`

   - Machine-readable codebase topology and module navigation.

1. `.arch/graph.json`

   - Machine-readable architecture traceability graph.

1. `architecture/README.md`

   - Documentation structure and navigation.

1. `arch-domains/README.md`

   - Domain boundaries and ownership map.

1. `architecture/product-framing/*`

   - Project goals
   - product intent
   - user journey
   - scope boundaries

1. `architecture/systems/*`, `architecture/data/*`, `architecture/runtime/*`, `architecture/governance/*`

   - canonical system boundaries and architecture constraints

1. `architecture/standards/*`

   - implementation and repository standards
   - always include `architecture/standards/markdown-standards.md` when authoring or editing Markdown

1. `roadmap/projects/<project>/phases/*`

   - Current development phase
   - milestones
   - active tasks

1. `roadmap/decisions/*`

   - architectural decisions that constrain implementation

1. `roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/targets.md`

   Canonical implementation targets for task placement.

1. `architecture/templates/*`

   - canonical architecture templates

1. `architecture/foundation/*`, `architecture/legacy-architecture/*`, `architecture/reference/*` (legacy transitional only)

   Legacy context only while the canonical taxonomy is adopted.

1. Relevant topic directories depending on the task.

Agents must not begin implementation before completing this read order.

---

## 2. Topic Map

### Product Intent

architecture/product-framing/

Defines product goals, scope, and user journey.

---

### Architecture

architecture/systems/
architecture/data/
architecture/runtime/
architecture/governance/

Defines canonical system structure, domain boundaries, and major architectural decisions.

---

### Standards

architecture/standards/

Defines binding implementation and repository standards.

Primary Markdown reference: `architecture/standards/markdown-standards.md`

---

### Domains

arch-domains/

Defines business-domain ownership boundaries and problem-space mapping.

---

### Templates

architecture/templates/

Canonical architecture templates and related generation guidance.

---

### Execution Plan

roadmap/projects/
roadmap/decisions/

Active project scopes, phases, milestones, tasks, and decision records.

---

### Shared Packages

packages/

---

### AI Map

arch-model/

Machine-readable module boundaries, entrypoints, dependencies, ownership, and surfaces.

---

### Architecture Graph

.arch/

Machine-readable graph linking domains, decisions, milestones, tasks, and modules.

---

## 3. Agent Execution Workflow

Agents must follow this workflow when performing work.

### Step 1 - Understand Context

Read:

architecture/product-framing/
architecture/systems/
architecture/data/
architecture/runtime/
architecture/governance/
architecture/standards/
architecture/standards/markdown-standards.md
arch-domains/
roadmap/projects/

Confirm:

- project goals
- current milestone
- active tasks

---

### Step 2 - Select Work Item

Agents must only execute work defined in:

roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/tasks/
roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/targets.md

Task lanes (organized by ID ranges):

- **planned/** (001-099): Pre-planned milestone tasks
- **discovered/** (101-199): Tasks discovered during execution
- **backlog/** (901-999): Future/deferred task ideas

Rules:

- Prefer tasks in `planned/`
- `discovered/` tasks must be documented before execution
- `backlog/` tasks are not part of the active milestone
- Use `pa task lanes <phase> <milestone>` to check available task IDs

---

### Step 3 - Implement Work

Implementation must occur in:

packages/

Agents must follow:

architecture/standards/*

---

### Step 4 - Maintain Traceability

When changes occur, agents must update:

- Task file: progress or completion.
- Decision logs: architecture changes.
- Documentation: new features or behavior.

Traceability must exist between:

Task
Decision
Code
Documentation

---

## 4. Operating Rules

Agents must follow these constraints.

### Source of Truth

- `architecture/`: project meaning and constraints.
- `roadmap/`: execution plan and delivery state.
- `packages/`: runtime modules and shared infrastructure.

---

### Documentation Authority

Documentation is hierarchical. Resolve conflicts using this order:

1. `architecture/product-framing`
1. `architecture/systems`
1. `architecture/data`
1. `architecture/runtime`
1. `architecture/governance`
1. `architecture/standards`
1. `arch-domains`
1. `roadmap/decisions`
1. `roadmap/projects`
1. `architecture/templates`
1. `architecture/foundation`
1. `architecture/legacy-architecture`
1. `architecture/reference`

`architecture/reference` is informational only and must not override architecture or standards. Legacy directories remain lower-authority during taxonomy migration.

---

### Concept Creation Rule

Agents must not introduce new architectural concepts during implementation.

Concepts include:

- domains
- modules
- features
- system layers

If a required concept does not exist, the agent must:

1. create a decision proposal
1. document the concept
1. wait for approval before implementation

---

### Documentation Discipline

Agents must:

- keep architecture decisions documented
- keep tasks synchronized with implementation
- avoid undocumented architectural changes

---

### Artifact Creation

Agents must not create new structure arbitrarily.

New artifacts should be created using CLI tooling when available.

### CLI-First Enforcement (Required)

When a `pa` command exists for the artifact being created (phase, milestone, task, decision), agents must follow this order:

1. Attempt the appropriate `pa` command first.
1. If the command appears interactive, still attempt it in the current execution context before falling back.
1. Manual file creation is allowed only after a `pa` attempt fails with a non-zero exit code or a clear execution error.
1. Any manual fallback must include a short record in the current work summary containing:
   - the attempted `pa` command
   - the failure signal (exit code and/or error message)
   - the manual artifact path(s) created as fallback

Agents must not skip a `pa` attempt solely because help output suggests interactivity.

#### Project Architecture CLI (pa)

**Initialization:**

```bash
pa init [options]                    # Initialize new project architecture
```

**Phase Management:**

```bash
pa phase new <phaseId> --project <projectId>      # Create new phase (format: phase-1, phase-2)
pa phase list --project <projectId>               # List phases for a project
```

**Milestone Management:**

```bash
pa milestone new <phase> <milestone> --project <projectId>      # Create new milestone
pa milestone list --project <projectId>                         # List milestones for a project
pa milestone activate <phase> <milestone> --project <projectId> # Activate milestone (requires ≥1 planned task)
pa milestone complete <phase> <milestone> --project <projectId> # Complete milestone (governance check)
pa milestone status <phase> <milestone> --project <projectId>   # Show task statuses with dependency gating
```

**Task Management (Lane System):**

Tasks are organized into three lanes with distinct ID ranges:

- **planned** (001-099): Pre-planned milestone tasks
- **discovered** (101-199): Tasks discovered during execution
- **backlog** (901-999): Future/deferred task ideas

```bash
pa task new <phase> <milestone> --project <projectId>                # Create planned task (001-099)
pa task discover <phase> <milestone> --project <projectId> --from <taskId>  # Create discovered task (101-199)
pa task idea <phase> <milestone> --project <projectId>               # Create backlog idea (901-999)
pa task status <phase> <milestone> <taskId> --project <projectId>    # Get task status
pa task lanes <phase> <milestone> --project <projectId>              # Show lane usage and next available IDs
pa task lanes -v <phase> <milestone> --project <projectId>           # Show all task IDs (not truncated)
pa task register-surfaces <phase> <milestone> <taskId> --project <projectId>  # Bulk-register untracked code paths to codeTargets
  # Options: --from-check (default), --include <glob...>, --exclude <glob...>, --dry-run
```

**Decision Management:**

```bash
pa decision new [options]            # Create architecture decision record
  # Options: --scope (project|phase|milestone), --phase, --milestone, --slug, --title
pa decision link <decisionId> [options]  # Link decision to tasks/code/docs
  # Options: --task, --code, --doc
pa decision status <decisionId> <status>  # Update decision status
  # Status: proposed|accepted|rejected|superseded
pa decision supersede <decisionId> <supersededId>  # Mark superseded decision
pa decision list                     # List all decisions
pa decision migrate [--scan-only]    # Migrate legacy decision files (--scan-only: report without writing)
```

**Validation & Reporting:**

```bash
pa doctor                            # Canonical preflight: lint frontmatter → pnpm lint:md → pa check
pa check                             # Validate architecture consistency
pa check --json                      # Machine-readable diagnostics
pa lint frontmatter                  # Lint YAML frontmatter (tabs, missing keys, schema/type issues)
pa lint frontmatter --fix            # Auto-fix safe whitespace issues
pa policy check                      # Detect timing/domain policy conflicts (JSON output)
pa policy explain                    # Human-readable policy conflict rationale
pa report                            # Generate architecture report
pa report -v                         # Include detailed inconsistency diagnostics
pa docs                              # List all architecture documentation
pnpm lint:md                         # Lint Markdown files (ignores node_modules/.next/.turbo/dist)
```

Run `pa doctor` before marking a milestone complete or transitioning phases. It is the single command that covers all three preflight steps in order.

**Feedback Management:**

```bash
pa feedback --help                   # Show feedback command group and subcommands
pa feedback list                     # List open feedback issues
pa feedback show <issueId>           # Show full detail for a feedback issue
pa feedback review <issueId>         # Review issue with terminal or deferred outcome
pa feedback export <issueId>         # Export issue report without changing issue state
pa feedback prune                    # Prune expired observations and stale deferred issues
pa feedback rebuild                  # Rebuild issue index/summaries from retained observations
pa feedback refresh                  # Clear derived feedback state and rebuild from retained observations
```

**Feedback Invocation Policy:**

Use `pa feedback` when:

- architecture validation or workflow friction repeats across tasks/milestones
- `pa check`, `pa lint frontmatter`, `pa policy check`, or milestone governance output indicates recurring issues
- there is a need to inspect, triage, or close previously detected architecture/process problems
- the agent must produce a shareable issue artifact (`pa feedback export`) without mutating issue state

Do NOT use `pa feedback` when:

- executing normal one-off implementation tasks with no recurring diagnostics
- creating new roadmap artifacts (`phase`, `milestone`, `task`, `decision`) where standard `pa` commands are sufficient
- validating immediate local changes where `pa check`/`pa report` already provide adequate signal
- there are no feedback issues to inspect (`pa feedback list` empty) and no recurring pattern to capture

**Reconciliation:**

```bash
pa reconcile task <taskId>           # Post-implementation reconciliation pass for a completed task
  # Options: --files <paths>  Comma-separated additional changed file paths
  # Output: JSON+Markdown report written to .project-arch/reconcile/
pa backfill implemented              # List completed tasks with missing or incomplete reconciliation
pa backfill implemented --json       # Also write artifact to .project-arch/reconcile/
```

Run `pa reconcile task <taskId>` after marking a task `done` to verify code targets, trace
links, and architecture areas are consistent. Run `pa backfill implemented` to identify any
completed tasks that were never reconciled.

**Help System:**

```bash
pa help <topic>                      # Get detailed help on a topic
  # Topics: commands, workflows, lanes, decisions, architecture, standards, validation, remediation
pa help topics                       # List all available help topics
pa help commands                     # Complete command reference for AI agents
pa feedback --help                   # Feedback subcommand reference (not listed in pa help topics)
```

**File Path Conventions:**

| Artifact  | Path pattern                                                                    |
| --------- | ------------------------------------------------------------------------------- |
| Task      | `roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/tasks/{lane}/{id}-{slug}.md` |
| Decision  | `roadmap/decisions/{scope}/{id}-{slug}.md`                                      |
| Phase     | `roadmap/projects/{project}/phases/{phase}/overview.md`                         |
| Milestone | `roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/overview.md`  |

**ID Validation Patterns:**

| Field        | Pattern              | Example              |
| ------------ | -------------------- | -------------------- |
| Task ID      | `^\d{3}$`           | `001`, `042`, `999`  |
| Phase ID     | `^phase-\d+$`       | `phase-1`, `phase-2` |
| Milestone ID | `^milestone-[\w-]+$`| `milestone-1-setup`  |
| Decision ID  | `^\d{3}$`           | `001`, `042`         |

---

#### Lifecycle Constraints

These constraints are not enforced by the CLI but cause validation failures if violated.

**Phase close (no `pa phase complete` command):**

1. Ensure all planned and discovered tasks in the phase have `status: done`.
1. Add `status: completed` to the phase overview YAML frontmatter manually:

   ```yaml
   status: completed
   ```

1. Run `pa doctor` to confirm `pa policy check` is clean.
1. Advance `activePhase` by running `pa milestone new` or `pa milestone activate`
   on the next phase (which updates `roadmap/manifest.json`).

**Milestone close:**

`pa milestone complete` clears `activeMilestone` in `roadmap/manifest.json` but does
not write `status: completed` to the milestone overview frontmatter. A milestone is
considered complete by the policy engine when either:

- All tasks in the milestone have `status: done`, **or**
- The milestone overview frontmatter contains `status: completed`

Backlog tasks (`901-999`) with `status: todo` will block the `allTasksDone` path.
To avoid false `TIMING_CONFLICT` warnings when progressing to the next milestone,
add `status: completed` to completed milestone overviews.

**`pa milestone activate` prerequisite:**

Activation is blocked until at least one planned task exists in `tasks/planned/`.
Create the first task before calling activate:

```bash
pa task new <phase> <milestone> --project <projectId>
pa milestone activate <phase> <milestone> --project <projectId>
```

**`discoveredFromTask` quoting rule:**

Task IDs in `discoveredFromTask` frontmatter must be quoted strings, not bare integers:

```yaml
discoveredFromTask: '008'   # correct
discoveredFromTask: 008     # wrong — YAML coerces to integer 8, fails schema
```

If `pa lint frontmatter` reports `SCALAR_SAFETY` or `SCHEMA_TYPE` on `discoveredFromTask`,
quote the value.

**Status value contract:**

The policy engine checks for the exact string `completed` (not `complete`). The schema
does not validate this field on overview files, so the error is silent until
`pa policy check` is run. Always use:

```yaml
status: completed
```

---

### Safety Rules

Agents must NOT:

- invent architecture not aligned with `architecture`
- skip tasks in the execution plan
- modify milestone structure without explicit direction
- introduce undocumented dependencies
- delete decision history

---

## 5. Agent Philosophy

This repository follows a repo-native architecture system.

All knowledge required to build the system exists inside the repository.

Agents should prioritize:

1. traceability
1. deterministic structure
1. documentation alignment
1. minimal architectural drift
