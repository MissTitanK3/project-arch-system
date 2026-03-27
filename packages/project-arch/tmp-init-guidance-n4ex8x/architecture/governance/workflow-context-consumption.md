# Workflow Context Consumption

This document defines the workflow-specific rules for consuming CLI context once workflow scaffolding exists.

## Purpose

- bind workflow scaffolding to the canonical CLI context contract rather than to ad hoc workflow-local assumptions
- replace placeholder-driven workflow design with stable structured context usage
- make failure behavior explicit when workflow helpers do not have enough context to run safely

## Core Rule

Workflow helpers should resolve current repository context from `pa context --json` or the canonical context contract derived from it. Workflow files should not treat unresolved placeholders as their primary context mechanism.

## Allowed Context Assumptions

- workflows may assume the canonical context payload provides active phase, milestone, and task fields
- workflows may use optional recommended context only for suggestion or preparation behavior
- workflows may rely on canonical payload versioning and field stability rules defined by the earlier context-support milestone

## Disallowed Context Assumptions

- workflows must not assume unresolved placeholders such as `<phase>`, `<milestone>`, or `<task>` will be filled in elsewhere
- workflows must not parse narrative instructions or human-oriented command output to reconstruct current context
- workflows must not invent fallback repository-walking heuristics as their primary context-resolution path
- workflows must not promote optional recommended context into active execution context on their own

## Required Workflow Behavior

- workflow templates should read context values as structured inputs
- workflow helpers should substitute concrete payload values instead of carrying placeholder tokens forward
- workflow logic should remain aligned with the canonical CLI context payload and should not redefine field meanings locally

## Partial Or Missing Context

If required active context is missing, workflows should stop and surface that context resolution is incomplete.

- fail safely rather than guessing
- point back to the canonical context surface or project state as the source of the fix
- allow optional behavior to degrade when only recommended context is missing

## Alignment With Earlier Context Milestone

Workflow scaffolding is downstream of the earlier CLI context-support milestone.

- the context contract defines why the context surface exists
- the payload model defines what minimum structured fields workflows can rely on
- the broader CLI context consumption guide defines shared rules across workflows, prompts, and agents
- this workflow-specific guide narrows those rules to what workflow helpers must do in practice

## Anti-Duplication Rule

If a workflow needs additional context, the payload contract should be extended centrally rather than patched into workflow files as one-off logic.

## Reuse Contract

Later milestone 7 work should treat this document as the source of truth for how workflow files consume canonical CLI context without reintroducing placeholder-driven or duplicated context-resolution behavior.
