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
  concept: string;
  description: string;
  owningDomain: string;
  relatedModules: string[];
  relatedTasks: string[];
  relatedDecisions: string[];
  dependencies: string[];
  status: "proposed" | "in-progress" | "implemented";
}

export interface ConceptMap {
  schemaVersion: string;
  concepts: ConceptMapping[];
  dependencyGraph: {
    nodes: string[];
    edges: Array<{ from: string; to: string; type: string }>;
  };
  implementationChecklist: Array<{
    concept: string;
    completed: boolean;
    blockers: string[];
  }>;
}

export function defaultConceptMapTemplate(): ConceptMap {
  return {
    schemaVersion: "1.0",
    concepts: [
      {
        concept: "example-concept",
        description: "Description of what this concept represents",
        owningDomain: "domain-name",
        relatedModules: ["packages/example", "apps/example"],
        relatedTasks: ["001", "002"],
        relatedDecisions: ["ADR-001"],
        dependencies: ["prerequisite-concept"],
        status: "proposed",
      },
    ],
    dependencyGraph: {
      nodes: ["example-concept", "prerequisite-concept"],
      edges: [
        {
          from: "example-concept",
          to: "prerequisite-concept",
          type: "depends-on",
        },
      ],
    },
    implementationChecklist: [
      {
        concept: "example-concept",
        completed: false,
        blockers: [],
      },
    ],
  };
}
