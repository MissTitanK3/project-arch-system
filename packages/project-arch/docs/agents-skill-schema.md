# Agent Skill Contract

This document defines the user-facing contract for the agent skill system managed by `pa agents`.

## Scope

The skill system is a deterministic capability layer stored inside `.arch/agents-of-arch/`.
It exists to capture repository-native instructions and checklists in markdown and JSON.

## Non-Goals

The skill system does **not** provide:

- executable JavaScript or TypeScript hooks
- plugin loading or remote code execution
- a marketplace or dynamic extension runtime

Skills are content artifacts only.

## Directory Layout

```text
.arch/
  agents-of-arch/
    README.md
    registry.json
    skills/
      <builtin-skill-id>/
        skill.json
        system.md
        checklist.md
    user-skills/
      _template/
      <user-skill-id>/
        skill.json
        system.md
        checklist.md
```

Rules:

- `skills/` contains built-in skills scaffolded by `pa init`.
- `user-skills/` contains local repository skills and explicit overrides.
- `_template/` is a reference directory and is ignored by skill discovery.
- `registry.json` is derived output, never the source of truth.

## Required Files Per Skill

Each skill directory must contain:

- `skill.json`
- `system.md`
- `checklist.md`

The skill directory name must match `skill.json.id`.

## Manifest Shape (`skill.json`)

Current contract version: `1.0`

```json
{
  "schemaVersion": "1.0",
  "id": "repo-map",
  "name": "Repository Map",
  "source": "builtin",
  "version": "1.0.0",
  "summary": "Create a deterministic map of repository surfaces and authority order.",
  "whenToUse": ["At task start", "When repository ownership is unclear"],
  "expectedOutputs": ["Surface map", "Authority checklist"],
  "files": {
    "system": "system.md",
    "checklist": "checklist.md"
  },
  "tags": ["architecture", "navigation"],
  "overrides": false
}
```

### Field Semantics

| Field             | Required | Type                   | Notes                                                  |
| ----------------- | -------- | ---------------------- | ------------------------------------------------------ |
| `schemaVersion`   | yes      | `"1.0"`                | Locked manifest contract version.                      |
| `id`              | yes      | kebab-case string      | Must match the containing directory name.              |
| `name`            | yes      | string                 | Human-readable title.                                  |
| `source`          | yes      | `"builtin" \| "user"`  | Must match the parent tree.                            |
| `version`         | yes      | semver string          | Example: `1.0.0`.                                      |
| `summary`         | yes      | string                 | Short user-facing description.                         |
| `whenToUse`       | yes      | non-empty string array | Trigger conditions for choosing the skill.             |
| `expectedOutputs` | yes      | non-empty string array | Concrete expected results.                             |
| `files.system`    | yes      | string                 | Relative path to the skill instructions markdown file. |
| `files.checklist` | yes      | string                 | Relative path to the checklist markdown file.          |
| `tags`            | no       | string[]               | Optional search/grouping metadata.                     |
| `overrides`       | no       | boolean                | Must be `true` for user overrides of built-in ids.     |

## Resolution Rules

Discovery and resolution are deterministic:

1. Load built-in skill directories from `skills/`, ignoring names that start with `_`.
2. Sort built-in skills by `skill.json.id`.
3. Load user skill directories from `user-skills/`, ignoring names that start with `_`.
4. Sort user skills by `skill.json.id`.
5. Merge the two sets by id.
6. Emit the resolved set sorted by id.

This means repeated runs with unchanged inputs produce the same resolved registry order.

## Override Semantics

Duplicate ids are allowed only for explicit user overrides of built-in skills.

Rules:

- A built-in skill id can be reused under `user-skills/<id>/` only when the user manifest sets `"overrides": true`.
- When override intent is present, the user skill replaces the built-in skill in the resolved output.
- Duplicate ids without explicit override intent are errors.
- Duplicate ids within the same source tree are also errors.

Example override manifest excerpt:

```json
{
  "id": "repo-map",
  "source": "user",
  "overrides": true
}
```

## Derived Registry Contract

`registry.json` is generated from the resolved skill set.

Shape:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-03-22T00:00:00.000Z",
  "skills": [
    {
      "id": "repo-map",
      "source": "builtin",
      "name": "Repository Map",
      "version": "1.0.0",
      "summary": "Create a deterministic map of repository surfaces and authority order.",
      "directory": ".arch/agents-of-arch/skills/repo-map",
      "files": {
        "system": "system.md",
        "checklist": "checklist.md"
      },
      "tags": ["architecture", "navigation"],
      "overrides": false
    }
  ]
}
```

Guidance:

- Treat `registry.json` as a cache/derived artifact.
- Do not hand-edit it.
- Regenerate it with `pa agents sync`.
- Use `pa agents sync --check` in CI to fail when the registry is stale.

## Validation Behavior

`pa agents check` validates the resolved skill set and reports focused diagnostics.

Current checks include:

- manifest schema validity
- source/tree consistency
- required markdown file existence
- duplicate id and override invariants
- registry drift detection through `pa agents sync --check`

## Recommended Authoring Workflow

### Create a new user skill

```bash
pa agents new release-readiness-custom --title "Release Readiness Custom"
```

This creates:

```text
.arch/agents-of-arch/user-skills/release-readiness-custom/
  skill.json
  system.md
  checklist.md
```

### Edit the content files

1. Update `skill.json` metadata.
2. Add concrete instructions to `system.md`.
3. Add verification steps and done criteria to `checklist.md`.

### Validate and sync

```bash
pa agents sync --check
pa agents sync
pa agents check
```

Recommended CI gate:

```bash
pa agents sync --check && pa agents check
```

## Command Reference

```bash
pa agents list
pa agents show <id>
pa agents new <id> [--title ...] [--summary ...] [--override] [--tags ...]
pa agents sync [--check] [--json]
pa agents check [--json]
```

## Practical Notes

- Use `pa agents list --json` for machine-readable inventory.
- Use `pa agents show <id>` to inspect the resolved skill after overrides.
- Prefer adding a new id unless you intentionally need to replace a built-in skill.
- Run `pa agents sync` after any manifest or markdown changes that affect the resolved set.
