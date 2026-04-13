import { describe, it, expect } from "vitest";
import { defaultConceptMapTemplate } from "./conceptMap";

describe("core/templates/conceptMap", () => {
  it("should return default concept map structure", () => {
    const template = defaultConceptMapTemplate();

    expect(template.schemaVersion).toBe("2.0");
    expect(Array.isArray(template.concepts)).toBe(true);
    expect(Array.isArray(template.dependencyGraph.nodes)).toBe(true);
    expect(Array.isArray(template.dependencyGraph.edges)).toBe(true);
    expect(Array.isArray(template.implementationChecklist)).toBe(true);
  });

  it("should include seeded concept mapping entry", () => {
    const template = defaultConceptMapTemplate();
    const concept = template.concepts[0];

    expect(concept.concept).toBe("example-concept");
    expect(concept.owningDomain).toBe("domain-name");
    expect(concept.status).toBe("proposed");
    expect(concept.relatedModules).toContain("packages/example");
    expect(concept.relatedTasks).toContain("001");
  });

  it("should include dependency graph and checklist placeholders", () => {
    const template = defaultConceptMapTemplate();

    expect(template.dependencyGraph.nodes).toContain("example-concept");
    expect(template.dependencyGraph.edges[0]).toEqual({
      from: "example-concept",
      to: "prerequisite-concept",
      type: "depends-on",
    });
    expect(template.implementationChecklist[0].concept).toBe("example-concept");
    expect(template.implementationChecklist[0].completed).toBe(false);
  });
});
