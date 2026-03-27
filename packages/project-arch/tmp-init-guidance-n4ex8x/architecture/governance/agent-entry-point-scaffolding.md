# Agent Entry-Point Scaffolding

This document defines how `pa init` should materialize the canonical agent entry-point inventory and how re-init should behave for those surfaces.

## Purpose

- define how canonical agent entry points should be created during init
- define how re-init should behave so agent entry-point scaffolding stays predictable
- tie the canonical file inventory and content model back to the default init experience

## Default Init Materialization

Default `pa init` should materialize the canonical agent entry-point inventory defined in `architecture/governance/agent-entry-point-file-list.md`.

That means later agent-entry implementation should create:

- root-level canonical entry-point files
- canonical vendor-native supporting files
- canonical vendor-native rule directories and rule files

These surfaces should be created as first-party defaults, not as optional compatibility add-ons.

## Placement Rules

- root-level entry-point files belong at repository root for immediate tool discovery
- vendor-native supporting files should live in the native locations expected by their host tools
- vendor-native rule directories should be created with the minimum directory structure needed for their canonical rule files

## Re-Init And Idempotency

- re-running `pa init` should be safe and predictable for canonical agent entry-point surfaces
- managed agent entry-point files should follow the same overwrite policy used elsewhere in init
- without `--force`, existing managed entry-point files should not be overwritten silently
- with `--force`, managed entry-point files may be regenerated from the canonical content model
- later implementation should avoid duplicating files or creating variant names during re-init

## Immediate Discovery Goal

The canonical entry-point scaffold should make the repository discoverable to major agent tools immediately after init, without requiring users to add a second instruction system by hand.

## Coexistence Rule

- canonical agent entry-point files should coexist with the existing roadmap, architecture, standards, and repository scaffold
- agent entry-point scaffolding should consume those existing project sources of truth rather than replacing them
- workflow files remain outside this scaffolding behavior and belong to a later milestone

## Transitional Note

If the current init scaffold still contains transitional agent surfaces from earlier phases, those should be treated as transitional compatibility until the dedicated entry-point implementation fully materializes the canonical inventory.

## Reuse Contract

Later milestone work should treat this document as the source of truth for how canonical agent entry-point files are materialized by `pa init` and how re-init should treat those files.
