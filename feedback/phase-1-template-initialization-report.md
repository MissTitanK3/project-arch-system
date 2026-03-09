# Phase 1 Template Initialization Recommendations

## Purpose

This report captures what should be included in project initialization templates based on findings from `roadmap/phases/phase-1`, especially setup requirements and gap-closure lessons.

## Summary

Phase 1 shows that architecture completeness is a hard prerequisite for implementation. The template should pre-scaffold foundational artifacts so teams can focus on project-specific content instead of creating structure from scratch.

## Recommended Template Additions

### 1. Foundation Docs Scaffold

Create these files by default:

- `architecture/foundation/prompt.md`
- `architecture/foundation/project-overview.md`
- `architecture/foundation/goals.md`
- `architecture/foundation/user-journey.md`
- `architecture/foundation/scope.md`

Rationale:

- These were explicit Milestone 1 deliverables.
- They are required inputs for Phase 1 architecture tasks.
- They establish the canonical source (`prompt.md`) and derived planning docs.

## 2. Domain Spec Scaffolding

Create these artifacts by default:

- `arch-domains/README.md`
- `arch-domains/domains.json`
- Domain markdown templates (one file per initial domain)

Each domain template should include:

- Responsibilities
- Primary data ownership
- Interface contracts
- Non-goals
- Milestone mapping

Rationale:

- Phase 1 identified that domain labels alone were insufficient.
- Structured domain specs reduced ambiguity and ownership drift.

## 3. System Architecture Spec Template

Provide a reusable template for `architecture/architecture/*.md` specs with required sections:

- Purpose
- Scope (in-scope / out-of-scope)
- Key definitions
- Design
- Data model
- Owning domain
- MVP constraints

Rationale:

- Phase 1 produced multiple specs ad hoc before a common structure emerged.
- A default template improves consistency and review speed.

## 4. Concept-to-Module Traceability Template

Create `arch-model/concept-map.json` by default with schema placeholders for:

- Concept metadata
- Owning domain
- Module responsibilities
- Implementation surfaces
- Dependencies
- Domain-module mapping
- Implementation checklist

Rationale:

- Phase 1 gap closure explicitly required machine-readable concept-to-module traceability.
- This artifact helps agents and contributors move from concept to implementation surfaces reliably.

## 5. Decision Record Template

Add a standard decision template for records under roadmap decisions (or milestone decision folders), including:

- Structured frontmatter (`id`, `title`, `slug`, `status`, timestamps, related tasks/docs)
- Context
- Decision
- Rationale
- Alternatives considered
- Affected artifacts
- Implementation status checklist

Rationale:

- Phase 1 documented major architecture decisions and showed the need for consistent governance artifacts.

## 6. Milestone Gap-Closure Report Template

Add a closure template for architecture/documentation milestones that includes:

- Executive summary
- Gap categories and resolutions
- Layer synchronization check
- Coverage audit
- Remaining gaps and follow-on items
- Template improvement feedback

Rationale:

- Phase 1 included a dedicated closure and template-improvement pass.
- Making this standard improves continuous quality of future scaffolds.

## 7. Validation Hook in Template

Include a default command/script path for architecture validation (for example, `pa check`) and reference it in task verification steps.

Rationale:

- Phase 1 tasks consistently used validation checks to confirm coherence and traceability.

## Minimum Suggested Initialization Pack

At minimum, project initialization should create:

- `architecture/foundation/*` core docs
- `architecture/architecture/` system spec template(s)
- `architecture/standards/` baseline standards placeholders
- `architecture/reference/README.md`
- `arch-domains/domains.json` and domain spec templates
- `arch-model/concept-map.json` template
- Decision template location
- Milestone closure report template

## Source Basis

Primary references used for this report:

- `roadmap/phases/phase-1/overview.md`
- `roadmap/phases/phase-1/milestones/milestone-1-setup/overview.md`
- `roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/005-complete-architecture-foundation.md`
- `roadmap/phases/phase-1/milestones/milestone-2-gaps/tasks/planned/005-task.md`
- `architecture/reference/design-notes/gap-closure-report.md`
