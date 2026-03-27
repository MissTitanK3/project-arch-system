# Init Output Tier Model

This document defines the formal tier model used to reason about `pa init` scaffold scope.

## Purpose

- give `pa` one stable vocabulary for scaffold scope decisions
- distinguish default init behavior from broader first-party scaffold behavior
- keep init project-agnostic while still allowing wider first-party coverage later

## Working Mode Split

- `pa init` = Tier A + applicable Tier B
- `pa init --full` = Tier A + applicable Tier B + scaffoldable Tier C + safe Tier D

This split defines the model. It does not require every later tier or mode to be fully implemented yet.

## Tier Definitions

### Tier A — Always scaffolded

Surfaces that should exist in nearly every initialized repository because they are part of the smallest coherent default scaffold.

Operational meaning:

- included in default `pa init`
- broadly applicable across projects
- foundational enough that later work can assume they exist

### Tier B — Template scaffolded

Surfaces that are required only because the selected template needs them.

Operational meaning:

- included in default `pa init` only when the chosen template requires them
- not treated as universal across all future stacks
- may still be authoritative for the current template

### Tier C — Catalog only

First-party topics that should be visible and discoverable without being scaffolded by default.

Operational meaning:

- not created on disk by default `pa init`
- should appear in indexes, catalogs, or planning guidance
- may become scaffoldable later when first-party content exists and broader modes justify materialization

### Tier D — Optional add-ons

Artifacts that are useful but should only be created when explicitly adopted, requested, or safely widened later.

Operational meaning:

- not part of the smallest coherent default scaffold
- may be too specific, too noisy, or too preference-sensitive for default init
- should remain project-agnostic even when widened by future non-interactive modes

## Decision Rules

- Use Tier A only for surfaces that are foundational to nearly every initialized repository.
- Use Tier B when the surface exists because of the selected template rather than because it is universally required.
- Use Tier C when visibility matters more than immediate file creation.
- Use Tier D when the surface is useful but should remain opt-in or otherwise safely widened later.

## Guardrails

- The tier model must remain project-agnostic and domain-agnostic.
- `pa init --full` broadens first-party scaffolding; it does not generate domain-specific content.
- Helpful does not automatically mean default.
- Catalog-only visibility is often the right answer when a topic matters but does not need day-one files on disk.

## Reuse Contract

Later milestone work should use this document as the shared source of truth when deciding whether a surface belongs in default init, `--full`, catalog-only guidance, or optional add-on behavior.
