---
schemaVersion: "1.0"
id: "013"
slug: "add-system-architecture-spec-template"
title: "Add system architecture spec template to project initialization"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "architecture"
  - "specifications"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template includes reusable architecture spec template"
  - "Spec template includes all required sections"
  - "Example spec demonstrates proper usage"
scope: "Architecture specification template for consistent system design docs"
acceptanceChecks:
  - "Template creates architecture/architecture/ directory with spec template"
  - "Spec template includes purpose, scope, definitions, design, data model, ownership, and MVP constraints sections"
  - "At least one example spec is included"
evidence:
  - "Added architecture spec scaffold templates under packages/create-project-arch/templates/architecture-specs/: SPEC_TEMPLATE.md and example-system.md"
  - "Wired CLI post-init architecture spec scaffolding in packages/create-project-arch/src/cli.ts via scaffoldArchitectureSpecs(targetDir)"
  - "Scaffold behavior is non-destructive: files are copied only when missing in architecture/architecture/"
  - "Added regression coverage in packages/create-project-arch/src/cli.test.ts for required spec template sections and example spec presence"
  - "Updated packages/create-project-arch/README.md with architecture/architecture tree entries and System Architecture Spec Scaffold guidance"
  - "Validation passed: pnpm --filter create-project-arch test (5/5 tests passing)"
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#3-system-architecture-spec-template"
dependsOn: []
blocks: []
---

## Scope

Provide a reusable template for system architecture specifications to ensure consistency across architecture documents.

## Objective

Phase 1 produced multiple specs ad hoc before a common structure emerged. A default template improves consistency and review speed, making it easier for teams to document architectural decisions systematically.

## Required Sections

Architecture spec template should include:

- **Purpose** - Why this system/component exists
- **Scope** - Explicit in-scope and out-of-scope items
- **Key definitions** - Terms, concepts, and vocabulary
- **Design** - Architecture approach and patterns
- **Data model** - Core entities and relationships
- **Owning domain** - Which domain is responsible
- **MVP constraints** - Minimum viable implementation boundaries

## Acceptance Checks

- [x] Template creates architecture/architecture/ directory
- [x] Directory includes SPEC_TEMPLATE.md with all sections
- [x] At least one example spec is included (e.g., example-system.md)
- [x] Example demonstrates all sections with realistic content
- [x] Template README references spec template
- [x] Integration test validates spec structure
- [x] CLI documentation updated

## Implementation Notes

- Add spec template to `packages/create-project-arch/templates/`
- Include inline guidance for each section
- Provide one concrete example spec that teams can reference
- Consider adding `pa new spec <name>` command to generate new specs from template
