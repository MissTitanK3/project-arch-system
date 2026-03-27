# Agent Entry-Point File List

This document ratifies the canonical default file and directory inventory that future `pa init` agent entry-point scaffolding should materialize.

## Purpose

- turn the earlier agent-surface strategy into one explicit scaffold inventory
- define the default first-party file list without reopening the surface-strategy decision
- give later entry-point generation work one concrete inventory to implement

## Ratified Default Inventory

The canonical default `pa init` agent entry-point inventory is:

### Root-Level Entry-Point Files

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`

### Vendor-Native Supporting Files

- `.github/copilot-instructions.md`

### Vendor-Native Rule Directories And Files

- `.cursor/rules/project-arch.mdc`
- `.windsurf/rules/project-arch.md`
- `.claude/rules/project-arch.md`
- `.amazonq/rules/project-arch.md`

## Default Scaffold Rule

This inventory is the canonical first-party default scaffold for agent entry points. Later milestone work may decide exact file contents and generation mechanics, but it must not change this inventory without an explicit strategy revision.

## Always-Scaffolded Versus Applicable

- root-level entry-point files are part of the always-scaffolded canonical inventory
- vendor-native supporting files and rule directories are part of the default first-party inventory and should be scaffolded as canonical supporting surfaces
- optional compatibility surfaces are not part of this inventory even if later add-on support exists

## Relationship To Strategy

This file list is derived from `architecture/governance/agent-surface-strategy.md` and should be treated as the concrete scaffold inventory that implements that strategy.

## Excluded From The Default Inventory

- `.agent/*` compatibility surfaces
- workflow files or workflow directories
- alternate or duplicate root instruction systems not named in the canonical strategy

## Reuse Contract

Later milestone work should treat this document as the source of truth for which first-party agent entry-point files and directories belong in the default scaffold.
