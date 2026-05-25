import { describe, it, expect } from "vitest";
import { defaultConceptMapTemplate } from "./conceptMap";

describe("core/templates/conceptMap", () => {
  it("should return default concept map structure", () => {
    const template = defaultConceptMapTemplate();

    expect(template.schemaVersion).toBe("2.0");
    expect(Array.isArray(template.concepts)).toBe(true);
    expect(Array.isArray(template.domainModuleMapping)).toBe(true);
    expect(Array.isArray(template.implementationChecklist)).toBe(true);
  });

  it("should include seeded concept mapping entry", () => {
    const template = defaultConceptMapTemplate();
    const concept = template.concepts[0];

    expect(concept.id).toBe("concept-example");
    expect(concept.name).toBe("Example Concept");
    expect(concept.owningDomain).toBe("domain-name");
    expect(concept.moduleResponsibilities).toContain("packages/example");
    expect(concept.implementationSurfaces[0]?.path).toBe("packages/example/src");
  });

  it("should include domain mappings and checklist placeholders", () => {
    const template = defaultConceptMapTemplate();

    expect(template.domainModuleMapping[0]).toEqual({
      domain: "domain-name",
      module: "packages/example",
      responsibility: "Owns the core concept implementation.",
    });
    expect(template.implementationChecklist[0].conceptId).toBe("concept-example");
    expect(Array.isArray(template.implementationChecklist[0].checks)).toBe(true);
  });
});
