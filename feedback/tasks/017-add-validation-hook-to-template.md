---
schemaVersion: "1.0"
id: "017"
slug: "add-validation-hook-to-template"
title: "Add validation hook to project initialization template"
lane: "planned"
status: "not-started"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "template"
  - "initialization"
  - "validation"
  - "ci-cd"
  - "quality"
codeTargets:
  - "packages/create-project-arch/templates/"
  - "packages/create-project-arch/src/cli.ts"
publicDocs:
  - "feedback/phase-1-template-initialization-report.md"
decisions: []
completionCriteria:
  - "Template includes validation command/script"
  - "Validation is referenced in task verification steps"
  - "CI/CD integration examples are provided"
scope: "Architecture validation automation for new projects"
acceptanceChecks:
  - "Template includes validation script or command references"
  - "README documents validation workflow"
  - "Example CI/CD configuration includes architecture validation"
  - "Task templates reference validation checks"
evidence: []
traceLinks:
  - "feedback/phase-1-template-initialization-report.md#7-validation-hook-in-template"
dependsOn: []
blocks: []
---

## Scope

Include default command/script path for architecture validation and reference it in task verification steps.

## Objective

Phase 1 tasks consistently used validation checks to confirm coherence and traceability. By making validation a standard part of project scaffolding, teams can maintain architectural integrity from day one.

## Validation Elements

- **Validation script** - Reference to `pa check` or custom validation
- **Task template integration** - Acceptance checks include validation steps
- **CI/CD examples** - GitHub Actions, GitLab CI templates with validation
- **Pre-commit hooks** - Optional git hooks for local validation
- **Documentation** - Clear guidance on validation workflow

## Acceptance Checks

- [ ] Template includes scripts/validate.sh or similar
- [ ] Script runs `pa check` and other validation commands
- [ ] README documents validation command and usage
- [ ] Task templates include validation in acceptance checks
- [ ] CI/CD example config includes validation step
- [ ] Integration test validates script execution
- [ ] Consider adding pre-commit hook example

## Implementation Notes

- Add validation script to `packages/create-project-arch/templates/`
- Update task templates to reference validation in acceptance criteria
- Provide CI/CD examples for common platforms:
  - GitHub Actions (.github/workflows/validate.yml)
  - GitLab CI (.gitlab-ci.yml)
  - CircleCI (.circleci/config.yml)
- Include pre-commit hook example for local validation
- Document validation commands in template README
- Make validation part of milestone completion criteria
