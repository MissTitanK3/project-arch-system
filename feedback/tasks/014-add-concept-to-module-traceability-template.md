---
schemaVersion: "1.0"
id: "014"
slug: "add-concept-to-module-traceability-template"
title: "Add concept-to-module traceability template to project initialization"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "traceability"
  - "architecture-model"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
  - "packages/project-arch/src/schemas/"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template creates arch-model/concept-map.json by default"
  - "concept-map.json includes schema with placeholders"
  - "Schema supports concept metadata, domain mapping, module responsibilities, surfaces, dependencies"
  - "Validation enforces concept-map schema"
scope: "Machine-readable traceability from architecture concepts to implementation"
acceptanceChecks:
  - "New projects include arch-model/concept-map.json"
  - "File includes valid JSON schema structure"
  - "Schema supports all required traceability fields"
  - "pa check validates concept-map structure"
  - "Example concepts demonstrate proper usage"
evidence:
  - "Added concept-map scaffold template at packages/create-project-arch/templates/concept-map/concept-map.json with 2 example concepts and placeholder mappings"
  - "Wired create-project-arch CLI scaffold step in packages/create-project-arch/src/cli.ts via scaffoldConceptMap(targetDir) to create arch-model/concept-map.json by default"
  - "Added create-project-arch regression coverage in packages/create-project-arch/src/cli.test.ts validating concept-map structure and required fields"
  - "Added JSON schema definition in packages/project-arch/src/schemas/conceptMap.ts and schema tests in packages/project-arch/src/schemas/conceptMap.test.ts"
  - "Integrated schema enforcement into pa check in packages/project-arch/src/core/validation/check.ts"
  - "Added validation regression in packages/project-arch/src/core/validation/check.test.ts for malformed arch-model/concept-map.json"
  - "Updated create-project-arch documentation in packages/create-project-arch/README.md for concept-map scaffold output"
  - "Updated project-arch init docs seed in packages/project-arch/src/core/init/initializeProject.ts to include concept-map.json in arch-model primary files"
  - "Validation passed: pnpm --filter create-project-arch test (6/6)"
  - "Validation passed: pnpm --filter project-arch test src/schemas/conceptMap.test.ts src/core/validation/check.test.ts (35/35)"
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#4-concept-to-module-traceability-template"
dependsOn: []
blocks: []
---

## Scope

Create `arch-model/concept-map.json` template with schema placeholders for machine-readable concept-to-module traceability.

## Objective

Phase 1 gap closure explicitly required machine-readable concept-to-module traceability. This artifact helps agents and contributors move from concept to implementation surfaces reliably, reducing ambiguity and ensuring architectural intent is preserved through implementation.

## Schema Requirements

concept-map.json should support:

- **Concept metadata** - ID, name, description
- **Owning domain** - Which domain owns this concept
- **Module responsibilities** - What modules implement this concept
- **Implementation surfaces** - Code locations, APIs, UI components
- **Dependencies** - Which concepts this depends on
- **Domain-module mapping** - How concepts map to modules
- **Implementation checklist** - Verification steps

## Acceptance Checks

- [x] Template creates arch-model/concept-map.json
- [x] File includes valid JSON schema structure
- [x] Schema documented in arch-model/README.md
- [x] Includes 2-3 example concepts with all fields
- [x] pa check validates concept-map against schema
- [x] JSON schema definition added to packages/project-arch/src/schemas/
- [x] Integration test validates concept-map creation
- [x] Template documentation updated

## Implementation Notes

- Add concept-map template to `packages/create-project-arch/templates/`
- Create JSON schema definition for validation
- Include examples that show concept -> domain -> module -> surface flow
- Consider adding commands to query/update concept map programmatically
- Link to domain specs and architecture specs for consistency
