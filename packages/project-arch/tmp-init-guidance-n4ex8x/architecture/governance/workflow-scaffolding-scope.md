# Workflow Scaffolding Scope

This document defines the role of workflow scaffolding as a downstream helper layer that depends on canonical agent entry points and stable CLI context support.

## Purpose

- define workflow scaffolding as a second-phase helper capability
- keep workflow files subordinate to canonical first-party instruction surfaces
- prevent workflow helpers from becoming a second primary instruction system

## Scope

Workflow scaffolding exists to package recurring `pa` command patterns into discoverable helper flows for supported environments after the canonical instruction model and context primitives are already stable.

Workflow scaffolding is not a foundational instruction surface.

## Relationship To Canonical Entry Points

- canonical agent entry points remain the primary instruction system
- workflow helpers must sit on top of that instruction system rather than replace it
- workflow files must remain subordinate to canonical first-party agent surfaces such as `AGENTS.md`

## Relationship To CLI Context Support

- workflow scaffolding should only be introduced once stable context resolution is defined
- workflows should depend on `pa context --json` or its canonical context contract rather than unresolved placeholders
- workflow helpers should consume context primitives, not reinvent them

## What Workflow Scaffolding Solves

- helps agents reliably trigger recurring `pa` command sequences
- reduces missed project-governance steps during coding work
- packages command usage into discoverable helper patterns for supported environments

## What Workflow Scaffolding Must Not Do

- replace canonical agent entry points
- become a second primary repository instruction system
- depend on unresolved placeholders such as `<phase>`, `<milestone>`, or `<task>`
- bypass the canonical context and governance model already defined by earlier milestones

## Activation Rule

Workflow scaffolding becomes valid to add only after:

- the canonical agent-surface strategy is settled
- the canonical entry-point model is defined
- the CLI context contract and payload model are defined

## Reuse Contract

Later milestone 7 work should treat this document as the source of truth for why workflow scaffolding is downstream helper behavior rather than foundational agent-surface policy.
