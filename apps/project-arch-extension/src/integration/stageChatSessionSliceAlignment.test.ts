import { describe, expect, it } from "vitest";
import { resolveStageChatSessionBoundary } from "../navigation/stageChatSessionAccess";
import type { NormalizedTaskWorkflow } from "../navigation/taskWorkflowParser";
import {
  createStageChatSummarizedHistoryBoundary,
  DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY,
  type StageChatTurnRecord,
} from "./stageChatSummarizedHistoryBoundary";
import {
  DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY,
  DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY,
} from "./stageChatSessionBoundary";
import { DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY } from "./stageChatSessionStoreBoundary";

function createWorkspaceStateStore() {
  const values: Record<string, unknown> = {};
  return {
    values,
    store: {
      get: <T>(key: string): T | undefined => values[key] as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        values[key] = value;
      },
    },
  };
}

function createWorkflowFixture(): NormalizedTaskWorkflow {
  return {
    task: {
      id: "005",
      slug: "alignment-fixture",
      title: "Alignment Fixture",
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
          id: "implementation",
          title: "Implementation",
          runtimePreference: "cloud",
          source: "frontmatter",
          state: "in_progress",
          items: [
            {
              id: "impl-1",
              label: "Implement boundary",
              status: "planned",
              runtimePreference: "cloud",
              source: "frontmatter",
              evidencePaths: ["apps/project-arch-extension/src/integration/"],
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
        totalStages: 1,
        notStartedStages: 0,
        inProgressStages: 1,
        completedStages: 0,
        blockedStages: 0,
        overallState: "in_progress",
        items: {
          total: 1,
          planned: 1,
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

function createTurns(count: number): StageChatTurnRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `turn-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text:
      index % 3 === 0
        ? `Decision: keep thread continuity ${index + 1}`
        : index % 3 === 1
          ? `Next step: preserve compact transfer ${index + 1}`
          : `Key fact: bounded stage context ${index + 1}`,
    createdAt: 1700000001000 + index,
    estimatedTokens: 220,
  }));
}

describe("stageChatSessionSliceAlignment", () => {
  it("keeps one coherent milestone-2 substrate across seeding, summary retention, and handoff", async () => {
    const workspaceState = createWorkspaceStateStore();
    const canonicalTaskArtifact = {
      lane: "planned",
      status: "planned",
    };
    const workflow = createWorkflowFixture();

    const boundary = resolveStageChatSessionBoundary({
      context: { workspaceState: workspaceState.store },
    });
    const summarizedHistory = createStageChatSummarizedHistoryBoundary({
      stateStore: workspaceState.store,
    });

    const opened = await boundary.openOrResume({
      identity: { taskId: "005", stageId: "implementation" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
        codeTargets: ["apps/project-arch-extension/src/integration/"],
      },
    });

    const retained = await summarizedHistory.retainTurns({
      identity: { taskId: "005", stageId: "implementation" },
      turns: createTurns(20),
      now: 1700000001500,
    });

    const escalated = await boundary.escalate({
      identity: { taskId: "005", stageId: "implementation" },
      backingSessionId: "cloud-1",
      now: 1700000002000,
    });

    const deescalated = await boundary.deescalate({
      identity: { taskId: "005", stageId: "implementation" },
      backingSessionId: "local-2",
      now: 1700000004000,
    });

    const reset = await boundary.reset({
      identity: { taskId: "005", stageId: "implementation" },
      now: 1700000006000,
    });

    expect(opened.operation).toBe("opened");
    expect(opened.seedSource).toBe("created");
    expect(retained.summarized).toBe(true);
    expect(escalated.operation).toBe("escalated");
    expect(deescalated.operation).toBe("deescalated");
    expect(escalated.handoff?.direction).toBe("local-to-cloud");
    expect(deescalated.handoff?.direction).toBe("cloud-to-local");
    expect(escalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(deescalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(reset.session.logicalThreadId).not.toBe(opened.session.logicalThreadId);

    const persistedSessions = workspaceState.values[DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY] as
      | Record<string, unknown>
      | undefined;
    const persistedSeeds = workspaceState.values[DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY] as
      | Record<string, unknown>
      | undefined;
    const persistedSummaries = workspaceState.values[
      DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY
    ] as Record<string, unknown> | undefined;
    const persistedHandoffs = workspaceState.values[DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY] as
      | Record<string, unknown>
      | undefined;

    expect(persistedSessions).toBeTruthy();
    expect(persistedSeeds).toBeTruthy();
    expect(persistedSummaries).toBeTruthy();
    expect(persistedHandoffs).toBeTruthy();
    expect(Object.keys(persistedSessions ?? {})).toContain("005::implementation");
    expect(Object.keys(persistedSeeds ?? {})).toContain("005::implementation");
    expect(Object.keys(persistedSummaries ?? {})).toContain("005::implementation");
    expect(Object.keys(persistedHandoffs ?? {})).toContain("005::implementation");

    const discarded = await boundary.discard({
      identity: { taskId: "005", stageId: "implementation" },
    });

    const afterDiscard = boundary.lookupSession({
      identity: { taskId: "005", stageId: "implementation" },
      now: 1700000007000,
    });

    const seedsAfterDiscard = workspaceState.values[DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY] as
      | Record<string, unknown>
      | undefined;
    const summariesAfterDiscard = workspaceState.values[
      DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY
    ] as Record<string, unknown> | undefined;
    const handoffsAfterDiscard = workspaceState.values[DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY] as
      | Record<string, unknown>
      | undefined;

    expect(discarded.removed).toBe(true);
    expect(afterDiscard.status).toBe("missing");
    expect(Object.keys(seedsAfterDiscard ?? {})).not.toContain("005::implementation");
    expect(Object.keys(summariesAfterDiscard ?? {})).not.toContain("005::implementation");
    expect(Object.keys(handoffsAfterDiscard ?? {})).not.toContain("005::implementation");
    expect(canonicalTaskArtifact).toEqual({ lane: "planned", status: "planned" });
  });
});
