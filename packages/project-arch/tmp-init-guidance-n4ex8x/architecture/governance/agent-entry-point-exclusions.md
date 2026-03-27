# Agent Entry-Point Exclusions

This document defines what the canonical agent entry-point milestone intentionally excludes from the default scaffold and what later compatibility hooks may exist without replacing that scaffold.

## Purpose

- keep milestone 6 constrained to canonical first-party agent entry points
- make excluded surfaces explicit so later work does not reopen the default scaffold by accident
- define compatibility hooks without promoting them into the default model

## Explicit Exclusions

The following surfaces are intentionally excluded from the milestone 6 default scaffold:

- `.agent/instructions.md`
- `.agent/workflows/`
- workflow files or workflow directories for agent automation
- alternate or duplicate instruction systems that compete with canonical first-party surfaces
- compatibility-only mirrors that are not part of the ratified first-party inventory

## Exclusion Rule

Excluded surfaces must not be described as part of the default `pa init` output for canonical agent entry points.

## Compatibility Hook Model

Later milestones may add explicit compatibility hooks for excluded surfaces, but only under these conditions:

- the canonical first-party scaffold remains the primary instruction system
- compatibility generation is clearly labeled as optional or add-on behavior
- compatibility content mirrors or adapts canonical first-party instructions rather than inventing competing policy
- compatibility hooks do not collapse milestone 6 into workflow generation or editor-specific automation

## Workflow Deferral Rule

- workflow scaffolding remains a later milestone
- compatibility workflow surfaces such as `.agent/workflows/` must not enter the default scaffold through milestone 6
- later workflow work must build on the canonical entry-point scaffold rather than replacing it

## Future Add-On Direction

Potential later add-on paths may include:

- explicit compatibility generation flags or add-on commands
- compatibility mirrors of canonical instruction files
- optional workflow-surface generation after context support and canonical entry points are already in place

These are hooks for later work, not part of the current milestone output.

## Reuse Contract

Later milestone work should treat this document as the source of truth for what milestone 6 intentionally excludes and how later compatibility support may hook into the canonical scaffold without replacing it.
