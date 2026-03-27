# Taxonomy Migration Guide

This guide explains how an existing repository can move toward the canonical `architecture/` taxonomy without an all-at-once reorganization.

## Purpose

- give older repositories a partial-adoption path
- define how to normalize by document role instead of by historical folder name
- preserve meaning and authority while legacy paths are still present

## Core Principles

- Do not require a flag day migration.
- Normalize by document role, not by the old directory name alone.
- Preserve meaning before structure: fix authority and cross-references as you move files.
- Legacy directories may remain during transition, but they should become lower-authority context.
- Partial adoption is acceptable if the active taxonomy is documented in `architecture/README.md`.

## Legacy To Canonical Mapping

| Legacy location | Canonical family | Guidance |
| --------------- | ---------------- | -------- |
| `architecture/foundation/prompt.md` | `architecture/product-framing/` | Keep the setup prompt as framing context, then update dependent docs to reference the new path. |
| `architecture/foundation/project-overview.md`, `goals.md`, `user-journey.md`, `scope.md` | `architecture/product-framing/` | Move product meaning, scope, and risk framing into the active framing family. |
| `architecture/legacy-architecture/system-boundaries.md` | `architecture/systems/` | System behavior and ownership boundaries belong with major system definitions. |
| `architecture/legacy-architecture/module-model.md` | `architecture/governance/` | Module responsibilities and dependency rules are governance artifacts for repository structure. |
| `architecture/legacy-architecture/runtime-architecture.md` | `architecture/runtime/` | Runtime topology and critical path docs belong in the runtime family. |
| `architecture/reference/*` | `architecture/reference/` or canonical families as needed | Keep examples and notes as supporting context; move only authoritative content into canonical families. |
| flat `architecture/*.md` layouts | canonical families by role | Sort each document by what it defines, not by its legacy file name. |

## Partial Adoption Patterns

### Flat architecture/ directory

1. Keep `architecture/README.md` as the entrypoint.
2. Introduce `product-framing/`, `systems/`, `data/`, `runtime/`, and `governance/` as needed.
3. Move the most authoritative docs first.
4. Leave a short note in the legacy location if links still depend on it.

### Partially organized repository

1. Keep useful existing groupings that already match canonical roles.
2. Rename or re-home only the groups that create authority ambiguity.
3. Update `architecture/README.md` to record which canonical families are active and which legacy locations remain transitional.

### Minimal adoption repository

1. Adopt only the families that carry active authoritative content.
2. Keep unused canonical families absent or empty rather than inventing alternative top-level structures.
3. Add families later when documents clearly belong there.

## Suggested Normalization Sequence

1. Update `architecture/README.md` so the canonical taxonomy and any remaining legacy paths are explicit.
2. Move product intent documents into `architecture/product-framing/`.
3. Move active architecture behavior docs into `systems/`, `data/`, `runtime/`, and `governance/` by role.
4. Move templates into `architecture/templates/` if first-party templates exist.
5. Leave `reference/` as supporting context unless a document is actually authoritative.
6. Update task docs, agent docs, and cross-references after each move so links and authority stay consistent.

## Normalization Rules

- Prefer moving a document to the canonical family over renaming the canonical family to match the old structure.
- If one legacy document mixes multiple roles, split it only when the split improves clarity; otherwise move it to the dominant role and note the remaining mixed content.
- Avoid duplicating the same authoritative rule in both a legacy file and a canonical file.
- When a legacy file must remain for compatibility, add a note pointing to the canonical location.
- Update agent-facing read order and repository indexes as soon as canonical files become authoritative.

## Completion Signal

Migration is sufficiently normalized when canonical families hold the active authoritative documents, legacy paths are clearly transitional, and contributors can navigate the repository without relying on the old flat layout.
