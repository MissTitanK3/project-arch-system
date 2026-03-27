# CLI Context Surface Relationships

This document defines how the future CLI context surface relates to `pa next` and broader reporting surfaces without collapsing them into one ambiguous command.

## Purpose

- distinguish machine-readable context resolution from recommendation surfaces
- distinguish machine-readable context resolution from broad reporting surfaces
- keep later workflow and agent milestones from depending on the wrong command

## `pa context` Versus `pa next`

`pa context --json` and `pa next` should complement each other, not replace each other.

- `pa context --json` answers: what is the current resolved execution context?
- `pa next` answers: what should happen next?
- `pa context --json` is the machine-readable source for current active context
- `pa next` is a recommendation surface and may optionally include suggested next actions or tasks

`pa next` may use context internally, but it does not own the canonical machine-readable context contract.

## `pa context` Versus Reporting Surfaces

`pa context --json` should stay narrow and should not become a generic reporting command.

- context resolution provides the minimum structured data needed to locate active work safely
- reporting surfaces summarize state, coverage, drift, validation, or diagnostic information across a broader scope
- reporting commands may expose context-related information, but they should not replace the canonical context surface for downstream automation

## Responsibility Split

- context owns active machine-readable execution context
- `pa next` owns recommendation and next-step guidance
- reporting surfaces own broader status, diagnostics, coverage, and analysis outputs

If a future surface needs active phase, milestone, or task resolution, it should consume the context contract rather than redefine it.

## Complement Rules

- recommendation and reporting commands may read from the context surface
- workflow scaffolding should consume the context surface for current state and may consume `pa next` separately for suggested follow-up work
- reporting commands may include links back to current context, but should not force downstream tools to parse reporting output for context resolution

## Anti-Collapse Rules

- do not treat `pa context` as a vague replacement for `pa next`
- do not treat `pa next` as the canonical active-context source
- do not turn `pa context` into a broad reporting endpoint
- do not require workflows or agent integrations to infer command ownership from prose or overlapping outputs

## Downstream Selection Rule

Later workflow and agent milestones should choose CLI surfaces by responsibility:

- use `pa context --json` when current active context must be resolved safely
- use `pa next` when the goal is to recommend or select follow-up work
- use reporting surfaces when the goal is to summarize repository state, validation, drift, or diagnostics

## Reuse Contract

Later milestone work should treat this document as the source of truth for how context resolution, recommendation surfaces, and reporting surfaces work together without overlapping ownership.
