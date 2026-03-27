# Agent Entry-Point Content Model

This document defines the shared content model that canonical agent entry-point files should follow when later milestones materialize them.

## Purpose

- define one shared instruction structure across canonical agent entry points
- preserve one authority model even when content is adapted for vendor-specific surfaces
- give later generation work a stable content contract rather than a file-by-file rewrite

## Canonical Content Source

`AGENTS.md` is the canonical source of truth for the shared instruction model.

All other canonical entry-point files should either mirror that content or adapt it for tool-specific formatting without changing the underlying repository policy.

## Shared Instruction Categories

Canonical entry-point files should carry the same core instruction categories:

- repository purpose and role of the agent in the project
- architecture and roadmap source-of-truth locations
- standards review expectations before implementation
- execution and verification expectations
- change-management rules such as preserving user work and avoiding destructive actions
- output and collaboration expectations for coding agents working in the repository

## Authority Model

- `AGENTS.md` owns the canonical always-on instruction set
- `CLAUDE.md` and `GEMINI.md` are canonical vendor-specific root entry points that should adapt, not replace, the shared instruction set
- vendor-native supporting files and rule-directory files should express the same repository policy in the format expected by their host tool

## Adaptation Rules

- adapted entry points may change formatting, section order, or framing for the target tool
- adapted entry points may add minimal tool-specific framing when needed for discovery or precedence behavior
- adapted entry points must not invent independent repository policy that conflicts with the canonical source
- if a tool requires a specialized syntax such as frontmatter or rule metadata, that syntax should wrap the shared instruction model rather than replace it

## File Relationship Model

- `AGENTS.md`: canonical cross-agent content source
- `CLAUDE.md`: Claude-shaped root adaptation of the canonical content model
- `GEMINI.md`: Gemini-shaped root adaptation of the canonical content model
- `.github/copilot-instructions.md`: Copilot-shaped supporting adaptation of the canonical content model
- vendor-native rule files: rule-surface adaptations of the canonical content model for their host tool

## Drift Prevention Rule

- mirrored or adapted files should stay semantically aligned with `AGENTS.md`
- if shared repository policy changes, later generation or synchronization work should update all canonical entry points from the same content model
- conflicts must be resolved in favor of the canonical source rather than by allowing vendor-specific divergence

## Reuse Contract

Later milestone work should treat this document as the source of truth for how canonical agent entry-point content is shared, adapted, and kept aligned across files.
