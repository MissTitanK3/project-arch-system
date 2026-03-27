# Workflow Generation Surfaces

This document defines which concrete workflow target surfaces `pa` will support for first-pass workflow-file generation.

## Purpose

- constrain milestone 9 to a concrete and implementable workflow target surface
- separate supported workflow-generation surfaces from speculative compatibility ideas
- keep workflow-file generation aligned with the canonical agent-surface strategy and the Tier D add-on model

## First-Pass Supported Surface

The first-pass supported workflow-generation surface is:

- `.github/workflows/*.md` as the first-party generated workflow-document surface

This surface is selected because it gives `pa` one concrete repository-visible location for generated workflow guidance without competing with the canonical entry-point files that remain the primary instruction system.

## First-Party Versus Compatibility

- first-party supported workflow-generation surface: `.github/workflows/*.md`
- compatibility-only or future workflow surfaces: any additional tool-specific or extension-specific workflow directories

Workflow files generated into the supported first-pass surface remain subordinate helper artifacts. They do not replace `AGENTS.md`, vendor-native entry-point files, or the canonical CLI context contract.

## Explicit First-Pass Exclusions

The first pass does not support automatic generation into:

- `.agent/workflows/`
- vendor-specific workflow directories that do not yet have a ratified first-party contract
- repository-root ad hoc workflow files outside the selected supported surface
- multiple parallel workflow surfaces in the same repository by default

## Selection Rationale

- one supported surface is easier to implement and verify than parallel multi-surface generation
- keeping one first-pass target reduces content drift and regeneration complexity
- compatibility surfaces can still be evaluated later without reopening milestone 7 workflow policy
- the chosen surface keeps workflow helpers visible while preserving canonical entry points as the primary instruction model

## Relationship To Canonical Entry Points

- canonical entry points remain the authoritative instruction surfaces
- generated workflow files are helper documents layered on top of those entry points
- workflow generation must not create a competing repository instruction system

## Reuse Contract

Later milestone 9 work should treat this document as the source of truth for which workflow target surfaces are supported in the first implementation pass and which candidate surfaces remain excluded or future compatibility work.
