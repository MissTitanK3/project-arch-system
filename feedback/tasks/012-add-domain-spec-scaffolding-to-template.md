---
schemaVersion: "1.0"
id: "012"
slug: "add-domain-spec-scaffolding-to-template"
title: "Add domain spec scaffolding to project initialization template"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "domains"
  - "architecture"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template creates arch-domains/README.md by default"
  - "Template creates arch-domains/domains.json with schema structure"
  - "Template includes domain markdown template examples"
  - "Domain templates include all required sections"
scope: "Domain specification scaffolding for new projects"
acceptanceChecks:
  - "New projects include domain directory structure"
  - "domains.json has valid schema with example domains"
  - "Domain template includes responsibilities, ownership, interfaces, non-goals, and milestone mapping sections"
evidence:
  - "Added domain scaffold templates under packages/create-project-arch/templates/domains/: README.md, domains.json, DOMAIN_TEMPLATE.md, core.md, ui.md, api.md"
  - "Wired CLI post-init domain scaffolding in packages/create-project-arch/src/cli.ts via scaffoldDomainSpecs(targetDir)"
  - "Implemented non-destructive behavior: README/DOMAIN_TEMPLATE refresh, domains.json seeded only when missing/empty, starter domain specs copied only when missing"
  - "Added regression coverage in packages/create-project-arch/src/cli.test.ts for domains.json starter entries and required domain template sections"
  - "Updated packages/create-project-arch/README.md with arch-domains scaffold structure and Domain Spec Scaffold guidance"
  - "Validation passed: pnpm --filter create-project-arch test (4/4 tests passing)"
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#2-domain-spec-scaffolding"
dependsOn: []
blocks: []
---

## Scope

Add domain specification scaffolding to the project initialization template with structured templates for domain definitions.

## Objective

Phase 1 identified that domain labels alone were insufficient. Structured domain specs reduced ambiguity and ownership drift. By providing templates, teams can quickly establish clear domain boundaries and responsibilities.

## Domain Artifacts

Create these artifacts by default:

- `arch-domains/README.md` - Overview of domain-driven architecture approach
- `arch-domains/domains.json` - Machine-readable domain registry
- Domain markdown templates (one file per initial domain)

## Domain Template Sections

Each domain template should include:

- **Responsibilities** - What this domain owns and manages
- **Primary data ownership** - Core data models and entities
- **Interface contracts** - APIs, events, and integration points
- **Non-goals** - Explicit boundaries (what this domain does NOT handle)
- **Milestone mapping** - When domain capabilities are delivered

## Acceptance Checks

- [x] Template creates arch-domains directory structure
- [x] README explains domain-driven architecture principles
- [x] domains.json includes schema and 2-3 example domains
- [x] Domain markdown template has all required sections
- [x] Example domains demonstrate proper boundaries
- [x] Integration test validates domain spec structure
- [x] Template documentation updated

## Implementation Notes

- Add domain templates to `packages/create-project-arch/templates/`
- Update initialization logic to create domain files
- Include examples like "core", "ui", "api" as starter domains
- Consider making domain count/names configurable during init
