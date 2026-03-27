# Full Init Behavior

This document defines what `pa init --full` means under the tier model.

## Purpose

- define the broadest first-party scaffold mode
- explain how `--full` broadens beyond the smallest coherent default scaffold
- preserve project-agnostic init while allowing wider first-party coverage

## Core Position

`pa init --full` should provide the broadest first-party scaffold mode.

It exists for convenience, not as a different philosophy from default init.

That means it may widen the set of first-party surfaces created on disk, but it must remain project-agnostic, template-aware, and non-domain-specific.

## Full Mode Rule

`pa init --full` includes:

- Tier A surfaces
- applicable Tier B surfaces required by the selected template
- scaffoldable Tier C topics where first-party content exists and broad materialization is safe
- safe Tier D add-ons that can be created non-interactively without project-specific selection

`pa init --full` must not include:

- domain-specific content generation
- project-subject-matter-specific documents
- optional surfaces that still require project-specific judgment before they are safe to materialize

## What Broadening Means

Relative to default init, `--full` may widen categories such as:

- additional first-party architecture family starter docs
- broader first-party standards scaffolds where the catalog topic already has reusable content
- governance or operations starter docs where first-party templates exist
- compatibility or support surfaces that are still generic enough to create safely

Broadening does not mean inventing content about the user's business domain, product subject matter, or implementation specifics.

## Tier Rules For Full Mode

- Tier A remains included.
- Tier B remains included when required by the selected template.
- Tier C may be materialized only when first-party scaffold content exists and the result stays broadly useful without prompting.
- Tier D may be included only when the add-on is safe to create non-interactively and still fits the project-agnostic model.

## Guardrails

- `--full` must remain the broadest first-party scaffold mode, not a domain generator.
- `--full` must not require users to answer a long sequence of project-specific choices.
- Broader coverage is justified only when the scaffold content is generic, reusable, and low-risk to create by default in full mode.
- If a surface is useful only for some repositories and still needs judgment, it should remain outside `--full` until a safer adoption path exists.

## Relationship To Default Init

Default init remains the smallest coherent default scaffold.

`--full` should widen beyond that baseline without changing the core model of project-agnostic first-party setup.

- Use `init-tier-model.md` for the formal tier vocabulary.
- Use `init-default-behavior.md` for the default-mode contract.

## Reuse Contract

Later milestone work should use this document when deciding whether a proposed surface is broad and safe enough to belong in `pa init --full` rather than staying catalog-only or optional add-on only.
