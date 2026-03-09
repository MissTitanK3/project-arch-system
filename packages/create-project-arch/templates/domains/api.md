# API Domain

<!-- Guidance: Service boundaries, data access, and system integration behavior. -->

## Responsibilities

- Define service interfaces and orchestration policies.
- Own data access boundaries and integration adapters.

## Primary Data Ownership

- Persistence models and storage interfaces
- Service-level request/response contracts

## Interface Contracts

- API functions consumed by apps
- Data-access contracts consumed by orchestration logic

## Non-Goals

- Rendering UI components
- Owning cross-cutting presentation concerns

## Milestone Mapping

- milestone-1-foundation: establish service boundaries and data model assumptions
- milestone-2-build: implement core API adapters and persistence flows

## Implementation Surfaces

- `packages/api`
- `packages/database`
