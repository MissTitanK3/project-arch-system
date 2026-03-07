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
  };
}

export function defaultTaskBody(): string {
  return [
    "## Objective",
    "",
    "...",
    "",
    "## Implementation Plan",
    "",
    "...",
    "",
    "## Verification",
    "",
    "...",
    "",
  ].join("\n");
}
