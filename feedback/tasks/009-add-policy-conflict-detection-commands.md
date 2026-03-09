---
schemaVersion: "1.0"
id: "009"
slug: "add-policy-conflict-detection-commands"
title: "Add policy conflict detection commands for task vs architecture"
lane: "planned"
status: "done"
createdAt: "2026-03-08"
updatedAt: "2026-03-08"
discoveredFromTask: null
tags:
  - "policy"
  - "validation"
  - "cli"
codeTargets:
  - "packages/project-arch/src/cli/commands"
  - "packages/project-arch/src/core/validation"
  - "packages/project-arch/src/sdk/commands.ts"
publicDocs:
  - "feedback/PROJECT_ARCH_VNEXT_REPORT.md"
decisions: []
completionCriteria:
  - "pa policy check performs deterministic conflict detection"
  - "pa policy explain includes rationale and remediation guidance"
  - "Output includes severity, confidence, claim pairs, and remediation action"
scope: "Policy conflict detection between tasks and architecture/decisions"
acceptanceChecks:
  - "Detects decision status/scope contradictions"
  - "Detects concept-creation violations without linked decision"
  - "Detects domain ownership and architecture boundary violations"
  - "Detects phase/milestone timing conflicts"
evidence:
  - "Implemented deterministic policy engine: packages/project-arch/src/core/validation/policy.ts"
  - "Added machine-readable CLI command: pa policy check (JSON output) in packages/project-arch/src/cli/commands/policy.ts"
  - "Added human-readable CLI command: pa policy explain in packages/project-arch/src/cli/commands/policy.ts"
  - "Added SDK surface: packages/project-arch/src/sdk/policy.ts with policyCheck and policyExplain"
  - "Registered policy command in CLI bootstrap: packages/project-arch/src/cli/index.ts"
  - "Extended SDK metadata for policy.check and policy.explain: packages/project-arch/src/sdk/commands.ts"
  - "Validation: pnpm --filter project-arch typecheck"
  - "Validation: pnpm --filter project-arch test src/core/validation/policy.test.ts src/cli/commands/policy.test.ts src/sdk/policy.test.ts (10/10 passing)"
  - "Validation: pnpm --filter project-arch test check.test.ts (41/41 passing)"
  - "Validation: pnpm --filter project-arch test report.test.ts (37/37 passing)"
traceLinks: []
dependsOn:
  - "002"
  - "006"
blocks: []
---

## Scope

Introduce dedicated policy analysis commands that validate task instructions against architecture and decision constraints.

## Objective

Provide deterministic conflict detection and clear human-readable remediation guidance before implementation drift occurs.

## Acceptance Checks

- [x] `pa policy check` outputs deterministic machine-readable conflict records.
- [x] `pa policy explain` outputs user-readable rationale and remediation.
- [x] Output includes `severity`, `confidence`, conflicting claim pair, and remediation action.

## Implementation Plan

1. Define policy rule engine interfaces and conflict record schema.
2. Implement deterministic checks for the four minimum conflict classes.
3. Add CLI command wiring for `policy check` and `policy explain`.
4. Add test fixtures for each conflict class and non-conflict baselines.

## Verification

- Run: `pnpm --filter project-arch test check.test.ts`
- Run targeted tests for new policy command suite.

## Evidence

- `pa policy check` outputs deterministic JSON records with: `severity`, `confidence`, `claimA`, `claimB`, `rationale`, `remediation`.
- `pa policy explain` outputs human-readable conflict rationale and remediation by rule.
- Conflict classes covered in tests: decision status/scope contradictions, concept-creation without decision, domain ownership + architecture boundary, and timing conflicts.
- Test validation completed for policy suites and existing check/report suites with all passing results.

## Trace Links

- feedback: `feedback/PROJECT_ARCH_VNEXT_REPORT.md` (P2-I)

## Dependencies

### Depends On

- `002`
- `006`

### Blocks

- None.
