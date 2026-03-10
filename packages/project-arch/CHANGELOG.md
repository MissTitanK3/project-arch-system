# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Extended test timeouts for scale regression tests (60_000ms for heavy setup operations)

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
[1.3.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.1.0...v1.3.0
[1.1.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MissTitanK3/project-arch-system/releases/tag/v1.0.0
