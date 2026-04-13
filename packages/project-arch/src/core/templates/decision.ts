import { DecisionFrontmatter } from "../../schemas/decision";
import { DecisionScope } from "../ids/decision";

export function defaultDecisionFrontmatter(params: {
  id: string;
  title: string;
  scope: DecisionScope;
}): DecisionFrontmatter {
  return {
    schemaVersion: "2.0",
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
    implementationStatus: {
      implemented: false,
      checklist: [],
    },
    impact: {
      scope: [],
      effort: "",
      risk: "",
    },
  };
}

export function defaultDecisionBody(): string {
  return [
    "## Context",
    "",
    "...",
    "",
    "## Decision Details",
    "",
    "...",
    "",
    "## Implementation Plan",
    "",
    "Steps required to implement this decision:",
    "",
    "- [ ] ...",
    "- [ ] ...",
    "",
    "## Verification",
    "",
    "How to verify this decision has been implemented:",
    "",
    "- ...",
    "",
  ].join("\n");
}
