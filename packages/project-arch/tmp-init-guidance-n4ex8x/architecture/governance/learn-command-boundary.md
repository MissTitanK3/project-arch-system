# Learn Command Boundary

This document defines the purpose, scope, and first-pass read-only boundary for `pa learn --path`.

## Purpose

- define why `pa learn --path` exists as a distinct command
- keep path-scoped sync analysis separate from broad repository validation
- establish a stable product boundary before detailed report design and CLI implementation begin

## Problem Statement

`pa check` can already identify structural gaps, but its output is repo-wide and diagnostic-first. `pa learn --path` is intended to provide a narrower, path-scoped learning surface that helps a user understand drift, sync gaps, and likely follow-up work for a specific file or directory.

## Core Command Role

`pa learn --path` should be treated as a scoped, read-only analysis command.

- it accepts one or more file or directory paths
- it narrows analysis to the surfaces relevant to those paths
- it explains architectural and traceability gaps in a path-scoped way
- it suggests governed follow-up work without mutating the repository

## Why It Is Distinct

- `pa check` owns broad validation and emits flat diagnostics across the repository
- `pa doctor` owns preflight command orchestration and broad validation flow
- `pa learn --path` should own targeted, path-scoped understanding and sync planning for a specific surface

`pa learn --path` exists so users can investigate one area of the repository without treating every learning step as a full-repo validation pass.

## Path Scope

The first implementation pass should support:

- a specific file path
- a specific directory path
- multiple explicit `--path` inputs when the user wants to compare or group related surfaces

The command should not require a full repository sweep to be conceptually useful, even if it reuses broader repository context internally.

## Read-Only Rule

The first implementation pass for `pa learn --path` must remain read-only.

- it may analyze
- it may classify
- it may report
- it may recommend governed follow-up commands
- it must not modify architecture files, roadmap files, or code automatically

## What It Must Not Do

- do not redefine repository-wide validation ownership away from `pa check`
- do not become a hidden auto-fix or scaffolding command
- do not invent a second recommendation system that replaces `pa next`
- do not require unresolved placeholders or manual guesswork about active repository context

## First-Pass Usage Guidance

Use `pa learn --path` when:

- a user wants to understand the sync status of a specific file or directory
- a user is onboarding a pre-existing surface that was built outside the normal `pa` flow
- a user wants actionable path-scoped follow-up guidance without mutating repository state

Do not use `pa learn --path` when:

- the goal is broad repository validation; use `pa check` or `pa doctor` instead
- the goal is workflow execution or task recommendation; use the owning workflow or recommendation surfaces instead
- the goal is automatic repair; that requires a later, separate decision

## Reuse Contract

Later milestone 10 work should treat this document as the source of truth for why `pa learn --path` exists, what scope it owns, and why it remains read-only in the first implementation pass.
