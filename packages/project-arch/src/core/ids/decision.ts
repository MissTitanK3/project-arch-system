import { currentDateCompact } from "../../utils/date";

export type DecisionScope =
  | { kind: "project" }
  | { kind: "phase"; phaseId: string }
  | { kind: "milestone"; phaseId: string; milestoneId: string };

export function scopePrefix(scope: DecisionScope): string {
  if (scope.kind === "project") {
    return "project";
  }
  if (scope.kind === "phase") {
    return scope.phaseId;
  }
  return `${scope.phaseId}/${scope.milestoneId}`;
}

export function buildDecisionId(scope: DecisionScope, slug: string): string {
  return `${scopePrefix(scope)}:${currentDateCompact()}:${slug}`;
}
