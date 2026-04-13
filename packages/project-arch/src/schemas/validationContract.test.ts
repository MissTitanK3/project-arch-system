import { describe, it, expect } from "vitest";
import { validationContractSchema, validationContractCheckSchema } from "./validationContract";

describe("validationContractCheckSchema", () => {
  it("should parse valid check object", () => {
    const check = {
      id: "governance-policy-enforcement",
      objectiveRef: "decision-policy-01",
      verifyCommand: "npm run lint -- --policy",
      expectedSignal: "All checks passed",
      owner: "team-platform",
    };

    expect(() => validationContractCheckSchema.parse(check)).not.toThrow();
  });

  it("should reject check missing required fields", () => {
    const incompleteCheck = {
      id: "check-1",
      objectiveRef: "objective-1",
      // missing verifyCommand, expectedSignal, owner
    };

    expect(() => validationContractCheckSchema.parse(incompleteCheck)).toThrow();
  });

  it("should accept optional description field", () => {
    const check = {
      id: "check-with-desc",
      objectiveRef: "objective-1",
      verifyCommand: "npm test",
      expectedSignal: "0 failures",
      owner: "team-qa",
      description: "Validates test coverage meets 80% threshold",
    };

    expect(() => validationContractCheckSchema.parse(check)).not.toThrow();
  });
});

describe("validationContractSchema", () => {
  it("should parse valid validation contract", () => {
    const contract = {
      schemaVersion: "2.0",
      phaseId: "phase-1",
      checks: [
        {
          id: "check-1",
          objectiveRef: "decision-01",
          verifyCommand: "npm run test",
          expectedSignal: "All tests pass",
          owner: "team-qa",
        },
      ],
      createdAt: "2026-03-22",
      updatedAt: "2026-03-22",
    };

    expect(() => validationContractSchema.parse(contract)).not.toThrow();
  });

  it("should reject contract with invalid schema version", () => {
    const invalidContract = {
      schemaVersion: "9.9",
      phaseId: "phase-1",
      checks: [],
      createdAt: "2026-03-22",
      updatedAt: "2026-03-22",
    };

    expect(() => validationContractSchema.parse(invalidContract)).toThrow();
  });

  it("should reject contract with invalid date format", () => {
    const invalidContract = {
      schemaVersion: "2.0",
      phaseId: "phase-1",
      checks: [],
      createdAt: "03-22-2026",
      updatedAt: "2026-03-22",
    };

    expect(() => validationContractSchema.parse(invalidContract)).toThrow();
  });

  it("should parse contract with multiple checks", () => {
    const contract = {
      schemaVersion: "2.0",
      phaseId: "phase-2",
      checks: [
        {
          id: "check-1",
          objectiveRef: "milestone-objective",
          verifyCommand: "npm run build",
          expectedSignal: "Build succeeded",
          owner: "team-build",
        },
        {
          id: "check-2",
          objectiveRef: "module-objective",
          verifyCommand: "npm run type-check",
          expectedSignal: "No type errors",
          owner: "team-infra",
          description: "Enforce strict TypeScript compilation",
        },
      ],
      createdAt: "2026-03-22",
      updatedAt: "2026-03-22",
    };

    expect(() => validationContractSchema.parse(contract)).not.toThrow();
  });
});
