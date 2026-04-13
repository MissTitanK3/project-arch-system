# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-04-13

### Added

#### **Runtime Profiles And Readiness Diagnostics**

- `pa runtime` command surface for runtime inventory, scan, registration, readiness checks, and profile mutations
- Repository-owned runtime profile config at `.project-arch/runtime.config.json`
- Runtime inventory and readiness contracts for merged adapter/profile state, profile defaults, model selection, adapter options, and actionable diagnostics
- Adapter-backed readiness checks for unavailable runtimes, missing models, invalid adapter options, disabled profiles, and adapter readiness failures
- SDK runtime APIs and command metadata for runtime list, check, link, update, enable, disable, default, and unlink flows

#### **Agent Runtime Lifecycle**

- `pa agent prepare`, `run`, `status`, `validate`, `reconcile`, `audit`, and `orchestrate`
- `pa result import` for importing runtime result bundles into the agent lifecycle
- Runtime-local artifact layout under `.project-arch/agent-runtime/` for contracts, prompts, launches, run records, results, orchestration state, and audit history
- Planner-to-implementer-to-reviewer-to-reconciler orchestration with persisted role state and explicit fallback through result import, validation, and reconciliation
- SDK exports for `agent`, `result`, `contracts`, and `workflows`
- Escalation draft output for reviewable agent reconciliation follow-up decisions

### Changed

- CLI help now documents the shipped runtime and agent MVP surfaces
- `pa init --with-workflows` now writes workflow documents to `.project-arch/workflows/*.workflow.md`
- Fresh scaffolded roadmap artifacts now use schema version `2.0` and project-scoped paths under `roadmap/projects/shared/phases/...`
- Repository validation diagnostics now report schema version `2.0`
- Reconciliation reports now use schema version `2.0` and can carry agent run traceability
- Doctor health checks now validate runtime profile config shape

### Fixed

- Validation and reconciliation now prefer canonical project-scoped roadmap paths while retaining legacy path compatibility where supported
- Workflow guidance now warns when legacy markdown workflow documents remain under `.github/workflows/*.md`

### Compatibility

- Legacy `roadmap/phases/...` paths remain readable where compatibility support exists, but fresh guidance and initialized output use `roadmap/projects/shared/phases/...`
- Legacy markdown workflow guidance under `.github/workflows/*.md` is treated as non-canonical transition context
- The VS Code extension and Preact artifact-browser evaluation are intentionally excluded from this CLI release

### Test Coverage

- Added runtime profile, runtime inventory/readiness, runtime scan, adapter readiness, user adapter, agent runtime lifecycle, orchestration, result import, validation, reconciliation, and SDK coverage
- Release validation passed with 183 test files and 1640 tests

## [2.0.0] - 2026-03-27

### Added

#### **Project-Scoped Roadmap Model**

- Canonical single-roadmap planning model under `roadmap/projects/<project>/phases/...`
- Reserved `shared` project scaffold for bootstrap and cross-cutting work
- Project manifest contract and project overview ownership model
- `pa project new <projectId>` command for scaffolding custom roadmap projects
- Project-aware CLI and SDK planning flows for project-owned phase trees

#### **Validation, Reporting, And Health Alignment**

- Project-scoped roadmap discovery for validation and check collection
- Project-aware diagnostics, remediation guidance, and runtime identity output
- Reporting inventory for planning scopes plus active project metadata
- Structural health checks for project manifests and project-owned phase trees

### Changed

- Canonical roadmap authoring now targets `roadmap/projects/<project>/phases/...`
- Init and generated governance docs now teach the project-scoped roadmap model by default
- Context, report, and check output now surface project identity explicitly
- Example/reference docs now use project-aware commands and canonical project-owned paths

### Fixed

- Removed scaffold-caused PAC coverage warnings from the default initialized sandbox
- Aligned default scaffold targets and bootstrap task surfaces with the initialized repository shape
- Normalized runtime compatibility handling across `hybrid`, `project-scoped-only`, and `legacy-only` repository states

### Docs

- Added release-candidate implementation summary in `feedback/RC-2.0.md`
- Added monorepo roadmap structure guidance and project manifest contract documentation in `feedback/`
- Documented custom project creation and naming as part of init/adoption guidance

### Compatibility

- `hybrid`: supported
- `project-scoped-only`: supported
- `legacy-only`: reduced compatibility only; unsupported for milestone 2 runtime operations

### Notes

- This release reflects a valid `2.0` boundary because the canonical roadmap shape and runtime behavior changed materially.
- The legacy `roadmap/phases/...` surface remains only as a compatibility mirror while hybrid support is still in place.

## [1.7.0] - 2026-03-26

### Added

#### **Canonical Scaffold And Governance Expansion**

- Canonical `architecture/` taxonomy with normalized family structure, authority guidance, repo-model guidance, and migration support
- Formal init tier model with documented Tier A / B / C / D behavior, including default vs full scaffold rules
- Reusable setup-planning governance covering planning tranches, ordering, discovery boundaries, validation placement, and revised setup-template shape
- Canonical agent-surface strategy, agent entry-point inventory, shared entry-point content model, and exclusions guidance
- CLI context governance artifacts and later runtime implementation for `context` across CLI and SDK
- Workflow scaffolding governance, supported workflow surface definition, workflow inventory, workflow content model, and workflow generation rules
- Real workflow materialization under `.github/workflows/` with rendering and regeneration behavior
- `learn` planning artifacts and later runtime implementation for `learn --path` across CLI and SDK

#### **Package Surface Integration**

- Runtime integration of previously dormant SDK surfaces into active flows
- Runtime metadata consumption from `src/sdk/commands.json`
- Expanded docs capability with richer repository document inventory and JSON output
- Expanded reporting capability with structured machine-readable report output
- Internal audit artifacts in `feedback/` for implemented, partial, unused, and deferred package surfaces

### Changed

- `pa init` now produces a much more complete architecture/governance scaffold aligned to the feedback milestone sequence
- `pa init` workflow support is now explicit and add-on driven instead of governance-only
- `pa context --json` is now a real runtime surface rather than a planned contract only
- `pa learn --path` is now a real runtime surface rather than a planned contract only
- `fs` is now private and no longer treated as a public package surface
- Sandbox profile flows retain profile-specific outputs and are easier to review across default/full/tiered runs

### Fixed

- Removed legacy `apps/`, `packages/`, and `scripts/` directory generation from init scaffolding
- Fixed sandbox flag forwarding so workflow/full-profile verification reflects real init flags instead of silently ignoring them
- Normalized generated markdown output to eliminate repeated blank-line runs in scaffolded governance docs
- Restored full green package verification after the scaffold, boundary, and runtime-surface changes

### Docs

- Added and completed feedback milestone documentation from milestone 1 through milestone 12
- Added internal audit outputs and consolidated release-note tracking in `feedback/`
- Added multi-user contribution model exploration in `feedback/pa-multi-user.md`

### Test Coverage

- Expanded init, workflow-generation, context, learn, docs, report, registry, and package-surface integration coverage
- Full package verification is currently green for `test`, `typecheck`, and `lint`

## [1.6.0] - 2026-03-22

### Added

#### **Validation and Health Rails**

- `pa doctor health` command with deterministic health states, optional repair mode, JSON output, and `PAH*` diagnostics catalog
- `pa next` workflow router (CLI + SDK) with deterministic precedence and machine-readable recommendations
- Validation contract artifact flow for phase templates and `pa check` validation, including `PAV*` diagnostics

#### **Agents and Workflow Surface Expansion**

- Agents command surface (`list`, `show`, `new`, `sync`, `check`) across CLI and SDK
- Deterministic skill loader/resolver/registry behavior, including sync support and override handling
- Workflow profiles (`quality`, `balanced`, `budget`) with schema-backed resolution and command-level profile override
- Local release prep utility for pre-push/pre-publish checks and release-check artifact generation

### Changed

- Graph completeness checks now include decision/domain coverage diagnostics, disconnected-node reporting, and threshold-aware scoring
- Module graph generation now classifies runtime/docs/generated/infra layers and reduces noisy inferred edges
- `pa init` now defaults to safe re-init behavior (skip existing managed files) with explicit force-overwrite mode and conflict summaries
- Init scaffolding now includes `.arch/agents-of-arch` templates and derived registry generation
- Publish pipeline now uses build-specific TS config and clean-dist production artifact preparation
- Report/export behavior now excludes sensitive path classes by default, with explicit unsafe opt-in

### Fixed

- Identifier path traversal risks by enforcing safe ID validation at CLI, SDK, and core boundaries
- Filesystem escape risks by applying path-boundary guards to write/delete mutation paths
- Symlink escape surfaces via non-follow traversal defaults and realpath confinement checks
- Terminal/document output safety by sanitizing control characters and hardening markdown/frontmatter emission
- Contract validation regressions by hardening test fixtures that require validation-contract artifacts
- Release payload contamination from compiled test artifacts

### Security

- Defense-in-depth hardening for filesystem mutation paths (safe IDs, root confinement, symlink policy)
- Output and artifact hardening for terminal/report generation and release packaging

### Docs

- Expanded docs/help coverage for security operations, agents skill schema, init/re-init behavior, and release controls

### Test Coverage

- Added targeted unit and integration coverage for health checks, routing, validation contracts, graph completeness, module noise reduction, profiles, sanitization, sensitive output filtering, and release preparation
- Package-level test suites were expanded to cover new safety and release gates

## [1.5.0] - 2026-03-12

### Added

#### **Init Bootstrap Task Expansion (RFC-INIT-002)**

- Three new bootstrap architecture tasks generated during `pa init`:
  - `006-define-system-boundaries.md` — canonical domain ownership and cross-domain interaction constraints
  - `007-define-module-model.md` — human-readable module model complementing `arch-model/modules.json`
  - `008-define-runtime-architecture.md` — deployment topology, critical paths, and runtime constraints
- Tasks 006, 007, and 008 include `discover` and `greenfield` tags to signal dual-mode authoring intent
- Each of tasks 006–008 contains separate **Discover mode** and **Define mode** implementation plan sections
- `dependsOn` support in bootstrap task frontmatter generation — task 005 now declares `dependsOn: [001, 002, 003, 004, 006, 007, 008]`

#### **Milestone Dependency Enforcement**

- `pa milestone status <phaseId> <milestoneId>` — new CLI subcommand listing all tasks with effective status; blocked tasks show unresolved dependency IDs and a remediation hint; exits with code 1 when any blocked tasks exist
- `milestoneStatus()` SDK function wrapping the new core helper in `OperationResult`
- `getMilestoneStatus()` core function in `createMilestone.ts`
- `getMilestoneDependencyStatuses()` shared resolver in new `core/tasks/dependencyStatus.ts` module — computes `unresolvedDependsOn` and `effectiveStatus` for all tasks in a milestone
- `updateTaskStatus` now enforces `dependsOn` gating: marking a task `done` throws when any declared prerequisite task is not yet `done`

### Changed

- Bootstrap task 005 slug renamed from `review-architecture-foundation` to `finalize-architecture-foundation`
- `pa init` now generates 8 bootstrap tasks (previously 5) to fully scaffold architecture fill coverage

### Test Coverage

- 8 new regression tests in `init.test.ts` (`bootstrap task generation (RFC-INIT-002)` describe block) covering task filenames, slugs, tags, and `dependsOn` propagation
- 2 new unit tests in `updateTask.test.ts` covering blocked and unblocked `done`-marking flows
- Extended `milestone.test.ts` with `pa milestone status` blocked-dependency scenario

---

## [1.4.0] - 2026-03-10

### Added

#### **Operator Ergonomics Enhancements**

- JSON structured diagnostics output for `pa check --json` with schema versioning
- `pa lint frontmatter` command for validating task frontmatter before creation
- Warning triage filtering system with `--only`, `--severity`, and `--paths` options
- Comprehensive help system alignment with command discovery (`pa help [topic]`)
- Task `register-surfaces` workflow with `--from-check` integration for remediation
- Check JSON diagnostics schema documentation and version tracking

#### **Feedback System (Complete Implementation)**

- Core feedback types and storage layer with observation JSONL and issue index persistence
- Feedback observation collection with automatic detection and classification
- Feedback issue promotion and lifecycle management with recurrence tracking
- Feedback retention policies and `pa feedback prune` command
- `pa feedback list` and `pa feedback show` commands for issue discovery and inspection
- `pa feedback review` command with terminal and deferred outcome disposal
- `pa feedback export`, `pa feedback rebuild`, and `pa feedback refresh` commands
- Markdown report generation for feedback issues with comprehensive formatting
- Full CLI/SDK integration with feedback collection hooks in command lifecycle
- Comprehensive test coverage for feedback subsystem (40+ tests, 89%+ coverage)

### Changed

- Graph parity writes now include stable output to reduce unnecessary noise
- Improved diagnostics truncation for large warning/path sets (50+ item limit with metadata)
- Enhanced task registration workflow to support untracked surface remediation
- Refactored CLI feedback command structure with hierarchical subcommand organization
- Extended test timeouts for scale regression tests (120_000ms for heavy setup operations)

### Fixed

- Graph sync write stability improved with deterministic output ordering
- Eliminated duplicate edges and task nodes in large-scale diagnostics
- Proper handling of 200+ path code targets in task registration
- Feedback collection no longer generates empty diagnostic entries
- Correct recurrence count tracking in feedback issue promotion

### Test Coverage

- Total Test Files: 94 (all passing)
- Total Tests: 945 (all passing)
- Test Duration: ~35 seconds
- Critical Modules Coverage: >80% (SDK, core, CLI, feedback)

## [1.3.0] - 2026-03-08

### Added

- Policy and governance validation surfaces across CLI/SDK.
- Concept map schema support and validation coverage.
- Additional CLI help topics and reporting/test coverage for milestone/task workflows.

### Changed

- Improved report/check output consistency and schema normalization paths.
- Expanded SDK command registry and index exports coverage.

## [1.1.0] - 2026-03-07

### Added

- Comprehensive test coverage (96.84% statement coverage with 592 tests)
- Task lane system with dedicated ID ranges (planned: 001-099, discovered: 101-199, backlog: 901-999)
- `pa task lanes` command for viewing lane usage and next available IDs
- `pa task discover` command for creating discovered tasks with drift tracking
- `pa task idea` command for creating backlog items
- Enhanced task ID validation with detailed error messages
- `pa help` command with comprehensive documentation
- SDK exports for programmatic usage
- Coverage reporting with vitest

### Changed

- Improved CLI help system with detailed command documentation
- Enhanced error messages for task ID validation
- Refined task creation workflow with lane-specific commands

### Fixed

- Task ID validation now enforces lane-specific ranges
- Improved error handling across all CLI commands

## [1.0.0] - 2026-02-15

### Added

- Initial public release
- Core CLI commands: `init`, `check`, `report`, `task`, `docs`
- Phase and milestone management
- Architecture decision record (ADR) support
- Dependency graph building and visualization
- Task management with markdown frontmatter
- TypeScript SDK for programmatic usage
- Zod-based schema validation
- Integration with monorepo workflows

[1.4.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.3.0...v1.4.0
[2.0.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.7.0...v2.0.0
[1.7.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.4.0...v1.5.0
[1.3.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.1.0...v1.3.0
[1.1.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MissTitanK3/project-arch-system/releases/tag/v1.0.0
