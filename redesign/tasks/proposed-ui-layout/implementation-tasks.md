# Proposed UI Layout - Implementation Tasks

This backlog translates the "Proposed UI Layout" section into implementation work, grouped by domain.

## Scope Boundary

- [x] Execute all redesign tasks in `testProject` first.
- [x] Limit active implementation to `testProject/apps/arch` and supporting `testProject` files.
- [x] Defer CLI/template propagation work until after `testProject` completion.
- [ ] Add a post-completion sync checklist for `packages/create-project-arch/templates/arch-ui`.

## Frontend UX / UI Engineering

- [x] Build a persistent app shell with `LeftSidebar`, `MainWorkspace`, `RightInspector`, and `TopBar` regions.
- [x] Implement responsive behavior for desktop, tablet, and mobile breakpoints.
- [x] Add resizable/collapsible panels for left and right sidebars.
- [x] Add keyboard shortcuts for panel focus, toggle, and reset layout.
- [x] Implement Views Toggle in the left sidebar:
  - [x] Architecture Map
  - [x] Decisions (ADRs)
  - [x] Tasks / Roadmap
  - [x] Repository Docs
- [x] Build Tree Explorer component with lazy expansion and type icons.
- [x] Add filter controls for node types (Domain, Module, Task, Decision).
- [x] Add filter controls for status (including "Hide Completed Tasks").
- [x] Add filter controls for edge types (Dependency, Data Flow, Blocking).
- [x] Add global `Cmd/Ctrl + K` command palette UI with grouped results.
- [x] Add topbar breadcrumbs synchronized with selected graph/tree context.
- [x] Implement split-pane mode in main workspace (Graph + Document).
- [x] Implement inspector tabs for Task, Decision, and Module/File detail rendering.

## Graph Experience / Visualization

- [ ] Extend graph node renderers for hierarchical entities (Phase, Milestone, Task nesting).
- [ ] Add nested subflow interactions (expand/collapse and focus into group).
- [x] Tune minimap, zoom controls, and fit-to-view defaults for large graphs.
- [x] Add graph selection synchronization with sidebar tree and inspector.
- [x] Add loading/empty/error states for graph and inspector surfaces.

## Backend APIs / Data Contracts

- [ ] Define a normalized view model for UI shell state (`currentView`, `selection`, `filters`, `breadcrumbs`).
- [ ] Extend API routes to return tree data by hierarchy (Domains -> Sub-domains -> Modules).
- [ ] Add API support for status and edge-type filtering.
- [x] Add API endpoint for command palette search across tasks, decisions, domains, modules.
- [ ] Add API endpoint for breadcrumbs context resolution by selected entity.
- [ ] Add API payload for split-pane document metadata and markdown source.

## Architecture & State Management

- [x] Introduce central client state store for workspace context and filters.
- [ ] Define canonical entity IDs and mapping between graph nodes and domain objects.
- [ ] Add URL state persistence for selected view, filters, and focused entity.
- [x] Add local storage persistence for panel widths and split-pane preference.
- [ ] Add telemetry hooks for navigation and search interactions.

## Performance & Reliability

- [ ] Add virtualized rendering in tree explorer for large repository hierarchies.
- [ ] Add memoization/selectors to prevent unnecessary graph re-renders.
- [x] Implement debounced command palette querying and result caching.
- [ ] Add request cancellation for rapidly changing filter/search input.
- [x] Add error boundaries for graph canvas and inspector component trees.

## Accessibility & Interaction Quality

- [ ] Ensure keyboard-only navigation across sidebar tree, graph focus, inspector, and topbar.
- [ ] Add ARIA roles/labels for tree explorer, toggles, command palette, and tabs.
- [ ] Ensure focus management when opening/closing side panels and split panes.
- [ ] Validate color contrast and non-color status indicators for filters and node states.

## QA / Testing

- [ ] Add unit tests for shell layout reducers/selectors and filter logic.
- [ ] Add component tests for sidebar toggles, tree explorer interactions, and inspector rendering.
- [ ] Add integration tests for selection sync (tree <-> graph <-> inspector).
- [ ] Add E2E tests for:
  - [ ] Command palette open/search/navigate
  - [ ] Split-pane document workflow
  - [ ] Breadcrumb navigation
- [ ] Add regression tests for URL state persistence and restore.

## Documentation & Enablement

- [ ] Document UI information architecture and navigation model.
- [ ] Document keyboard shortcuts and command palette behavior.
- [ ] Add contributor guide for adding new entity types to tree/graph/inspector.
- [ ] Add architecture decision note for chosen state management approach.

## Delivery / Rollout

- [ ] Define milestone plan for shell, explorer, inspector, and topbar rollout.
- [ ] Ship feature flags for split-pane mode and command palette.
- [ ] Run internal dogfooding with representative repositories.
- [ ] Track adoption metrics and triage UX findings after launch.
