import { describe, it, expect } from "vitest";
import { conceptMapSchema } from "./conceptMap";

describe("schemas/conceptMap", () => {
  const validConceptMap = {
    schemaVersion: "1.0",
    concepts: [
      {
        id: "concept-a",
        name: "Concept A",
        description: "Example concept",
        owningDomain: "core",
        moduleResponsibilities: ["packages/api"],
        implementationSurfaces: [{ type: "api", path: "packages/api/src/a" }],
        dependencies: ["concept-b"],
      },
    ],
    domainModuleMapping: [
      {
        domain: "core",
        module: "packages/api",
        responsibility: "Owns concept-a runtime behavior",
      },
    ],
    implementationChecklist: [
      {
        conceptId: "concept-a",
        checks: ["Decision linkage recorded", "Targets captured"],
      },
    ],
  };

  it("accepts valid concept-map structure", () => {
    expect(conceptMapSchema.parse(validConceptMap)).toEqual(validConceptMap);
  });

  it("rejects missing required sections", () => {
    expect(() =>
      conceptMapSchema.parse({
        schemaVersion: "1.0",
        concepts: [],
      }),
    ).toThrow();
  });

  it("rejects malformed concept entries", () => {
    expect(() =>
      conceptMapSchema.parse({
        ...validConceptMap,
        concepts: [
          {
            id: "",
            name: "",
            description: "",
            owningDomain: "",
            moduleResponsibilities: [],
            implementationSurfaces: [],
            dependencies: [],
          },
        ],
      }),
    ).toThrow();
  });
});
