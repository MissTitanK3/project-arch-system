---
schemaVersion: "1.0"
id: "016"
slug: "add-milestone-gap-closure-report-template"
title: "Add milestone gap-closure report template to project initialization"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "milestones"
  - "quality"
  - "governance"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template includes gap-closure report template"
  - "Template supports milestone completion validation"
  - "Template includes all required sections"
scope: "Milestone closure report template for quality assurance"
acceptanceChecks:
  - "Template creates closure report template"
  - "Template includes executive summary, gap categories, synchronization checks, coverage audit, remaining gaps, and template feedback sections"
  - "Example report demonstrates proper usage"
  - "Documentation explains closure workflow"
evidence:
  - "Added gap-closure scaffold templates in packages/create-project-arch/templates/gap-closure/: GAP_CLOSURE_TEMPLATE.md, example-gap-closure.md, README.md"
  - "Wired create-project-arch CLI scaffold step in packages/create-project-arch/src/cli.ts via scaffoldGapClosureTemplates(targetDir)"
  - "Scaffold destination is architecture/reference/ with non-overwrite behavior for existing artifacts"
  - "Added regression coverage in packages/create-project-arch/src/cli.test.ts validating required section headings, checklist entries, and example report structure"
  - "Updated packages/create-project-arch/README.md with closure report scaffold tree entries and usage workflow (including pa check and pa report)"
  - "Validation passed: pnpm --filter create-project-arch test (8/8 tests passing)"
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#6-milestone-gap-closure-report-template"
dependsOn: []
blocks: []
---

## Scope

Add a milestone gap-closure report template for architecture and documentation milestone validation.

## Objective

Phase 1 included a dedicated closure and template-improvement pass. Making this standard improves continuous quality of future scaffolds and ensures milestones are properly validated before marking complete.

## Gap-Closure Report Sections

- **Executive summary** - High-level closure status and outcome
- **Gap categories and resolutions** - What gaps were found and how they were addressed
- **Layer synchronization check** - Validation that all architectural layers are in sync
- **Coverage audit** - Verification that all requirements/specs are addressed
- **Remaining gaps and follow-on items** - Known limitations and future work
- **Template improvement feedback** - Suggestions for improving scaffolding

## Acceptance Checks

- [x] Template creates milestone closure template
- [x] Template includes all required sections
- [x] Template includes checklists for validation steps
- [x] At least one example closure report is included
- [x] README explains when/how to use closure reports
- [x] Integration test validates report structure
- [x] Consider integrating with `pa milestone complete` command

## Implementation Notes

- Add closure report template to `packages/create-project-arch/templates/`
- Include inline guidance for each section
- Provide checklist format for systematic validation
- Link to architecture validation commands (pa check, pa report)
- Consider automated gap detection and report generation
- Store closure reports in milestone directories (e.g., roadmap/phases/phase-1/milestones/milestone-1/closure.md)
