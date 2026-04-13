import { describe, expect, it } from "vitest";
import type { NormalizedTaskWorkflow } from "../navigation/taskWorkflowParser";
import {
  createStageChatSessionBoundary,
  DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY,
  DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY,
} from "./stageChatSessionBoundary";
import { DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY } from "./stageChatSummarizedHistoryBoundary";

function createMemoryStateStore(initial?: Record<string, unknown>) {
  const state: Record<string, unknown> = initial ? { ...initial } : {};

  return {
    store: {
      get: <T>(key: string): T | undefined => state[key] as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        state[key] = value;
      },
    },
  };
}

function createWorkflowFixture(): NormalizedTaskWorkflow {
  return {
    task: {
      id: "004",
      slug: "seed-fixture",
      title: "Seed Fixture",
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
          id: "context",
          title: "Context and Readiness",
          runtimePreference: "local",
          source: "frontmatter",
          state: "in_progress",
          items: [
            {
              id: "context-1",
              label: "Review context",
              status: "planned",
              runtimePreference: "local",
              source: "frontmatter",
              evidencePaths: ["docs/context.md"],
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
        {
          id: "implementation",
          title: "Implementation",
          runtimePreference: "cloud",
          source: "frontmatter",
          state: "not_started",
          items: [
            {
              id: "impl-1",
              label: "Build feature",
              status: "planned",
              runtimePreference: "cloud",
              source: "frontmatter",
              evidencePaths: ["src/feature.ts"],
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
        {
          id: "validation",
          title: "Validation",
          runtimePreference: "local",
          source: "frontmatter",
          state: "not_started",
          items: [
            {
              id: "val-1",
              label: "Run checks",
              status: "planned",
              runtimePreference: "local",
              source: "frontmatter",
              evidencePaths: ["TESTING.md"],
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
        totalStages: 3,
        notStartedStages: 2,
        inProgressStages: 1,
        completedStages: 0,
        blockedStages: 0,
        overallState: "in_progress",
        items: {
          total: 3,
          planned: 3,
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

describe("stageChatSessionBoundary", () => {
  it("provides shared open/resume and lookup behavior through one boundary", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "context" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
    });

    const resumed = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "context" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000001000,
    });

    const lookedUp = boundary.lookupSession({
      identity: { taskId: "004", stageId: "context" },
      now: 1700000001001,
    });

    expect(opened.operation).toBe("opened");
    expect(resumed.operation).toBe("resumed");
    expect(lookedUp.status).toBe("found");
    if (lookedUp.status === "found") {
      expect(lookedUp.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    }
  });

  it("preserves logical thread across escalation and de-escalation through the shared boundary", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "implementation" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
    });

    const escalated = await boundary.escalate({
      identity: { taskId: "004", stageId: "implementation" },
      backingSessionId: "cloud-1",
      now: 1700000002000,
    });

    const deescalated = await boundary.deescalate({
      identity: { taskId: "004", stageId: "implementation" },
      backingSessionId: "local-2",
      now: 1700000004000,
    });

    expect(escalated.operation).toBe("escalated");
    expect(deescalated.operation).toBe("deescalated");
    expect(escalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(deescalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
  });

  it("supports reset and discard via the same shared boundary", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "validation" },
      now: 1700000000000,
    });

    const reset = await boundary.reset({
      identity: { taskId: "004", stageId: "validation" },
      now: 1700000001000,
    });

    expect(reset.operation).toBe("reset");
    expect(reset.session.logicalThreadId).not.toBe(opened.session.logicalThreadId);

    const discarded = await boundary.discard({
      identity: { taskId: "004", stageId: "validation" },
    });
    const lookup = boundary.lookupSession({
      identity: { taskId: "004", stageId: "validation" },
      now: 1700000002000,
    });

    expect(discarded.removed).toBe(true);
    expect(lookup.status).toBe("missing");
  });

  it("seeds a newly opened session deterministically from task and stage context", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "context" },
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "context",
        codeTargets: ["apps/project-arch-extension/src/integration/"],
      },
    });

    const resumed = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "context" },
      now: 1700000001000,
      seedContext: {
        workflow,
        stageId: "context",
        codeTargets: ["apps/project-arch-extension/src/integration/"],
      },
    });

    expect(opened.operation).toBe("opened");
    expect(opened.seedSource).toBe("created");
    expect(opened.seed?.threadContext).toEqual({ taskId: "004", stageId: "context" });

    expect(resumed.operation).toBe("resumed");
    expect(resumed.seedSource).toBe("existing");
    expect(resumed.seed?.seedText).toBe(opened.seed?.seedText);
  });

  it("keeps seed context bounded to the selected stage", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "implementation" },
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
      },
    });

    expect(opened.seed?.seedText).toContain("Implementation");
    expect(opened.seed?.seedText).toContain("src/feature.ts");
    expect(opened.seed?.seedText).not.toContain("Context and Readiness");
    expect(opened.seed?.seedText).not.toContain("docs/context.md");
  });

  it("supports representative stage types with bounded seeding", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    const implementation = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "implementation" },
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
      },
    });

    const validation = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "validation" },
      now: 1700000001000,
      seedContext: {
        workflow,
        stageId: "validation",
      },
    });

    expect(implementation.seed?.seedText).toContain("## Stage");
    expect(implementation.seed?.seedText).toContain("- ID: implementation");
    expect(implementation.seed?.seedText).toContain("src/feature.ts");

    expect(validation.seed?.seedText).toContain("## Stage");
    expect(validation.seed?.seedText).toContain("- ID: validation");
    expect(validation.seed?.seedText).toContain("TESTING.md");
    expect(validation.seed?.seedText).not.toContain("src/feature.ts");
  });

  it("removes persisted seed state when a stage session is discarded", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "context" },
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "context",
      },
    });

    expect(opened.seedSource).toBe("created");

    const beforeDiscard = memory.store.get<Record<string, unknown>>(
      DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY,
    );
    expect(Object.keys(beforeDiscard ?? {})).toContain("004::context");

    await boundary.discard({
      identity: { taskId: "004", stageId: "context" },
    });

    const afterDiscard = memory.store.get<Record<string, unknown>>(
      DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY,
    );
    expect(Object.keys(afterDiscard ?? {})).not.toContain("004::context");
  });

  it("generates structured compact handoff summaries during runtime transitions", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    await boundary.openOrResume({
      identity: { taskId: "004", stageId: "implementation" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
        codeTargets: ["src/feature.ts"],
      },
    });

    await memory.store.update(DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY, {
      "004::implementation": {
        recentTurns: [],
        summarizedHistory: [],
        restoredAttachments: [],
        lastUpdatedAt: 1700000001000,
        rollingSummary: {
          keyFacts: ["Fact A", "Fact A", "Fact B", "Fact C", "Fact D", "Fact E", "Fact F"],
          decisions: ["Decision A", "Decision A", "Decision B"],
          nextSteps: ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Step 6"],
        },
      },
    });

    const escalated = await boundary.escalate({
      identity: { taskId: "004", stageId: "implementation" },
      backingSessionId: "cloud-1",
      now: 1700000002000,
      handoffContext: {
        currentGoal: "Complete implementation for review",
        openQuestions: ["What should be optimized first?", "What should be optimized first?"],
        pinnedNotes: ["Pinned 1", "Pinned 2", "Pinned 3", "Pinned 4", "Pinned 5", "Pinned 6"],
        referencedArtifacts: ["src/feature.ts", "README.md"],
      },
    });

    expect(escalated.operation).toBe("escalated");
    expect(escalated.handoff?.direction).toBe("local-to-cloud");
    expect(escalated.handoff?.summary.stage).toContain("Implementation");
    expect(escalated.handoff?.summary.currentGoal).toBe("Complete implementation for review");
    expect(escalated.handoff?.summary.keyFacts).toEqual([
      "Fact A",
      "Fact B",
      "Fact C",
      "Fact D",
      "Fact E",
    ]);
    expect(escalated.handoff?.summary.decisionsMade).toEqual(["Decision A", "Decision B"]);
    expect(escalated.handoff?.summary.openQuestions).toEqual(["What should be optimized first?"]);
    expect(escalated.handoff?.summary.proposedNextSteps).toEqual([
      "Step 1",
      "Step 2",
      "Step 3",
      "Step 4",
      "Step 5",
    ]);
    expect(escalated.handoff?.summary.pinnedNotes).toEqual([
      "Pinned 1",
      "Pinned 2",
      "Pinned 3",
      "Pinned 4",
      "Pinned 5",
    ]);
    expect(escalated.handoff?.summaryText).toContain("## Runtime Handoff Summary");
  });

  it("preserves one logical thread and records both escalation and de-escalation handoffs", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    const opened = await boundary.openOrResume({
      identity: { taskId: "004", stageId: "implementation" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
      },
    });

    await memory.store.update(DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY, {
      "004::implementation": {
        recentTurns: [],
        summarizedHistory: [],
        restoredAttachments: [],
        lastUpdatedAt: 1700000001000,
        rollingSummary: {
          keyFacts: ["Fact A"],
          decisions: ["Decision A"],
          nextSteps: ["Step A"],
        },
      },
    });

    const escalated = await boundary.escalate({
      identity: { taskId: "004", stageId: "implementation" },
      backingSessionId: "cloud-1",
      now: 1700000002000,
    });

    const deescalated = await boundary.deescalate({
      identity: { taskId: "004", stageId: "implementation" },
      backingSessionId: "local-2",
      now: 1700000003000,
    });

    expect(escalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(deescalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(escalated.handoff?.direction).toBe("local-to-cloud");
    expect(deescalated.handoff?.direction).toBe("cloud-to-local");

    const lookedUp = boundary.lookupHandoffs({
      identity: { taskId: "004", stageId: "implementation" },
    });
    expect(lookedUp.handoffs).toHaveLength(2);
    expect(lookedUp.handoffs[0]?.direction).toBe("local-to-cloud");
    expect(lookedUp.handoffs[1]?.direction).toBe("cloud-to-local");
  });

  it("cleans up handoff records when the stage session is discarded", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSessionBoundary({ stateStore: memory.store });
    const workflow = createWorkflowFixture();

    await boundary.openOrResume({
      identity: { taskId: "004", stageId: "implementation" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
      },
    });

    await memory.store.update(DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY, {
      "004::implementation": {
        recentTurns: [],
        summarizedHistory: [],
        restoredAttachments: [],
        lastUpdatedAt: 1700000001000,
        rollingSummary: {
          keyFacts: ["Fact A"],
          decisions: ["Decision A"],
          nextSteps: ["Step A"],
        },
      },
    });

    await boundary.escalate({
      identity: { taskId: "004", stageId: "implementation" },
      backingSessionId: "cloud-1",
      now: 1700000002000,
    });

    const beforeDiscard = memory.store.get<Record<string, unknown>>(
      DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY,
    );
    expect(Object.keys(beforeDiscard ?? {})).toContain("004::implementation");

    await boundary.discard({
      identity: { taskId: "004", stageId: "implementation" },
    });

    const afterDiscard = memory.store.get<Record<string, unknown>>(
      DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY,
    );
    expect(Object.keys(afterDiscard ?? {})).not.toContain("004::implementation");

    const summarizedAfterDiscard = memory.store.get<Record<string, unknown>>(
      DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY,
    );
    expect(Object.keys(summarizedAfterDiscard ?? {})).not.toContain("004::implementation");
  });
});
