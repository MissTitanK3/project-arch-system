/**
 * Concept-to-Artifact Mapping Template
 *
 * USAGE TIMING: Once per milestone during planning or when reviewing architectural traceability.
 *
 * DO NOT use during:
 * - Individual task implementation
 * - Every code change
 *
 * Typical frequency: Once per milestone (updated as needed)
 */

export interface ConceptMapping {
  id: string;
  name: string;
  description: string;
  owningDomain: string;
  moduleResponsibilities: string[];
  implementationSurfaces: Array<{
    type: string;
    path: string;
    description?: string;
  }>;
  dependencies: string[];
}

export interface ConceptMap {
  schemaVersion: string;
  concepts: ConceptMapping[];
  domainModuleMapping: Array<{
    domain: string;
    module: string;
    responsibility: string;
  }>;
  implementationChecklist: Array<{
    conceptId: string;
    checks: string[];
  }>;
}

export function defaultConceptMapTemplate(): ConceptMap {
  return {
    schemaVersion: "2.0",
    concepts: [
      {
        id: "concept-example",
        name: "Example Concept",
        description: "Description of what this concept represents",
        owningDomain: "domain-name",
        moduleResponsibilities: ["packages/example", "apps/example"],
        implementationSurfaces: [
          {
            type: "service",
            path: "packages/example/src",
            description: "Primary implementation surface for the concept.",
          },
        ],
        dependencies: ["prerequisite-concept"],
      },
    ],
    domainModuleMapping: [
      {
        domain: "domain-name",
        module: "packages/example",
        responsibility: "Owns the core concept implementation.",
      },
    ],
    implementationChecklist: [
      {
        conceptId: "concept-example",
        checks: [
          "Document responsibilities in architecture/metadata/codebase-map/concept-map.json",
        ],
      },
    ],
  };
}
