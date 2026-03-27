# Default Init Behavior

This document defines what the default `pa init` command should scaffold under the tier model.

## Purpose

- define the smallest coherent default scaffold
- explain which surfaces belong in default init and why
- prevent the default init path from growing through ad hoc additions

## Core Position

Default `pa init` should create the smallest coherent default scaffold.

That means the initialized repository should have enough structure to begin planning, documenting, and implementing work without forcing users to manually assemble the core first-party surfaces themselves.

It does not mean every useful topic should appear on disk by default.

## Default Mode Rule

Default `pa init` includes:

- Tier A surfaces
- applicable Tier B surfaces required by the selected template

Default `pa init` does not include by default:

- Tier C catalog-only topics
- Tier D optional add-ons

## What Belongs In The Smallest Coherent Default Scaffold

The default scaffold should include categories such as:

- roadmap and core project-arch planning surfaces
- canonical architecture entry docs and recommended top-level architecture families
- foundational first-party governance docs that explain repository structure and authority
- core required standards
- canonical document templates needed for normal repository use
- template-specific required standards for the selected stack

## Default Roadmap Layout

The default initialized roadmap model is a single roadmap root with project-owned planning trees.

Default `pa init` should create:

- `roadmap/manifest.json`
- `roadmap/policy.json`
- `roadmap/decisions/`
- `roadmap/projects/shared/manifest.json`
- `roadmap/projects/shared/overview.md`
- `roadmap/projects/shared/phases/phase-1/...`

## Reserved Bootstrap Project

`shared` is the reserved bootstrap project created by default init.

It exists so a repository starts with one canonical cross-cutting planning scope for architecture, platform, and shared dependency work before additional named projects are introduced.

Repositories may add additional custom-named projects under `roadmap/projects/`, but the default scaffold should always explain `shared` as the initial cross-cutting scope rather than as the only valid project name.

## Adding Custom Projects

When a repository needs project-specific delivery planning beyond `shared`, add a new directory under `roadmap/projects/<name>/`.

Recommended structure:

- `roadmap/projects/<name>/manifest.json`
- `roadmap/projects/<name>/overview.md`
- `roadmap/projects/<name>/phases/`

Naming rules:

- choose repository-meaningful names that reflect a product, service, app surface, client, or operational boundary
- examples include `storefront`, `backoffice`, `customer-portal`, and `ops-console`
- `app-*` naming is optional, not required
- reserve `shared` for the default cross-cutting bootstrap project

Manifest expectations:

- include a stable `id` that matches the project directory name
- include a `title`, `type`, and `summary`
- use `ownedPaths` for the surfaces the project owns
- use `sharedDependencies` for cross-project dependencies rather than ownership

## What Must Stay Out Of Default Init

The default scaffold should not create by default:

- broader catalog topics that are useful but not necessary for day-one repository coherence
- optional standards that only become enforceable after project adoption
- extra compatibility packs or workflow packs that are not foundational to the default experience
- domain-specific documents or project-subject-matter-specific content

## Decision Rules

- Include a surface in default init only if removing it would make the repository materially less coherent on day one.
- Include template-specific required surfaces only when the chosen template depends on them.
- Prefer catalog visibility over default file creation when a topic is important but not foundational.
- If a surface is helpful mainly in some repositories, it should not automatically enter default init.

## Guardrails

- Default init must stay project-agnostic.
- Default init must stay domain-agnostic.
- Helpful is not sufficient justification for adding a surface to the default scaffold.
- The default experience should remain small enough that users are not forced to review a large set of optional files before they can begin work.

## Relationship To Other Init Modes

This document defines only the default mode.

- Use `init-tier-model.md` for the formal tier vocabulary.
- Use later milestone work to define how `pa init --full` broadens beyond this default contract.

## Reuse Contract

Later milestone work should use this document as the source of truth for deciding whether a proposed surface belongs in default init or should remain outside the smallest coherent scaffold.
