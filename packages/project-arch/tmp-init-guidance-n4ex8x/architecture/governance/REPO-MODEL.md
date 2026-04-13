# Repository Mental Model

This repository uses a four-layer model to keep planning, architecture, execution, and code aligned.

## 1. Foundation

Location: `architecture/product-framing/` (with legacy `architecture/foundation/` content during transition)

Purpose: Define why the system exists, who it serves, what success looks like, and what is in/out of scope.

## 2. Architecture

Location: `architecture/systems/`, `architecture/data/`, `architecture/runtime/`, `architecture/governance/`, `architecture/standards/`

Purpose: Define how the system should be built, constrained, and maintained.

## 3. Execution

Location: `roadmap/projects/<project>/phases/`, `roadmap/decisions/`

Purpose: Track what is being built now through phases, milestones, tasks, and decisions.

## 4. Runtime

Location: `packages/`

Purpose: Hold the actual implementation artifacts that deliver behavior.

## Migration Guidance

Existing repositories may adopt the canonical taxonomy incrementally.

- Move product intent and scope docs from legacy `foundation/` locations into `architecture/product-framing/` first.
- Normalize architecture behavior docs by role: `systems/`, `data/`, `runtime/`, and `governance/`.
- Keep legacy directories readable during transition, but treat them as lower-authority context until references are updated.
- Use `architecture/governance/taxonomy-migration.md` for the detailed mapping and partial-adoption guidance.

## Init Tier Model

Init scaffold scope is defined by the tier model in `architecture/governance/init-tier-model.md`.
Default `pa init` behavior is defined in `architecture/governance/init-default-behavior.md`.
`pa init --full` behavior is defined in `architecture/governance/init-full-behavior.md`.
Surface-category placement is defined in `architecture/governance/init-surface-tier-mapping.md`.
Future surface admission rules are defined in `architecture/governance/init-sprawl-guardrails.md`.
Reusable setup planning lanes are defined in `architecture/governance/setup-planning-tranches.md`.
Reusable setup ordering rules are defined in `architecture/governance/setup-task-ordering.md`.
Reusable setup discovery boundaries are defined in `architecture/governance/setup-discovery-boundary.md`.
Reusable setup validation and cleanup placement rules are defined in `architecture/governance/setup-validation-placement.md`.
The assembled revised setup milestone shape is defined in `architecture/governance/setup-template-shape.md`.
The canonical first-party agent-surface model is defined in `architecture/governance/agent-surface-strategy.md`.
The canonical agent entry-point file inventory is defined in `architecture/governance/agent-entry-point-file-list.md`.
The shared canonical agent entry-point content model is defined in `architecture/governance/agent-entry-point-content-model.md`.
Canonical init behavior for agent entry-point scaffolding is defined in `architecture/governance/agent-entry-point-scaffolding.md`.
Explicit exclusions and compatibility hooks for agent entry-point scaffolding are defined in `architecture/governance/agent-entry-point-exclusions.md`.
Workflow scaffolding scope is defined in `architecture/governance/workflow-scaffolding-scope.md`.
The first-pass workflow inventory is defined in `architecture/governance/workflow-initial-set.md`.
Workflow-specific context consumption rules are defined in `architecture/governance/workflow-context-consumption.md`.
Workflow init-tier placement is defined in `architecture/governance/workflow-init-tier-placement.md`.
Supported workflow generation surfaces are defined in `architecture/governance/workflow-generation-surfaces.md`.
The first-pass workflow file inventory is defined in `architecture/governance/workflow-file-inventory.md`.
The generated workflow content model is defined in `architecture/governance/workflow-content-model.md`.
Workflow generation and regeneration behavior is defined in `architecture/governance/workflow-generation-behavior.md`.
The CLI context-resolution contract is defined in `architecture/governance/cli-context-contract.md`.
The minimum CLI context payload is defined in `architecture/governance/cli-context-payload.md`.
Downstream CLI context consumption rules are defined in `architecture/governance/cli-context-consumption.md`.
CLI surface relationships for context, `pa next`, and reporting are defined in `architecture/governance/cli-context-surface-relationships.md`.
The `pa learn --path` command boundary is defined in `architecture/governance/learn-command-boundary.md`.
The `pa learn --path` report contract is defined in `architecture/governance/learn-report-contract.md`.
The relationship between `pa learn --path`, `pa check`, and `pa doctor` is defined in `architecture/governance/learn-check-doctor-relationship.md`.
Future mutation boundaries for `pa learn --path` are defined in `architecture/governance/learn-future-extension-boundaries.md`.

- Tier A: always scaffolded
- Tier B: template scaffolded
- Tier C: catalog only
- Tier D: optional add-ons

## Agent Rule

When making changes, keep all four layers synchronized. Do not change runtime behavior without updating execution and architecture context as needed.
