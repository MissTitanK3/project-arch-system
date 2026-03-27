# CLI Context Contract

This document defines the purpose and boundary of the CLI context-resolution surface needed before workflow scaffolding can rely on stable structured context.

## Purpose

- provide one stable command surface for resolving active repository work context
- replace placeholder-driven workflow assumptions with structured context lookup
- give later workflows, prompts, and agent integrations a reusable context primitive

## Core Problem

Workflow proposals that rely on placeholders such as `<phase>`, `<milestone>`, and `<task>` force agents to guess current context. That is brittle and makes workflow scaffolding hard to automate safely.

## Command Intent

A command such as `pa context --json` should exist to answer the question: what is the current actionable project context that downstream automation can safely use without guessing?

## Boundary

The context command is for context resolution, not for workflow execution, broad reporting, or recommendation-only output.

It should:

- resolve active or recommended context in a structured way
- expose enough state for downstream automation to stop guessing placeholders
- remain stable enough that multiple consumers can depend on it

It should not:

- replace workflow files
- replace recommendation commands such as `pa next`
- become a catch-all reporting surface
- require downstream tools to parse human-oriented output for context

## Why This Matters

Later workflow scaffolding should depend on stable CLI primitives rather than on instructions that still contain unresolved placeholders. This contract exists so context lookup can be implemented once and consumed consistently later.

## Reuse Contract

Later milestone work should use this document as the source of truth for why a dedicated context-resolution surface exists and what responsibility boundary it must preserve.
