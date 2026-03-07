# High-Impact Features - Implementation Tasks

This backlog translates the "High-Impact Feature List" into implementation work, grouped by domain.

## Scope Boundary

- [ ] Execute all high-impact feature implementation in `testProject` first.
- [ ] Treat `testProject` as the validation environment for UX, API, and data-flow behavior.
- [ ] Defer CLI/template sync until the feature set is stable in `testProject`.
- [ ] Add a post-completion sync checklist for `packages/create-project-arch/templates/arch-ui`.

## Frontend UX / UI Engineering

- [ ] Add a feature switcher panel to enable/disable advanced graph modes per user/session.
- [ ] Build Focus Mode controls (upstream, downstream, depth, edge type).
- [ ] Build timeline controls for Time-Travel view (phase/milestone/date checkpoints).
- [ ] Add docs-to-graph interaction affordances inside markdown viewer.
- [ ] Add graph-to-doc "Related Docs" panel in inspector or doc panel.
- [ ] Add layout mode selector (Dagre, Cola, Force) with saved preference.
- [ ] Add clustering mode selector (By Domain, By Phase, By Team).
- [ ] Add health badges and color legends directly in graph nodes and minimap.
- [ ] Add context menu actions on right-click for task/module/decision nodes.
- [ ] Add keyboard and touch alternatives for right-click actions.

## Graph Engine / Visualization Logic

- [ ] Implement dependency traversal algorithms for Focus Mode highlighting.
- [ ] Implement node/edge dimming strategy for non-relevant graph elements.
- [ ] Add deterministic graph snapshot generation for each roadmap checkpoint.
- [ ] Add diff overlay mode to compare "Now" vs selected future checkpoint.
- [ ] Integrate multiple layout engines with shared graph adapter interface.
- [ ] Implement clustering transforms independent from base graph data.
- [ ] Add node badge overlays and severity indicators from health signals.
- [ ] Implement contextual action hooks from node selection and context menus.

## Backend APIs / Data Contracts

- [ ] Add API support for traced dependency subgraphs (upstream/downstream + depth).
- [ ] Add API endpoint for roadmap snapshots by phase/milestone.
- [ ] Add API contract for architecture diff payloads between snapshots.
- [ ] Add cross-reference index for markdown wiki links to architecture entities.
- [ ] Add API endpoint returning related docs per entity ID.
- [ ] Add health metrics endpoint combining static checks and roadmap metadata.
- [ ] Add action endpoint mapping (open markdown, resolve file path, IDE deep-link metadata).

## Data Pipeline / Integrations

- [ ] Extend markdown parsing pipeline to resolve `[[EntityRef]]` syntax.
- [ ] Add indexer job to map docs references to canonical domain/module/task/decision IDs.
- [ ] Add repository signal collectors for health metrics (tests, complexity, freshness, due dates).
- [ ] Define adapter for opening file references in local IDE-compatible URIs or repo paths.
- [ ] Add background refresh strategy for graph snapshots and health indicators.

## Architecture & State Management

- [ ] Add global store slices for Focus Mode state, timeline state, and layout/clustering preferences.
- [ ] Define immutable snapshot model for time-travel and diff rendering.
- [ ] Add cache invalidation rules when architecture/task/decision sources change.
- [ ] Add conflict strategy when filters, focus, and clustering are applied simultaneously.

## Performance & Reliability

- [ ] Benchmark traversal and diff operations on large graph datasets.
- [ ] Add worker/off-main-thread processing for heavy layout algorithms.
- [ ] Add progressive rendering for timeline snapshot transitions.
- [ ] Add guardrails for large docs cross-reference maps (memory and query latency).
- [ ] Add fallback strategies when layout engine fails or times out.

## Security & Permissions

- [ ] Validate and sanitize all external/actionable node operations.
- [ ] Restrict file-open actions to repository boundaries.
- [ ] Gate editor/deeplink actions behind explicit user intent.
- [ ] Audit markdown link resolution to prevent path traversal and injection issues.

## Accessibility & Interaction Quality

- [ ] Ensure Focus Mode and timeline controls are fully keyboard accessible.
- [ ] Add non-color cues for highlighted, dimmed, warning, and overdue states.
- [ ] Announce graph mode changes via screen-reader-friendly live regions.
- [ ] Provide accessible alternatives for context-menu actions.

## QA / Testing

- [ ] Add unit tests for dependency traversal, snapshot diffing, and clustering transforms.
- [ ] Add contract tests for new trace, snapshot, diff, docs-link, and health APIs.
- [ ] Add integration tests for:
  - [ ] Docs click -> graph highlight
  - [ ] Graph click -> related docs
  - [ ] Context menu action dispatch
- [ ] Add E2E tests for Focus Mode and timeline workflows.
- [ ] Add performance tests for large repositories and deep dependency graphs.

## Documentation & Enablement

- [ ] Document Focus Mode behavior and dependency traversal semantics.
- [ ] Document time-travel model and snapshot consistency guarantees.
- [ ] Document supported markdown reference syntax and linking rules.
- [ ] Document layout/clustering strategy selection guidance.
- [ ] Document health metric definitions, thresholds, and data sources.

## Delivery / Rollout

- [ ] Roll out features behind independent flags (focus, timeline, docs integration, health, actions).
- [ ] Define phased release order based on technical dependency:
  - [ ] Focus Mode
  - [ ] Layout/Clustering
  - [ ] Docs Integration
  - [ ] Health Indicators
  - [ ] Time-Travel
  - [ ] Actionable Nodes
- [ ] Run beta evaluation with target personas (IC developer, architect, engineering manager).
- [ ] Measure impact using task completion time and architecture comprehension metrics.
