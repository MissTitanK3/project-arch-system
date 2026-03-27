# Workflow Init-Tier Placement

This document defines where workflow scaffolding belongs in the init tier model and how it should be adopted.

## Placement Decision

Workflow scaffolding belongs in Tier D as optional add-on behavior.

It is not part of the smallest coherent default scaffold and it should not silently enter the default first-party model through later drift.

## Mode Decision

- default `pa init`: does not scaffold workflow files
- `pa init --full`: does not automatically scaffold workflow files just because it is broader
- explicit add-on or later workflow adoption path: may scaffold workflow files once the required preconditions are satisfied

## Why Workflow Scaffolding Is Tier D

- workflow scaffolding is useful but not foundational
- workflow files are environment-sensitive and depend on supported workflow surfaces
- workflow helpers sit downstream of canonical entry points and CLI context support rather than defining the base repository contract
- automatic materialization still requires explicit adoption so workflow behavior does not outrun repository preference or environment support

## Preconditions For Materialization

Workflow scaffolding should only be materialized after:

- the canonical first-party agent entry-point model is in place
- the CLI context contract and minimum payload are defined
- the workflow-specific context consumption rules are settled
- the target workflow surface or compatibility hook is explicitly supported

## Relationship To `--full`

`--full` is the broadest first-party scaffold mode, but it is not permission to create every optional surface.

Workflow scaffolding remains outside automatic `--full` materialization unless a later milestone proves that:

- the target workflow surface is first-party supported
- the workflow files can be generated non-interactively
- the result remains project-agnostic
- the result does not compete with canonical entry points

Until then, workflow scaffolding should remain an explicit adoption path rather than a broadened default.

## Relationship To Canonical Entry Points

- canonical entry points remain Tier A foundational surfaces
- workflow files remain subordinate helper surfaces
- workflow adoption must not redefine or replace the entry-point model

## Anti-Drift Rule

Later workflow work must not move workflow scaffolding into default init or implicit `--full` behavior without reopening the tier-model decision with evidence that the add-on constraints no longer apply.

## Reuse Contract

Later milestone 7 work should treat this document as the source of truth for workflow optionality and tier placement, so workflow generation does not reopen default-versus-add-on decisions.
