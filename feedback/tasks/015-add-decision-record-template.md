---
schemaVersion: "1.0"
id: "015"
slug: "add-decision-record-template"
title: "Add decision record template to project initialization"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "decisions"
  - "adr"
  - "governance"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template includes decision record template"
  - "Decision template includes structured frontmatter"
  - "Template includes all required sections"
  - "Documentation explains decision record workflow"
scope: "Architecture decision record template for governance"
acceptanceChecks:
  - "Template creates decision template in appropriate location"
  - "Template includes frontmatter with id, title, slug, status, timestamps, relationships"
  - "Template includes context, decision, rationale, alternatives, affected artifacts, and implementation sections"
  - "Example decision demonstrates proper usage"
evidence:
  - "Added decision scaffold templates in packages/create-project-arch/templates/decisions/: DECISION_TEMPLATE.md, example-decision.md, README.md"
  - "Wired create-project-arch CLI decision scaffolding in packages/create-project-arch/src/cli.ts via scaffoldDecisionRecords(targetDir)"
  - "Scaffolded location is architecture/decisions/ with non-overwrite behavior for existing files"
  - "Added regression validation in packages/create-project-arch/src/cli.test.ts for required frontmatter fields and ADR section coverage"
  - "Updated packages/create-project-arch/README.md project structure and Decision Record Scaffold workflow guidance"
  - "Validation passed: pnpm --filter create-project-arch test (7/7 tests passing)"
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#5-decision-record-template"
dependsOn: []
blocks: []
---

## Scope

Add a standard decision record template for architecture decisions, based on ADR (Architecture Decision Record) practices.

## Objective

Phase 1 documented major architecture decisions and showed the need for consistent governance artifacts. A standard template ensures decisions are properly documented, rationale is preserved, and teams can track implementation status.

## Decision Template Sections

### Frontmatter (YAML)

- `id` - Unique decision identifier
- `title` - Decision title
- `slug` - URL-friendly identifier
- `status` - proposed/accepted/deprecated/superseded
- `date` - Decision date
- `relatedTasks` - Task IDs affected by this decision
- `relatedDocs` - Architecture docs referenced

### Document Sections

- **Context** - What is the issue we're facing
- **Decision** - What we decided to do
- **Rationale** - Why this decision was made
- **Alternatives considered** - What other options were evaluated
- **Affected artifacts** - What code/docs change as a result
- **Implementation status checklist** - Verification steps

## Acceptance Checks

- [x] Template creates architecture/decisions/ directory
- [x] Directory includes DECISION_TEMPLATE.md
- [x] Template includes structured frontmatter
- [x] Template includes all required sections
- [x] At least one example decision is included
- [x] README explains decision workflow
- [x] Integration test validates decision structure
- [x] Consider adding `pa decision new <title>` command

## Implementation Notes

- Add decision template to `packages/create-project-arch/templates/`
- Follow ADR best practices (Michael Nygard's format)
- Include inline guidance for each section
- Support both roadmap/decisions/ and milestone-specific decisions
- Link decisions to affected tasks and architecture docs
