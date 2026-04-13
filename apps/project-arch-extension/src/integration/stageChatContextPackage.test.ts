import { describe, expect, it } from "vitest";
import type { NormalizedTaskWorkflow } from "../navigation/taskWorkflowParser";
import {
  buildStageChatContextPackage,
  buildStageChatSeedMessage,
  type StageChatContextPackageInput,
  type StageChatContextRoutingState,
} from "./stageChatContextPackage";

// ─── Test fixtures ─────────────────────────────────────────────────────────

function createMinimalWorkflow(overrides?: {
  taskId?: string;
  stageId?: string;
  stageTitle?: string;
  stageDescription?: string;
}): NormalizedTaskWorkflow {
  const taskId = overrides?.taskId ?? "task-001";
  const stageId = overrides?.stageId ?? "context-and-readiness";
  const stageTitle = overrides?.stageTitle ?? "Context and Readiness";
  const stageDescription = overrides?.stageDescription;

  return {
    task: {
      id: taskId,
      slug: "test-task",
      title: "Test Task",
      lane: "planned",
      status: "in-progress",
      taskType: "implementation",
    },
    workflow: {
      schemaVersion: "2.0",
      template: "default-implementation",
      sources: {
        authoritativeWorkflow: "frontmatter",
        authoritativeCompletion: "frontmatter",
        supportingMarkdownMirror: "absent",
        supportingSections: [],
      },
      stages: [
        {
          id: stageId,
          title: stageTitle,
          description: stageDescription,
          runtimePreference: "local",
          source: "frontmatter",
          state: "in_progress",
          items: [
            {
              id: "item-1",
              label: "Review existing context",
              status: "planned",
              runtimePreference: "local",
              source: "frontmatter",
              evidencePaths: ["docs/context.md"],
            },
            {
              id: "item-2",
              label: "Confirm readiness criteria",
              status: "planned",
              runtimePreference: "local",
              source: "frontmatter",
              evidencePaths: ["docs/readiness.md"],
            },
          ],
          summary: {
            total: 2,
            planned: 2,
            inProgress: 0,
            done: 0,
            blocked: 0,
            skipped: 0,
            completionRatio: 0,
          },
        },
      ],
      summary: {
        totalStages: 1,
        notStartedStages: 0,
        inProgressStages: 1,
        completedStages: 0,
        blockedStages: 0,
        overallState: "in_progress",
        items: {
          total: 2,
          planned: 2,
          inProgress: 0,
          done: 0,
          blocked: 0,
          skipped: 0,
          completionRatio: 0,
        },
      },
    },
  };
}

function createMultiStageWorkflow(): NormalizedTaskWorkflow {
  return {
    task: {
      id: "task-002",
      slug: "multi-stage-task",
      title: "Multi Stage Task",
      lane: "planned",
      status: "in-progress",
      taskType: "spec",
    },
    workflow: {
      schemaVersion: "2.0",
      template: "default-implementation",
      sources: {
        authoritativeWorkflow: "frontmatter",
        authoritativeCompletion: "frontmatter",
        supportingMarkdownMirror: "absent",
        supportingSections: [],
      },
      stages: [
        {
          id: "task-refinement",
          title: "Task Refinement",
          runtimePreference: "local",
          source: "frontmatter",
          state: "completed",
          items: [
            {
              id: "refine-1",
              label: "Refine scope",
              status: "done",
              runtimePreference: "local",
              source: "frontmatter",
              evidencePaths: ["docs/scope.md"],
            },
          ],
          summary: {
            total: 1,
            planned: 0,
            inProgress: 0,
            done: 1,
            blocked: 0,
            skipped: 0,
            completionRatio: 1,
          },
        },
        {
          id: "implementation",
          title: "Implementation",
          runtimePreference: "cloud",
          source: "frontmatter",
          state: "not_started",
          items: [
            {
              id: "impl-1",
              label: "Write implementation",
              status: "planned",
              runtimePreference: "cloud",
              source: "frontmatter",
              evidencePaths: ["src/impl.ts", "src/impl.test.ts"],
            },
          ],
          summary: {
            total: 1,
            planned: 1,
            inProgress: 0,
            done: 0,
            blocked: 0,
            skipped: 0,
            completionRatio: 0,
          },
        },
      ],
      summary: {
        totalStages: 2,
        notStartedStages: 1,
        inProgressStages: 0,
        completedStages: 1,
        blockedStages: 0,
        overallState: "in_progress",
        items: {
          total: 2,
          planned: 1,
          inProgress: 0,
          done: 1,
          blocked: 0,
          skipped: 0,
          completionRatio: 0.5,
        },
      },
    },
  };
}

// ─── buildStageChatContextPackage ─────────────────────────────────────────

describe("buildStageChatContextPackage", () => {
  describe("required fields", () => {
    it("returns a package with required task and stage snapshots", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.task.id).toBe("task-001");
      expect(result.package.task.title).toBe("Test Task");
      expect(result.package.task.status).toBe("in-progress");
      expect(result.package.task.taskType).toBe("implementation");

      expect(result.package.stage.id).toBe("context-and-readiness");
      expect(result.package.stage.title).toBe("Context and Readiness");
      expect(result.package.stage.state).toBe("in_progress");
      expect(result.package.stage.runtimePreference).toBe("local");
    });

    it("includes checklist items from the selected stage", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.stage.items).toHaveLength(2);
      expect(result.package.stage.items[0]?.id).toBe("item-1");
      expect(result.package.stage.items[0]?.label).toBe("Review existing context");
      expect(result.package.stage.items[1]?.id).toBe("item-2");
    });

    it("preserves item notes and commandHint when present", () => {
      const workflow = createMinimalWorkflow();
      workflow.workflow.stages[0]!.items[0] = {
        ...workflow.workflow.stages[0]!.items[0]!,
        notes: "Refer to prior audit",
        commandHint: "pa check context",
      };

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.stage.items[0]?.notes).toBe("Refer to prior audit");
      expect(result.package.stage.items[0]?.commandHint).toBe("pa check context");
    });

    it("includes stage description when present", () => {
      const workflow = createMinimalWorkflow({
        stageDescription: "Verify everything is in scope and ready to proceed.",
      });

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.stage.description).toBe(
        "Verify everything is in scope and ready to proceed.",
      );
    });

    it("sets stage description to undefined when absent", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.stage.description).toBeUndefined();
    });
  });

  describe("optional fields", () => {
    it("defaults optional array fields to empty arrays when not provided", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.codeTargets).toEqual([]);
      expect(result.package.dependsOnTaskIds).toEqual([]);
      expect(result.package.blocksTaskIds).toEqual([]);
    });

    it("defaults routingState to undefined when not provided", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.routingState).toBeUndefined();
    });

    it("includes codeTargets when provided", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
        codeTargets: ["src/integration/", "src/navigation/"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.codeTargets).toEqual(["src/integration/", "src/navigation/"]);
    });

    it("includes dependsOnTaskIds and blocksTaskIds when provided", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
        dependsOnTaskIds: ["task-000"],
        blocksTaskIds: ["task-002", "task-003"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.dependsOnTaskIds).toEqual(["task-000"]);
      expect(result.package.blocksTaskIds).toEqual(["task-002", "task-003"]);
    });

    it("includes routingState when provided", () => {
      const workflow = createMinimalWorkflow();
      const routingState: StageChatContextRoutingState = {
        runtimePreference: "local",
        resolvedRuntimeClass: "local",
      };

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
        routingState,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.routingState?.runtimePreference).toBe("local");
      expect(result.package.routingState?.resolvedRuntimeClass).toBe("local");
    });

    it("sets bodySectionRef from the stage bodySection when present", () => {
      const workflow = createMinimalWorkflow();
      workflow.workflow.stages[0]!.bodySection = {
        kind: "scope",
        heading: "## Context and Readiness",
      };

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.bodySectionRef).toEqual({
        kind: "scope",
        heading: "## Context and Readiness",
      });
    });

    it("sets bodySectionRef to undefined when stage has no bodySection", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.bodySectionRef).toBeUndefined();
    });
  });

  describe("stage-bounded context rules", () => {
    it("scopes evidencePaths to the selected stage's items only", () => {
      const workflow = createMultiStageWorkflow();

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "implementation",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should include only the implementation stage's evidence paths,
      // not the task-refinement stage's paths.
      expect(result.package.evidencePaths).toEqual(["src/impl.ts", "src/impl.test.ts"]);
      expect(result.package.evidencePaths).not.toContain("docs/scope.md");
    });

    it("deduplicates evidencePaths when multiple items share the same path", () => {
      const workflow = createMinimalWorkflow();
      workflow.workflow.stages[0]!.items[0]!.evidencePaths = ["docs/shared.md", "docs/extra.md"];
      workflow.workflow.stages[0]!.items[1]!.evidencePaths = ["docs/shared.md"];

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.evidencePaths).toEqual(["docs/shared.md", "docs/extra.md"]);
    });

    it("does not include checklist items from other stages", () => {
      const workflow = createMultiStageWorkflow();

      const result = buildStageChatContextPackage({
        workflow,
        stageId: "task-refinement",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.package.stage.items).toHaveLength(1);
      expect(result.package.stage.items[0]?.id).toBe("refine-1");
    });

    it("does not forward the workflow stages list in the package", () => {
      const workflow = createMultiStageWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "task-refinement",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The package should not expose arbitrarily wide workflow data.
      const pkg = result.package as unknown as Record<string, unknown>;
      expect(pkg["stages"]).toBeUndefined();
      expect(pkg["workflow"]).toBeUndefined();
      expect(pkg["allStages"]).toBeUndefined();
    });
  });

  describe("error cases", () => {
    it("returns empty-task-id when the workflow task ID is empty", () => {
      const workflow = createMinimalWorkflow({ taskId: "" });
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBe("empty-task-id");
    });

    it("returns empty-task-id when the workflow task ID is only whitespace", () => {
      const workflow = createMinimalWorkflow({ taskId: "   " });
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "context-and-readiness",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBe("empty-task-id");
    });

    it("returns empty-stage-id when stageId is empty", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({ workflow, stageId: "" });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBe("empty-stage-id");
    });

    it("returns empty-stage-id when stageId is only whitespace", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({ workflow, stageId: "   " });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBe("empty-stage-id");
    });

    it("returns stage-not-found when the stageId does not match any stage", () => {
      const workflow = createMinimalWorkflow();
      const result = buildStageChatContextPackage({
        workflow,
        stageId: "nonexistent-stage",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBe("stage-not-found");
    });
  });
});

// ─── buildStageChatSeedMessage ─────────────────────────────────────────────

describe("buildStageChatSeedMessage", () => {
  it("returns a seed message with correct threadContext matching task and stage IDs", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.threadContext.taskId).toBe("task-001");
    expect(seed.threadContext.stageId).toBe("context-and-readiness");
  });

  it("includes task and stage identity in the seed text", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).toContain("task-001");
    expect(seed.seedText).toContain("Test Task");
    expect(seed.seedText).toContain("context-and-readiness");
    expect(seed.seedText).toContain("Context and Readiness");
  });

  it("includes checklist items in the seed text", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).toContain("Review existing context");
    expect(seed.seedText).toContain("Confirm readiness criteria");
  });

  it("omits the code targets section when codeTargets is empty", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).not.toContain("## Code Targets");
  });

  it("includes the code targets section when codeTargets is provided", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
      codeTargets: ["src/integration/", "src/navigation/"],
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).toContain("## Code Targets");
    expect(seed.seedText).toContain("src/integration/");
    expect(seed.seedText).toContain("src/navigation/");
  });

  it("omits the evidence section when evidencePaths is empty", () => {
    const workflow = createMinimalWorkflow();
    workflow.workflow.stages[0]!.items.forEach((item) => {
      item.evidencePaths = [];
    });

    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).not.toContain("## Evidence");
  });

  it("includes aggregated evidence paths from stage items", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).toContain("## Evidence");
    expect(seed.seedText).toContain("docs/context.md");
    expect(seed.seedText).toContain("docs/readiness.md");
  });

  it("omits depends-on and blocks sections when those fields are empty", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).not.toContain("## Depends On");
    expect(seed.seedText).not.toContain("## Blocks");
  });

  it("includes depends-on and blocks sections when provided", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
      dependsOnTaskIds: ["task-000"],
      blocksTaskIds: ["task-002"],
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).toContain("## Depends On");
    expect(seed.seedText).toContain("task-000");
    expect(seed.seedText).toContain("## Blocks");
    expect(seed.seedText).toContain("task-002");
  });

  it("omits the routing section when routingState is undefined", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).not.toContain("## Routing");
  });

  it("includes routing section with resolved class when routingState is provided", () => {
    const workflow = createMinimalWorkflow();
    const routingState: StageChatContextRoutingState = {
      runtimePreference: "local",
      resolvedRuntimeClass: "local",
    };

    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
      routingState,
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.seedText).toContain("## Routing");
    expect(seed.seedText).toContain("local");
  });

  it("creates deterministic seed text from the same context package", () => {
    const workflow = createMinimalWorkflow();
    const input: StageChatContextPackageInput = {
      workflow,
      stageId: "context-and-readiness",
      codeTargets: ["src/integration/"],
    };

    const r1 = buildStageChatContextPackage(input);
    const r2 = buildStageChatContextPackage(input);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    const seed1 = buildStageChatSeedMessage(r1.package);
    const seed2 = buildStageChatSeedMessage(r2.package);

    expect(seed1.seedText).toBe(seed2.seedText);
    expect(seed1.threadContext).toEqual(seed2.threadContext);
  });

  it("retains the original context package on the seed message", () => {
    const workflow = createMinimalWorkflow();
    const buildResult = buildStageChatContextPackage({
      workflow,
      stageId: "context-and-readiness",
    });

    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;

    const seed = buildStageChatSeedMessage(buildResult.package);

    expect(seed.contextPackage).toBe(buildResult.package);
  });
});
