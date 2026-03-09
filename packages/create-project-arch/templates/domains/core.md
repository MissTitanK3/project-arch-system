# Core Domain

<!-- Guidance: Shared domain model, policies, and cross-cutting foundations. -->

## Responsibilities

- Define shared domain concepts and invariants.
- Own cross-cutting configuration and type contracts.

## Primary Data Ownership

- Canonical shared types
- Environment and runtime configuration schema

## Interface Contracts

- Shared type exports consumed by UI/API domains
- Configuration contracts used across packages

## Non-Goals

- Rendering user interface components
- Implementing transport-specific API adapters

## Milestone Mapping

- milestone-1-foundation: establish canonical types/config and boundaries
- milestone-2-build: stabilize contracts used by runtime features

## Implementation Surfaces

- `packages/types`
- `packages/config`
