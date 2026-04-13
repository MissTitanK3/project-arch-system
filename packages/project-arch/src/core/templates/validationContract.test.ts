import { describe, it, expect } from "vitest";
import {
  defaultValidationContractTemplate,
  minimalValidationContractTemplate,
} from "./validationContract";

describe("core/templates/validationContract", () => {
  it("builds default validation contract with deterministic structure", () => {
    const phaseId = "phase-2";
    const contract = defaultValidationContractTemplate(phaseId);

    expect(contract.schemaVersion).toBe("2.0");
    expect(contract.phaseId).toBe(phaseId);
    expect(contract.checks.length).toBe(3);
    expect(contract.checks.map((check) => check.id)).toEqual([
      "policy-compliance-check",
      "architecture-diagram-validation",
      "decision-traceability-check",
    ]);
    expect(contract.checks[0]?.objectiveRef).toBe(`${phaseId}-governance-objective`);
    expect(contract.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(contract.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds minimal validation contract with empty checks", () => {
    const contract = minimalValidationContractTemplate("phase-1");

    expect(contract.schemaVersion).toBe("2.0");
    expect(contract.phaseId).toBe("phase-1");
    expect(contract.checks).toEqual([]);
    expect(contract.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(contract.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
