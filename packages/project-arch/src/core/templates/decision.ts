import { DecisionFrontmatter } from "../../schemas/decision";
import { DecisionScope } from "../ids/decision";

export function defaultDecisionFrontmatter(params: {
  id: string;
  title: string;
  scope: DecisionScope;
}): DecisionFrontmatter {
  return {
    schemaVersion: "1.0",
    type: "decision",
    id: params.id,
    title: params.title,
    status: "proposed",
    scope: params.scope,
    drivers: [],
    decision: {
      summary: "...",
    },
    alternatives: [],
    consequences: {
      positive: [],
      negative: [],
    },
    links: {
      tasks: [],
      codeTargets: [],
      publicDocs: [],
    },
  };
}

export function defaultDecisionBody(): string {
  return "\n";
}
