# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MissTitanK3/project-arch-system/releases/tag/v1.0.0
[1.3.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.1.0...v1.3.0
