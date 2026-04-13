# Init Surface Tier Mapping

This document maps major current and proposed `pa init` surface categories into Tier A through Tier D.

## Purpose

- make the tier model concrete enough for downstream implementation work
- classify current and proposed first-party surface categories without guesswork
- preserve distinctions between standards, governance, operations, templates, taxonomy guidance, and agent-related surfaces

## Mapping Rules

- classify by surface role, not by whether a specific file already exists today
- keep category placement separate from later decisions about exact file inventories
- use Tier B only when the selected template is the reason the surface is required
- use Tier C or Tier D when visibility matters more than immediate default materialization

## Surface Category Map

| Surface category                                                                      | Tier                                 | Rationale                                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Core roadmap and project-arch planning surfaces                                       | Tier A                               | Foundational to nearly every initialized repository; includes the single roadmap root and reserved `shared` bootstrap project. |
| Canonical architecture entry docs and recommended top-level architecture families     | Tier A                               | Part of the smallest coherent default scaffold.                                                                                |
| Root taxonomy guidance and architecture authority docs                                | Tier A                               | Needed so contributors and later milestones share one source of truth.                                                         |
| Core required standards                                                               | Tier A                               | Day-one implementation standards that are broadly applicable.                                                                  |
| Canonical document templates                                                          | Tier A                               | Reusable first-party templates needed for normal repository operation.                                                         |
| Template-specific required standards                                                  | Tier B                               | Required because of the selected stack, not because they are universal.                                                        |
| Broader standards catalog topics                                                      | Tier C                               | Should be visible for discoverability without default file creation.                                                           |
| Recommended governance starter topics beyond the baseline                             | Tier C                               | Useful to surface, but not always required on disk at default init.                                                            |
| Recommended operations starter topics beyond the baseline                             | Tier C                               | Important categories, but often better cataloged before broad materialization.                                                 |
| Additional architecture family starter docs where reusable first-party content exists | Tier C or Tier D depending on safety | May be broadened later, but only when safe to materialize non-interactively.                                                   |
| Adopted optional standards                                                            | Tier D                               | Become scaffolded only after explicit adoption or a safe widening path.                                                        |
| Governance or operations packs                                                        | Tier D                               | Useful, but too specific to treat as part of the smallest coherent scaffold.                                                   |
| Agent entry-point surfaces identified as canonical defaults                           | Tier A                               | Core agent-facing entry surfaces are part of the default first-party model.                                                    |
| Agent compatibility surfaces marked optional compatibility                            | Tier D                               | Supported only as optional compatibility, not as default first-party scaffolding.                                              |
| Workflow files that depend on unresolved context plumbing                             | Tier D                               | Too dependent on later context support to be default-scaffolded now.                                                           |

## Category Notes

### Standards

- required standards belong in Tier A or Tier B depending on whether they are universal or template-specific
- broader standards topics belong in Tier C until adoption or a safe widening path exists
- adopted optional standards belong in Tier D

### Governance And Operations

- baseline governance docs that define repository authority or structure belong in Tier A
- broader governance and operations topic packs usually belong in Tier C or Tier D depending on whether they are simply discoverable topics or opt-in packs
- governance and operations should not be collapsed into standards just because they are all documentation

### Templates And Taxonomy Guidance

- canonical templates and root taxonomy guidance belong in Tier A because they support normal repository operation
- additional starter docs beyond the baseline may be Tier C or Tier D depending on whether they are safe to materialize broadly

### Roadmap Layout

- the canonical initialized planning model is `roadmap/projects/<project>/phases/...` under one roadmap root
- the reserved `shared` project belongs in Tier A because the default scaffold needs one bootstrap planning scope
- additional custom-named projects are repository-defined and do not need to be scaffolded by default init

### Agent-Related Surfaces

- canonical default entry points belong in Tier A
- optional compatibility surfaces remain Tier D unless later milestone work promotes them explicitly
- workflow files remain outside default scaffolding until context support and agent-surface strategy are stable

## Reuse Contract

Later milestone work should use this mapping to decide whether a proposed surface belongs in default init, `--full`, catalog-only guidance, or optional add-on behavior without inventing new category logic.
