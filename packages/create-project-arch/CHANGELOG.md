# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-03-12

### Added

- Scaffolded projects now receive 8 bootstrap architecture tasks on `pa init` (previously 5)
- New bootstrap tasks 006 `define-system-boundaries`, 007 `define-module-model`, and 008 `define-runtime-architecture` included in generated milestone
- Bootstrap tasks 006–008 carry `discover` and `greenfield` tags for dual-mode authoring guidance
- `pa milestone status` command available in all scaffolded projects for dependency-aware task blocking visibility

### Changed

- Updated templates to use `project-arch@1.5.0`
- Bootstrap task 005 slug updated to `finalize-architecture-foundation` in all scaffolded projects
- task 005 in generated projects now declares `dependsOn` on tasks 001–004 and 006–008, enforcing correct completion order

---

## [1.4.0] - 2026-03-10

### Added

- Feedback system integration in scaffolded projects (`.arch/feedback/` structure auto-created)
- Enhanced validation-hook scaffolds with feedback collection support
- Feedback system documentation in generated architecture governance section

### Changed

- Updated templates to include latest `project-arch@1.4.0` features
- Template validation now includes feedback CLI command testing
- Improved scaffolding documentation to cover feedback workflow

## [1.3.0] - 2026-03-08

### Added

- Foundation, domain, architecture spec, concept-map, decision record, and gap-closure scaffolds.
- Local validation hook scaffold (`scripts/validate.sh` and `.githooks/pre-commit`).

### Changed

- Validation-hook copy behavior now merges directories and preserves existing files while adding missing template files.
- Template scaffolding flow expanded to include architecture governance docs by default.

## [1.1.0] - 2026-03-07

### Added

- Comprehensive test coverage for scaffolding operations
- Sandbox development workflow for template iteration
- `sandbox:init`, `sandbox:dev`, and `sandbox:sync` scripts for template development
- Enhanced template documentation

### Changed

- Improved template structure for `arch-ui` and `ui-package`
- Better error handling during scaffolding process
- Enhanced CLI options documentation

### Fixed

- Template file copying edge cases
- Directory creation validation

## [1.0.0] - 2026-02-15

### Added

- Initial public release
- Interactive scaffolding CLI
- `arch-ui` template (Next.js with Architecture UI)
- `ui-package` template (React component library)
- Integration with `create-turbo` for monorepo setup
- Automatic `project-arch` initialization
- Package manager detection and support (pnpm, npm, yarn)
- Template customization options
- Force mode for non-empty directories

[1.4.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.1.0...v1.3.0
[1.1.0]: https://github.com/MissTitanK3/project-arch-system/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MissTitanK3/project-arch-system/releases/tag/v1.0.0
