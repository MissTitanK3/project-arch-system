# Project-Arch Assessment Report (Phase 1 Milestones)

**Date**: 2026-03-08  
**Scope**: Assessment of what is working vs. what is causing strain after completion of milestone-1-setup and milestone-2-gaps, with milestone-3-validation active.

---

## Executive Verdict

project-arch is strong at **forcing structure** and **generating documentation throughput**. It is weak at **maintaining synchronized truth across state surfaces** under execution pressure.

Current state is not failing, but it is internally inconsistent in ways that will scale poorly once runtime implementation starts.

---

## Evidence Snapshot

### Roadmap and milestone state

- `roadmap/manifest.json` shows:
  - `activePhase: phase-1`
  - `activeMilestone: milestone-3-validation`
- Milestone manifests show:
  - `milestone-1-setup`: completed
  - `milestone-2-gaps`: completed
  - `milestone-3-validation`: active

### Task volume and lane load

Computed from task files:

- Planned tasks: **10**
- Discovered tasks: **31**
- Backlog tasks: **0**
- Total tasks: **41**

Derived ratios:

- Discovered ratio: **31 / 41 = 75.6%**
- Planned ratio: **24.4%**

Interpretation: the process is running mostly on emergent work, not upfront milestone design.

### Tool output consistency

- `pa check` -> **OK**
- `pa report` -> reports active milestone as `milestone-1-setup` (conflicts with `roadmap/manifest.json`)

### Traceability graph coverage

- `.arch/nodes/tasks.json` contains **14** tasks
- `.arch/edges/milestone_to_task.json` contains **14** milestone-task links
- Roadmap task files total **41**

Coverage gap:

- Missing from graph: **27 / 41 tasks (65.9%)**

### Status drift

At least one direct mismatch found:

- `phase-1/milestone-2-gaps/104`
  - task file frontmatter status: `done`
  - `.arch/nodes/tasks.json` status: `todo`

This is a hard synchronization failure, not cosmetic noise.

---

## What Is Working Well

## 1) Governance discipline is real

The repository enforces a clear hierarchy:

- architecture meaning (`architecture/`)
- execution state (`roadmap/`)
- runtime code surfaces (`apps/`, `packages/`)

Agent behavior is constrained by explicit authority order and task-first execution model. This reduces random implementation drift.

## 2) Lane model enables high throughput

Planned/discovered/backlog lanes worked operationally during milestone-2 load. IDs remained collision-free and lane ranges were respected.

Even with high discovered volume, the team did not collapse into untracked ad hoc edits.

## 3) Validation command exists and is fast

`pa check` returning OK provides a baseline integrity guard that is simple to run and easy to integrate in workflow.

## 4) Documentation production quality is high

Task templates include objective, inputs, implementation plan, verification criteria, and document links. This produces actionable artifacts and lowers ambiguity during documentation-heavy milestones.

## 5) Decision logging is active

Project-level decisions were actually captured and accepted, not ignored. That matters because concept-creation guardrails depend on decision records to remain enforceable.

---

## What Is Causing Strain

## 1) Multiple “truths” for active state

`pa report` and roadmap manifests disagree on active milestone. This is not a minor bug; it makes the primary reporting command unreliable.

When the reporting layer cannot be trusted, teams start bypassing it and rely on tribal knowledge.

## 2) Traceability synchronization is incomplete

Task execution significantly outpaced `.arch` graph updates. With only 14/41 tasks represented, traceability claims are inflated relative to actual coverage.

This undermines the entire “task -> decision -> code/doc” chain because the graph is supposed to be the machine-readable proof.

## 3) Status propagation is non-transactional

A completed task can remain `todo` in graph nodes. That means updates are best-effort across artifacts rather than atomic.

As task count grows, this turns into silent reporting corruption.

## 4) Milestone activation has no minimum task floor

milestone-3-validation is active with empty lane directories. The process permits “active milestone” without executable work units.

This creates a false sense of forward motion and weakens milestone-level accountability.

## 5) Planning quality signal is weakly governed

A 75.6% discovered-task ratio indicates upfront milestone decomposition was insufficient. High discovered volume is expected, but this level suggests planning debt rather than normal discovery.

No hard control currently forces replanning when discovered tasks dominate.

## 6) CLI UX still leaks friction in high-volume cases

Help output and long lane listings are usable but messy under load (wrapping/duplication). This is not a core blocker, but it adds friction in already-complex milestones.

---

## Root-Cause Diagnosis

Primary root cause is **state fragmentation without strict synchronization semantics**.

Current model has several artifacts that can independently represent milestone/task state:

- roadmap manifests
- task frontmatter
- `.arch` nodes/edges
- CLI report outputs

Without a strict canonical source + deterministic sync contract, drift is guaranteed.

Secondary root cause is **weak process guardrails for transition points**:

- milestone activation without minimum task readiness
- no discovered-ratio threshold requiring replanning
- no parity check between roadmap task files and `.arch` task nodes in validation gate

---

## Recommended vNext Changes (Prioritized)

## P0 — Must fix before Phase 2 implementation scales

### A) Canonicalize active state source

- Define roadmap manifests as the single source of truth for:
  - active phase
  - active milestone
- `pa report` must read this source directly.
- If any secondary surface disagrees, command should emit explicit inconsistency diagnostics.

### B) Add parity validation to `pa check`

Hard-fail when:

- task count in roadmap files != task count in `.arch` nodes
- milestone-task links missing for existing tasks
- task status differs between task file and graph node

### C) Enforce atomic sync on mutating commands

Any command that creates/updates tasks should update all required machine-readable surfaces in one transaction.

If sync fails, command must fail and roll back, not leave partial state.

## P1 — Needed to stop planning debt from compounding

### D) Add milestone activation gate

Cannot mark milestone active unless:

- at least one planned task exists
- milestone targets file exists
- success criteria/checklist exists

### E) Add discovered-load governance

When discovered ratio exceeds configurable threshold (recommend 40%):

- emit warning in `pa report`
- require explicit “replan checkpoint” marker before milestone completion

### F) Normalize status enum globally

Use one status vocabulary across all artifacts (`todo`, `in-progress`, `done` or equivalent), and enforce it through schema validation.

## P2 — Quality of life and operational diagnostics

### G) Upgrade `pa report`

Include:

- source-of-truth provenance per metric
- last sync timestamp
- parity summary (roadmap vs graph)
- inconsistency table with file paths

### H) Improve lane/readability UX

- avoid wrapped `IDs` lines for long lists
- reduce duplicate help blocks
- provide concise + verbose display modes

### I) Add task-vs-architecture policy conflict command

Add a dedicated command to detect conflicts between **task instructions** and **established architecture/decision constraints**.

Proposed command shape:

- `pa policy check` -> deterministic conflict detection only
- `pa policy explain` -> conflict detection plus human-readable interpretation and remediation guidance

Minimum conflict classes:

- task instruction contradicts accepted decision status or scope (e.g., implement now vs deferred)
- task introduces concept blocked by concept-creation rule without a linked decision proposal
- task placement/action conflicts with domain ownership or architecture boundaries
- task timing conflicts with phase/milestone constraints documented in roadmap/architecture

Output requirements:

- severity (`error`, `warn`, `info`)
- confidence score
- explicit conflicting claim pair (task claim vs architecture/decision claim)
- remediation action (rewrite task, create decision, reschedule phase, re-scope target)

---

## Proposed Acceptance Criteria for vNext

1. `pa report` active milestone always matches `roadmap/manifest.json`.
2. `pa check` fails if any task exists in roadmap but not in `.arch` nodes.
3. `pa check` fails on status mismatch between task frontmatter and graph node.
4. Task create/update commands produce synchronized roadmap + graph state in one operation.
5. Activating a milestone with zero planned tasks is blocked.
6. `pa report` shows discovered ratio and flags threshold breaches.
7. `pa policy check` detects task-architecture and task-decision conflicts with deterministic rules.
8. `pa policy explain` emits user-readable rationale and remediation for each detected conflict.

---

## Current Risk If Unchanged

If this is not fixed before runtime-heavy phases:

- Reporting trust will degrade.
- Traceability will become performative instead of verifiable.
- Teams will spend increasing time reconciling artifacts manually.
- Architectural governance benefits will be partially canceled by operational overhead.

---

## Final Assessment

project-arch has proven it can drive disciplined architecture execution. It has not yet proven it can maintain single-source, machine-verifiable state integrity under milestone-scale workload.

The next version should focus less on adding new process surfaces and more on making existing state surfaces deterministic, synchronized, and fail-fast when inconsistent.
