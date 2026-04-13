# Workflow File Inventory

This document defines the exact first-pass generated workflow file inventory for the supported workflow-generation surface.

## Purpose

- map the ratified workflow set into concrete files on disk
- give later workflow-file generation one explicit inventory to materialize
- prevent filename and directory drift during first-pass implementation

## Supported Surface

All first-pass generated workflow files live under the supported workflow-document surface:

- `.github/workflows/`

## First-Pass File Inventory

| Workflow        | File                                 | Purpose                                                                                               |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `before-coding` | `.github/workflows/before-coding.md` | Prepare an agent to start coding against the correct task and repository context.                     |
| `after-coding`  | `.github/workflows/after-coding.md`  | Run the immediate post-edit validation and governance loop.                                           |
| `complete-task` | `.github/workflows/complete-task.md` | Close out an active task with the required validation and documentation steps.                        |
| `new-module`    | `.github/workflows/new-module.md`    | Guide structural additions such as new modules, packages, or app areas through repository governance. |
| `diagnose`      | `.github/workflows/diagnose.md`      | Provide a repeatable debugging, drift-analysis, and structural-health workflow.                       |

## File Model Decision

- first pass uses one file per workflow
- the first pass does not introduce shared helper workflow files or generated subdirectories beyond the supported surface
- filenames should stay aligned to the ratified workflow names so the inventory remains easy to reason about

## Out-Of-Scope Workflow Files

The first pass does not generate:

- additional supporting workflow files for speculative future workflow families
- alternate copies of the same workflow on multiple workflow surfaces
- repository-specific workflow files beyond the ratified first-pass inventory

## Inventory Rationale

- one file per workflow keeps the first implementation pass explicit and easy to verify
- the inventory maps directly to the ratified first-pass workflow set from milestone 7
- the inventory stays small enough that later content-model work can remain coherent

## Reuse Contract

Later milestone 9 work should treat this document as the source of truth for which workflow files are generated in the first implementation pass and where those files belong.
