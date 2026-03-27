# CLI Context Consumption

This document defines how downstream workflows, prompts, and agent integrations should consume the future CLI context surface once it exists.

## Purpose

- give all downstream consumers one shared context-consumption model
- prevent each workflow or prompt from re-implementing context lookup differently
- replace unresolved placeholders with stable structured consumption rules

## Core Rule

Downstream consumers should resolve repository context from `pa context --json` rather than from unresolved placeholders, ad hoc path scanning, or duplicated context-resolution logic.

## Workflow Consumption

- workflow templates should read active phase, milestone, and task values from the structured context payload
- workflow templates should treat payload fields as data inputs, not as prose to be reparsed
- workflow scaffolding should substitute concrete values from the payload instead of carrying `<phase>`, `<milestone>`, or `<task>` placeholders as the primary mechanism
- workflow files should not implement their own fallback repository scans when the context surface is available

## Prompt And Agent Consumption

- prompts and agent integrations should consume the same structured context contract used by workflows
- agents should prefer resolved context fields over inferring current work from narrative instructions alone
- vendor-specific entry points should not create parallel context-resolution rules that drift from the canonical CLI surface

## Partial Or Absent Context

Consumers should fail safely when context is partial or absent.

- if required active context is missing, consumers should stop and surface that context resolution is incomplete
- consumers may degrade optional features when `recommended` context is absent
- consumers should not silently invent phase, milestone, or task identifiers to fill gaps
- if context is missing, the fix belongs in the context surface or project state, not in duplicated downstream guesswork

## Recommended Context Handling

- `active` context determines the current execution target
- `recommended` context may inform next-step suggestions, prefetching, or workflow preparation
- downstream consumers must not promote `recommended` context into active execution state unless another command explicitly does so

## Anti-Duplication Rules

- workflows, prompts, and agents should share one context-resolution surface
- downstream consumers should not parse human-oriented output from other commands to reconstruct context
- downstream consumers should not add alternate repository-walking heuristics as their primary path
- any new context needs should be added to the canonical payload contract instead of patched independently into each consumer

## Downstream Constraints

- later workflow milestones should assume a structured context input, not unresolved placeholders
- later agent entry-point milestones should describe how agent tooling reads the canonical context surface rather than redefining it
- later reporting or recommendation commands may complement the context surface, but should not replace it for machine-readable active context

## Reuse Contract

Later milestone work should treat this document as the source of truth for how downstream automation consumes structured repository context without reintroducing placeholder-driven or duplicated context-resolution behavior.
