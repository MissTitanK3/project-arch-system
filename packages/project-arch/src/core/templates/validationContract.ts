import { currentDateISO } from "../../utils/date";
import type { ValidationContract } from "../../schemas/validationContract";

/**
 * Validation Contract Template
 *
 * USAGE TIMING: Create once per phase after defining phase objectives.
 *
 * A validation contract specifies deterministic verifications that must be run
 * to validate phase completion. Each check links to a decision or milestone objective,
 * specifies a command to run, and defines the expected success signal.
 *
 * Typical frequency: Once per phase, updated as objectives evolve
 *
 * DO NOT use for:
 * - Ad hoc testing or experimentation
 * - Task-level acceptance criteria (use task completionCriteria instead)
 * - Documentation validation (use docs standards instead)
 */

export function defaultValidationContractTemplate(phaseId: string): ValidationContract {
  return {
    schemaVersion: "1.0",
    phaseId,
    checks: [
      {
        id: "policy-compliance-check",
        objectiveRef: `${phaseId}-governance-objective`,
        verifyCommand: "npm run lint -- --policy",
        expectedSignal: "Policy compliance validated: 0 violations",
        owner: "team-platform",
        description: "Ensures all code follows governance policies",
      },
      {
        id: "architecture-diagram-validation",
        objectiveRef: `${phaseId}-architecture-objective`,
        verifyCommand: "npm run validate:architecture",
        expectedSignal: "Architecture diagrams: valid",
        owner: "team-architecture",
        description: "Validates architecture diagrams match decision records",
      },
      {
        id: "decision-traceability-check",
        objectiveRef: `${phaseId}-traceability-objective`,
        verifyCommand: "npm run check:decisions",
        expectedSignal: "All decisions traced to tasks",
        owner: "team-platform",
        description: "Ensures all phase decisions are traced to implementation tasks",
      },
    ],
    createdAt: currentDateISO(),
    updatedAt: currentDateISO(),
  };
}

/**
 * Minimal validation contract for testing or emergency scaffolding.
 * Contains no checks; to be populated by phase owner.
 */
export function minimalValidationContractTemplate(phaseId: string): ValidationContract {
  return {
    schemaVersion: "1.0",
    phaseId,
    checks: [],
    createdAt: currentDateISO(),
    updatedAt: currentDateISO(),
  };
}
