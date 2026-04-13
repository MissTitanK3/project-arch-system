import { describe, expect, it } from "vitest";
import {
  deriveNormalizedTaskWorkflowStageState,
  knownTaskTypeSchema,
  normalizedTaskWorkflowSchema,
  summarizeNormalizedTaskWorkflowStages,
  summarizeTaskWorkflowItems,
  taskTypeSchema,
  taskWorkflowMetadataSchema,
} from "./taskWorkflow";

describe("schemas/taskWorkflow", () => {
  it("accepts known and future task types", () => {
    expect(knownTaskTypeSchema.parse("implementation")).toBe("implementation");
    expect(taskTypeSchema.parse("compliance-review")).toBe("compliance-review");
  });

  it("rejects invalid task type identifiers", () => {
    expect(() => taskTypeSchema.parse("Implementation")).toThrow();
    expect(() => taskTypeSchema.parse("bad type")).toThrow();
    expect(() => taskTypeSchema.parse("")).toThrow();
  });

  it("validates explicit workflow metadata with deterministic ordering fields", () => {
    const workflow = taskWorkflowMetadataSchema.parse({
      schemaVersion: "2.0",
      template: "spec-authoring",
      stages: [
        {
          id: "context-readiness",
          title: "Context and Readiness",
          runtimePreference: "local",
          items: [
            {
              id: "review-scope",
              label: "Review scope and objective",
              status: "done",
            },
          ],
        },
        {
          id: "implementation",
          title: "Implementation",
          runtimePreference: "hybrid",
          items: [
            {
              id: "codify-contract",
              label: "Codify the contract in docs and shared schemas",
              status: "in_progress",
              evidencePaths: ["feedback/8-task-workflow-guidance-spec.md"],
            },
          ],
        },
      ],
    });

    expect(workflow.template).toBe("spec-authoring");
    expect(workflow.stages[1]?.items[0]?.status).toBe("in_progress");
  });

  it("rejects duplicate stage and item identifiers", () => {
    expect(() =>
      taskWorkflowMetadataSchema.parse({
        schemaVersion: "2.0",
        template: "default-implementation",
        stages: [
          {
            id: "implementation",
            title: "Implementation",
            runtimePreference: "cloud",
            items: [
              {
                id: "implement-slice",
                label: "Implement the slice",
                status: "planned",
              },
            ],
          },
          {
            id: "implementation",
            title: "Implementation again",
            runtimePreference: "cloud",
            items: [
              {
                id: "implement-slice",
                label: "Implement the same slice again",
                status: "planned",
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("derives completion summaries and normalized stage state", () => {
    const summary = summarizeTaskWorkflowItems([
      { status: "done" },
      { status: "skipped" },
      { status: "planned" },
      { status: "blocked" },
    ]);

    expect(summary).toEqual({
      total: 4,
      planned: 1,
      inProgress: 0,
      done: 1,
      blocked: 1,
      skipped: 1,
      completionRatio: 0.5,
    });
    expect(deriveNormalizedTaskWorkflowStageState(summary)).toBe("blocked");
  });

  it("validates the normalized extension-facing workflow contract", () => {
    const stageOneSummary = summarizeTaskWorkflowItems([{ status: "done" }, { status: "done" }]);
    const stageTwoSummary = summarizeTaskWorkflowItems([
      { status: "in_progress" },
      { status: "planned" },
    ]);

    const normalized = normalizedTaskWorkflowSchema.parse({
      task: {
        id: "001",
        slug: "define-task-workflow-metadata-and-normalized-contract",
        title: "Define task workflow metadata and normalized contract",
        lane: "planned",
        status: "planned",
        taskType: "spec",
      },
      workflow: {
        schemaVersion: "2.0",
        template: "spec-authoring",
        sources: {
          authoritativeWorkflow: "frontmatter",
          authoritativeCompletion: "frontmatter",
          supportingMarkdownMirror: "present",
          supportingSections: [
            { kind: "acceptance-checks", heading: "Acceptance Checks" },
            { kind: "implementation-plan", heading: "Implementation Plan" },
            { kind: "verification", heading: "Verification" },
          ],
        },
        stages: [
          {
            id: "context-readiness",
            title: "Context and Readiness",
            runtimePreference: "local",
            source: "frontmatter",
            items: [
              {
                id: "review-scope",
                label: "Review scope and objective",
                status: "done",
                runtimePreference: "local",
                source: "frontmatter",
                evidencePaths: [],
              },
              {
                id: "inspect-evidence",
                label: "Inspect dependencies, blockers, and linked evidence",
                status: "done",
                runtimePreference: "local",
                source: "frontmatter",
                evidencePaths: [],
              },
            ],
            summary: stageOneSummary,
            state: deriveNormalizedTaskWorkflowStageState(stageOneSummary),
          },
          {
            id: "implementation",
            title: "Implementation",
            runtimePreference: "hybrid",
            source: "frontmatter",
            bodySection: { kind: "implementation-plan", heading: "Implementation Plan" },
            items: [
              {
                id: "codify-contract",
                label: "Codify the contract in docs and shared schemas",
                status: "in_progress",
                runtimePreference: "hybrid",
                source: "frontmatter",
                evidencePaths: ["packages/project-arch/src/schemas/taskWorkflow.ts"],
              },
              {
                id: "wire-task-frontmatter",
                label: "Wire the new metadata fields into task frontmatter validation",
                status: "planned",
                runtimePreference: "hybrid",
                source: "frontmatter",
                evidencePaths: ["packages/project-arch/src/schemas/task.ts"],
              },
            ],
            summary: stageTwoSummary,
            state: deriveNormalizedTaskWorkflowStageState(stageTwoSummary),
          },
        ],
        summary: summarizeNormalizedTaskWorkflowStages([
          {
            state: deriveNormalizedTaskWorkflowStageState(stageOneSummary),
            summary: stageOneSummary,
          },
          {
            state: deriveNormalizedTaskWorkflowStageState(stageTwoSummary),
            summary: stageTwoSummary,
          },
        ]),
      },
    });

    expect(normalized.workflow.summary.totalStages).toBe(2);
    expect(normalized.workflow.summary.completedStages).toBe(1);
    expect(normalized.workflow.summary.overallState).toBe("in_progress");
    expect(normalized.workflow.summary.items.total).toBe(4);
  });
});
