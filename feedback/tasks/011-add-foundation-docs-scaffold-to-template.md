---
schemaVersion: "1.0"
id: "011"
slug: "add-foundation-docs-scaffold-to-template"
title: "Add foundation docs scaffold to project initialization template"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "foundation"
  - "documentation"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template creates architecture/foundation/prompt.md by default"
  - "Template creates architecture/foundation/project-overview.md by default"
  - "Template creates architecture/foundation/goals.md by default"
  - "Template creates architecture/foundation/user-journey.md by default"
  - "Template creates architecture/foundation/scope.md by default"
  - "Each file includes structured placeholder content with guidance"
scope: "Project initialization foundation documentation"
acceptanceChecks:
  - "New projects include all five foundation docs with helpful templates"
  - "Templates include section headers and guidance comments"
  - "Documentation references these as Milestone 1 prerequisites"
evidence:
  - "Added five foundation templates under packages/create-project-arch/templates/foundation/: prompt.md, project-overview.md, goals.md, user-journey.md, scope.md"
  - "Wired scaffolding flow in packages/create-project-arch/src/cli.ts via scaffoldFoundationDocs(targetDir), invoked after pa init"
  - "Added regression assertions in packages/create-project-arch/src/cli.test.ts to validate file presence, required section headers, and inline guidance comments"
  - "Updated packages/create-project-arch/README.md with architecture/foundation tree entries and a Milestone 1 Prerequisites section"
  - "Validation passed: pnpm --filter create-project-arch test (3/3 tests passing)"
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#1-foundation-docs-scaffold"
dependsOn: []
blocks: []
---

## Scope

Add foundation documentation scaffolding to the project initialization template so teams start with required architecture inputs.

## Objective

Phase 1 showed that architecture completeness is a hard prerequisite for implementation. These files were explicit Milestone 1 deliverables and required inputs for Phase 1 architecture tasks. Pre-scaffolding them allows teams to focus on project-specific content instead of creating structure from scratch.

## Foundation Files

Create these files by default in `architecture/foundation/`:

- `prompt.md` - Canonical source document (original project brief/requirements)
- `project-overview.md` - High-level system description
- `goals.md` - Project objectives and success criteria
- `user-journey.md` - Key user workflows and scenarios
- `scope.md` - Explicit in-scope and out-of-scope boundaries

## Acceptance Checks

- [x] Template code creates all five foundation markdown files
- [x] Each file includes structured section headers
- [x] Files include inline guidance comments
- [x] Template README references foundation docs as prerequisites
- [x] Integration test validates file creation
- [x] Template documentation updated

## Implementation Notes

- Add foundation file templates to `packages/create-project-arch/templates/`
- Update initialization logic in `packages/create-project-arch/src/cli.ts`
- Include helpful placeholder content that guides teams on what to document
- Consider adding validation that these files exist before allowing certain commands
