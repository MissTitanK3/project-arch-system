import { TaskFrontmatter, TaskLane } from "../../schemas/task";

export function defaultTaskFrontmatter(params: {
  id: string;
  slug: string;
  title: string;
  lane: TaskLane;
  createdAt: string;
  discoveredFromTask: string | null;
}): TaskFrontmatter {
  return {
    schemaVersion: "1.0",
    id: params.id,
    slug: params.slug,
    title: params.title,
    lane: params.lane,
    status: "todo",
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    discoveredFromTask: params.discoveredFromTask,
    tags: [],
    codeTargets: [],
    publicDocs: [],
    decisions: [],
    completionCriteria: [],
    scope: "",
    acceptanceChecks: [],
    evidence: [],
    traceLinks: [],
    dependsOn: [],
    blocks: [],
  };
}

export function defaultTaskBody(): string {
  return [
    "## Scope",
    "",
    "Define the boundaries of what this task will and will not deliver.",
    "",
    "...",
    "",
    "## Objective",
    "",
    "...",
    "",
    "## Acceptance Checks",
    "",
    "Specific conditions that must be satisfied for this task to be considered complete.",
    "",
    "- [ ] ...",
    "- [ ] ...",
    "",
    "## Implementation Plan",
    "",
    "...",
    "",
    "## Verification",
    "",
    "...",
    "",
    "## Evidence",
    "",
    "Links to artifacts, screenshots, test results, or documentation that prove completion.",
    "",
    "- ...",
    "",
    "## Trace Links",
    "",
    "Links to related concepts, domains, modules, or architectural decisions.",
    "",
    "- ...",
    "",
    "## Dependencies",
    "",
    "### Depends On",
    "",
    "Tasks that must be completed before this task can begin.",
    "",
    "- ...",
    "",
    "### Blocks",
    "",
    "Tasks that are waiting on this task to be completed.",
    "",
    "- ...",
    "",
  ].join("\n");
}
