# Init Sprawl Guardrails

This document defines the reusable decision framework for preventing `pa init` scaffold sprawl.

## Purpose

- prevent default init from accumulating surfaces just because they are generally useful
- prevent `--full` from becoming a dumping ground for any optional first-party artifact
- give later milestone work a reusable admission framework instead of case-by-case intuition

## Core Position

A new surface should not enter default init or `--full` unless it can justify its place through the tier model, the default/full behavior contracts, and the project-agnostic init philosophy.

Useful is not enough.

The surface must also be coherent, reusable, safe to materialize at the relevant mode, and broad enough to fit the mode's purpose.

## Admission Tests

Before a proposed surface enters a tier, it should answer these questions:

1. Is it foundational to nearly every initialized repository?
2. Is it required only because of the selected template?
3. Is visibility sufficient without creating a file on disk?
4. Can it be created non-interactively without project-specific judgment?
5. Does it remain project-agnostic and domain-agnostic?
6. Would omitting it make the repository materially less coherent at the target mode?

## Tier Admission Rules

### Tier A

A surface belongs in Tier A only if:

- it is foundational to the smallest coherent default scaffold
- it is broadly useful across nearly all initialized repositories
- later work can safely assume it exists

### Tier B

A surface belongs in Tier B only if:

- it is required because of the selected template
- it should not be treated as universal across all stacks
- omitting it would make the template scaffold materially incomplete

### Tier C

A surface belongs in Tier C when:

- the topic should be discoverable
- creating it on disk by default would be premature or noisy
- catalog visibility provides most of the value

### Tier D

A surface belongs in Tier D when:

- it is useful but not foundational
- it is too specific, too preference-sensitive, or too noisy for default init
- it still requires explicit adoption or a carefully justified widening path

## Default Init Guardrails

- A surface must not enter default init unless its absence would make the default scaffold materially less coherent.
- Broad usefulness alone is not sufficient for Tier A.
- If a topic can succeed as catalog visibility, prefer Tier C over default file creation.
- If a surface is mainly useful for some repositories, it should stay out of default init.

## Full Mode Guardrails

- `--full` must remain the broadest first-party scaffold mode, not a domain generator.
- A surface must not enter `--full` if it still requires project-specific judgment to be safe.
- `--full` may widen first-party coverage, but only when the scaffold content is generic, reusable, and low-risk to create non-interactively.
- `--full` must not drift into domain-specific generation or project-subject-matter-specific content.

## Catalog-Only And Add-On Guardrails

- Prefer Tier C when the main value is discoverability rather than immediate file creation.
- Prefer Tier D when the surface should exist only after explicit adoption, compatibility need, or a later safe widening path.
- Do not promote a Tier C or Tier D surface upward without re-evaluating whether it now satisfies the tighter admission rules.

## Anti-Sprawl Rules

- Do not add a surface to default init merely because it would be convenient for some users.
- Do not add a surface to `--full` merely because it already has first-party content; it must also be broad and safe enough to materialize non-interactively.
- Do not use `--full` to bypass unresolved product decisions about specificity, ownership, or adoption.
- When in doubt, keep the topic cataloged rather than scaffolded.

## Reuse Contract

Later milestone work should justify every new init surface against this document before placing it into Tier A, Tier B, Tier C, Tier D, default init, or `--full`.
