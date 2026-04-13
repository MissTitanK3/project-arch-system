import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTaskWorkflowMetadataBoundary } from "./taskWorkflowMetadataBoundary";

describe("taskWorkflowMetadataBoundary", () => {
  it("returns normalized workflow metadata for explicit 2.0 task files", () => {
    const boundary = createTaskWorkflowMetadataBoundary();
    const workspaceRoot = "/repo";
    const absolutePath = path.join(
      workspaceRoot,
      "feedback/phases/phase-a/milestones/m-1/tasks/planned/004-alignment.md",
    );

    const parsed = boundary.parseTaskWorkflowMetadata({
      workspaceRoot,
      absolutePath,
      content: [
        "---",
        'id: "004"',
        'title: "Alignment boundary"',
        "lane: planned",
        'status: "planned"',
        "taskType: integration",
        "workflow:",
        '  schemaVersion: "2.0"',
        '  template: "integration-delivery"',
        "  stages:",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: cloud",
        "      items:",
        "        - id: align-boundary",
        '          label: "Align shared boundary"',
        "          status: in_progress",
        "---",
      ].join("\n"),
    });

    expect(parsed.taskId).toBe("004");
    expect(parsed.title).toBe("Alignment boundary");
    expect(parsed.lane).toBe("planned");
    expect(parsed.taskWorkflow?.workflow.sources.authoritativeWorkflow).toBe("frontmatter");
    expect(parsed.taskWorkflow?.workflow.stages[0]?.items[0]?.status).toBe("in_progress");
  });

  it("falls back to normalized default workflow when explicit workflow metadata is invalid", () => {
    const boundary = createTaskWorkflowMetadataBoundary();
    const workspaceRoot = "/repo";
    const absolutePath = path.join(
      workspaceRoot,
      "feedback/phases/phase-a/milestones/m-1/tasks/discovered/007-fallback.md",
    );

    const parsed = boundary.parseTaskWorkflowMetadata({
      workspaceRoot,
      absolutePath,
      content: [
        "---",
        'id: "007"',
        'title: "Fallback metadata"',
        "lane: discovered",
        'status: "planned"',
        "workflow:",
        '  schemaVersion: "2.0"',
        "---",
      ].join("\n"),
    });

    expect(parsed.taskId).toBe("007");
    expect(parsed.title).toBe("Fallback metadata");
    expect(parsed.lane).toBe("discovered");
    expect(parsed.status).toBe("planned");
    expect(parsed.taskWorkflow?.workflow.sources.authoritativeWorkflow).toBe("task-type-default");
    expect(parsed.taskWorkflow?.task.id).toBe("007");
  });
});
