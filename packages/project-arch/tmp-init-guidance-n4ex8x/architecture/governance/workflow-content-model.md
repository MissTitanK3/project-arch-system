# Workflow Content Model

This document defines the shared structure and authority model that generated workflow files must follow.

## Purpose

- give all generated workflow files one reusable content structure
- keep workflow files subordinate to canonical entry points and the canonical CLI context contract
- make missing-context and unsupported-path behavior explicit in generated workflow content

## Required Content Blocks

Each generated workflow file should include, in order:

1. workflow title and purpose
2. when to use the workflow
3. required context inputs
4. canonical command sequence
5. validation or follow-up expectations
6. fail-safe behavior when context or support is missing
7. authority reminder pointing back to canonical entry points

## Authority Model

- generated workflow files are helper artifacts, not primary instruction surfaces
- `AGENTS.md` remains the canonical always-on instruction source
- generated workflow files must point back to canonical entry points when repository-wide instruction questions arise
- workflow files must not restate repository policy in a way that can drift from `AGENTS.md`

## Context Consumption Rule

- generated workflow files should instruct consumers to resolve context through `pa context --json` or the canonical context contract
- generated workflow files should treat active phase, milestone, and task fields as structured inputs
- generated workflow files must not rely on unresolved placeholders such as `<phase>`, `<milestone>`, or `<task>` as their primary mechanism

## Canonical Command Block

Generated workflow files should include a command-oriented section that:

- names the expected `pa` commands in the order they should be considered
- keeps commands repository-governed rather than inventing tool-local substitutes
- stays aligned with the ratified workflow purpose and file inventory

## Fail-Safe Behavior

Generated workflow files should explicitly say what to do when prerequisites are missing.

- if required active context is missing, stop and surface the missing context
- if the workflow target surface is unsupported, do not invent an alternate path silently
- if workflow guidance conflicts with canonical entry points, `AGENTS.md` and other canonical entry points win

## Optional Adaptation Block

Generated workflow files may include a short adaptation note for the target surface, but that note must stay subordinate to the shared content model and must not redefine the repository governance model.

## Reuse Contract

Later milestone 9 work should treat this document as the source of truth for the shared generated workflow structure, authority model, and fail-safe behavior.
