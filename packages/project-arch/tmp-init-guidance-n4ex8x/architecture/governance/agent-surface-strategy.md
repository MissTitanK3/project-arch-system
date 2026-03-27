# Agent Surface Strategy

This document defines the canonical first-party agent surfaces that `pa` should treat as its default agent instruction model.

## Purpose

- define one coherent first-party agent-surface model
- give later entry-point work a stable scaffold target
- prevent future documentation from treating multiple instruction systems as equally primary

## Canonical First-Party Surfaces

The canonical first-party agent-surface model is:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/project-arch.mdc`
- `.windsurf/rules/project-arch.md`
- `.claude/rules/project-arch.md`
- `.amazonq/rules/project-arch.md`

## Surface Roles

### Root-Level Canonical Surfaces

- `AGENTS.md`: cross-agent root instructions
- `CLAUDE.md`: Claude-specific root instructions
- `GEMINI.md`: Gemini-specific root instructions

### Vendor-Native Supporting Surfaces

- `.github/copilot-instructions.md`: GitHub Copilot instructions
- `.cursor/rules/project-arch.mdc`: Cursor rule surface
- `.windsurf/rules/project-arch.md`: Windsurf rule surface
- `.claude/rules/project-arch.md`: Claude rule surface
- `.amazonq/rules/project-arch.md`: Amazon Q rule surface

## Default Model Rule

These surfaces together define the default `pa init` agent scaffold model. Later milestones may decide how and when each file is materialized, but they must not replace this model with a competing first-party surface set.

## Compatibility Surface Classification

Compatibility surfaces such as `.agent/*` are optional compatibility surfaces, not canonical first-party defaults.

Their status is:

- supported only as optional compatibility
- not part of the default first-party scaffold model
- not a second primary instruction system
- candidates for explicit opt-in or later add-on support only

## Compatibility Rule

- `.agent/instructions.md` must not be described as equal in authority to the canonical first-party surface set.
- `.agent/workflows/` must not be treated as part of the default `pa init` model.
- compatibility surfaces may exist to help specific environments, but they must remain subordinate to the canonical first-party model.
- later milestones may define how compatibility surfaces are generated, but they must not relabel them as primary defaults.

## Source-Of-Truth Rule

- `AGENTS.md` is the canonical source of truth for always-on cross-agent instructions.
- vendor-specific root files and rule directories may adapt that instruction set for tool-specific consumption, but they do not replace the canonical root contract.
- if a lower-case `agents.md` transitional surface exists during migration, it must be treated as transitional compatibility rather than the long-term canonical file name.

## Mirroring Rule

- `CLAUDE.md`, `GEMINI.md`, and vendor-native rule files may mirror or adapt the canonical instruction set for their target environment.
- mirrored surfaces must preserve the intent and authority of the canonical instruction set rather than inventing independent repository policy.
- mirrored surfaces may add format-specific framing only when it does not conflict with the canonical source of truth.
- optional compatibility surfaces must be treated as mirrors or adapters, not independent instruction systems.

## Conflict Rule

- when mirrored content conflicts with `AGENTS.md`, `AGENTS.md` wins as the canonical source of truth for always-on instructions.
- when a compatibility surface conflicts with any canonical first-party surface, the canonical first-party surface wins.
- later milestones must avoid scaffolding mirrors that drift materially from the canonical instruction set.

## Downstream Implications

### Entry-Point Milestone Constraints

- later entry-point work must scaffold the canonical first-party surface set defined in this document rather than inventing a different default inventory.
- later entry-point work may decide materialization details, transition handling, and file-generation mechanics, but it must not reopen which surfaces are first-party defaults.
- compatibility surfaces must not displace or replace the canonical first-party set in later entry-point scaffolding.

### Workflow Milestone Constraints

- later workflow work must treat canonical first-party agent surfaces as the base instruction system.
- workflow files must remain subordinate to the canonical first-party instruction set and must not introduce a second primary instruction model.
- `.agent/workflows/` or similar compatibility workflow surfaces, if added later, must remain optional compatibility rather than default first-party scaffolding.
- workflow scaffolding should remain gated on stable context support rather than being promoted early through agent-surface ambiguity.

### Handoff Rule

Milestone 6 should implement canonical entry points against this strategy. Milestone 7 should implement workflow scaffolding only after respecting this strategy and the later context-support milestone. Neither milestone should re-litigate the canonical surface model.

## Strategy Boundary

This milestone defines the canonical surface inventory, not the final scaffolding implementation details. Workflow files, mirroring rules, and optional compatibility surfaces are handled by later tasks.

## Transitional Note

The current init scaffold may still contain a lower-case `agents.md` entry surface until the dedicated entry-point milestone updates file generation. That transitional state does not change the canonical first-party model defined here.

## Reuse Contract

Later agent-entry-point work should scaffold this surface set as the first-party default, and later workflow work must treat it as the base instruction system rather than introducing a second primary model.
