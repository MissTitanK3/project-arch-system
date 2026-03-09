---
id: "project:20260308:adopt-typed-service-contracts"
title: "Adopt Typed Service Contracts"
slug: "adopt-typed-service-contracts"
status: "accepted"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
relatedTasks:
  - "phase-1/milestone-1-setup/005"
relatedDocs:
  - "architecture/architecture/example-system.md"
supersedes: []
---

## Adopt Typed Service Contracts

## Context

Service integration points were drifting across modules due to implicit payload assumptions.

## Decision

All cross-module service boundaries must use explicit shared types in `packages/types` with runtime validation in API adapters.

## Rationale

Typed contracts reduce integration regressions, improve agent traceability, and make architectural intent machine-verifiable.

## Alternatives Considered

- Keep implicit JSON contracts and rely on integration tests only.
- Use per-module ad hoc type aliases without shared contracts.

## Affected Artifacts

- `packages/types/src/`
- `packages/api/src/`
- `architecture/architecture/example-system.md`

## Implementation Status Checklist

- [x] Task links added
- [x] Code targets updated
- [x] Public docs updated
- [x] Validation checks pass
