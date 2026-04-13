import { describe, expect, it } from "vitest";
import {
  createStageChatSummarizedHistoryBoundary,
  DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY,
  type StageChatTurnRecord,
} from "./stageChatSummarizedHistoryBoundary";

function createMemoryStateStore(initial?: Record<string, unknown>) {
  const state: Record<string, unknown> = initial ? { ...initial } : {};

  return {
    state,
    store: {
      get: <T>(key: string): T | undefined => state[key] as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        state[key] = value;
      },
    },
  };
}

function createTurns(count: number, seed = "fact"): StageChatTurnRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${seed}-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text:
      index % 3 === 0
        ? `Decision: keep stage bounded ${index + 1}`
        : index % 3 === 1
          ? `Next step: validate retention ${index + 1}`
          : `Key fact: this is turn ${index + 1}`,
    createdAt: 1700000000000 + index,
    estimatedTokens: 200,
  }));
}

describe("stageChatSummarizedHistoryBoundary", () => {
  it("creates rolling summary once retained turns exceed threshold", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 16,
      retainRecentTurns: 16,
    });

    const result = await boundary.retainTurns({
      identity: { taskId: "003", stageId: "context" },
      turns: createTurns(20, "turn"),
      now: 1700000010000,
    });

    expect(result.summarized).toBe(true);
    expect(result.summarizedHistoryEntry).toBeTruthy();
    expect(result.state.recentTurns).toHaveLength(16);
    expect(result.state.summarizedHistory).toHaveLength(1);
    expect(result.state.rollingSummary.keyFacts.length).toBeGreaterThan(0);
  });

  it("also summarizes when estimated tokens exceed threshold while keeping at least 10 turns", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 999,
      summarizeAfterEstimatedTokens: 1200,
      retainRecentTurns: 16,
    });

    const result = await boundary.retainTurns({
      identity: { taskId: "003", stageId: "validation" },
      turns: createTurns(14, "token"),
      now: 1700000011000,
    });

    expect(result.summarized).toBe(true);
    expect(result.state.recentTurns.length).toBeGreaterThanOrEqual(10);
    expect(result.state.recentTurns.length).toBeLessThan(14);
    expect(result.state.summarizedHistory.length).toBe(1);
  });

  it("deduplicates obvious repeated facts, decisions, and next steps conservatively", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 10,
      retainRecentTurns: 10,
    });

    const duplicateTurns: StageChatTurnRecord[] = [
      {
        id: "dup-1",
        role: "assistant",
        text: "Decision: Keep local first",
        createdAt: 1700000012001,
      },
      {
        id: "dup-2",
        role: "assistant",
        text: "Next step: add focused tests",
        createdAt: 1700000012002,
      },
      {
        id: "dup-3",
        role: "assistant",
        text: "Key fact: scope is stage-bounded",
        createdAt: 1700000012003,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `dup-${index + 4}`,
        role: "assistant" as const,
        text:
          index % 3 === 0
            ? "decision: keep   local first"
            : index % 3 === 1
              ? "next step: add focused tests"
              : "key fact: scope is stage-bounded",
        createdAt: 1700000012004 + index,
      })),
    ];

    const result = await boundary.retainTurns({
      identity: { taskId: "003", stageId: "implementation" },
      turns: duplicateTurns,
      now: 1700000013000,
    });

    expect(result.summarized).toBe(true);
    expect(result.state.rollingSummary.decisions).toEqual(["Decision: Keep local first"]);
    expect(result.state.rollingSummary.nextSteps).toEqual(["Next step: add focused tests"]);
    expect(result.state.rollingSummary.keyFacts).toEqual(["Key fact: scope is stage-bounded"]);
  });

  it("allows inspect-first summarized history without widening active context", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 10,
      retainRecentTurns: 10,
    });

    await boundary.retainTurns({
      identity: { taskId: "003", stageId: "context" },
      turns: createTurns(14, "inspect"),
      now: 1700000014000,
    });

    const beforeInspect = boundary.getThreadState({
      identity: { taskId: "003", stageId: "context" },
    });

    const inspected = boundary.inspectSummarizedHistory({
      identity: { taskId: "003", stageId: "context" },
    });

    const afterInspect = boundary.getThreadState({
      identity: { taskId: "003", stageId: "context" },
    });

    expect(inspected.entries.length).toBeGreaterThan(0);
    expect(afterInspect.state.restoredAttachments).toHaveLength(
      beforeInspect.state.restoredAttachments.length,
    );
    expect(afterInspect.state.recentTurns).toEqual(beforeInspect.state.recentTurns);
  });

  it("attaches restored history temporarily only when explicitly requested", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 10,
      retainRecentTurns: 10,
    });

    await boundary.retainTurns({
      identity: { taskId: "003", stageId: "validation" },
      turns: createTurns(14, "restore"),
      now: 1700000015000,
    });

    const beforeRestore = boundary.getThreadState({
      identity: { taskId: "003", stageId: "validation" },
    });

    const attached = await boundary.useHistoryInChat({
      identity: { taskId: "003", stageId: "validation" },
      now: 1700000016000,
    });

    expect(attached.operation).toBe("attached");
    expect(attached.attachment?.mode).toBe("temporary");

    const afterRestore = boundary.getThreadState({
      identity: { taskId: "003", stageId: "validation" },
    });

    expect(afterRestore.state.restoredAttachments.length).toBe(
      beforeRestore.state.restoredAttachments.length + 1,
    );
    expect(afterRestore.state.rollingSummary).toEqual(beforeRestore.state.rollingSummary);
  });

  it("promotes restored history incrementally without replacing existing summary", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 4,
      retainRecentTurns: 4,
    });

    await boundary.retainTurns({
      identity: { taskId: "003", stageId: "context" },
      turns: createTurns(8, "promote-a"),
      now: 1700000017000,
    });

    await boundary.retainTurns({
      identity: { taskId: "003", stageId: "context" },
      turns: createTurns(8, "promote-b"),
      now: 1700000018000,
    });

    const attached = await boundary.useHistoryInChat({
      identity: { taskId: "003", stageId: "context" },
      now: 1700000019000,
    });

    expect(attached.operation).toBe("attached");
    if (!attached.attachment) {
      throw new Error("Expected attachment to be created");
    }

    const beforePromotion = boundary.getThreadState({
      identity: { taskId: "003", stageId: "context" },
    });

    const promoted = await boundary.promoteRestoredHistory({
      identity: { taskId: "003", stageId: "context" },
      attachmentId: attached.attachment.id,
      now: 1700000020000,
    });

    expect(promoted.operation).toBe("promoted");
    expect(promoted.state.rollingSummary.keyFacts.length).toBeGreaterThanOrEqual(
      beforePromotion.state.rollingSummary.keyFacts.length,
    );
    expect(promoted.state.rollingSummary.decisions.length).toBeGreaterThanOrEqual(
      beforePromotion.state.rollingSummary.decisions.length,
    );
    expect(promoted.state.rollingSummary.nextSteps.length).toBeGreaterThanOrEqual(
      beforePromotion.state.rollingSummary.nextSteps.length,
    );

    const promotedAttachment = promoted.state.restoredAttachments.find(
      (item) => item.id === attached.attachment?.id,
    );
    expect(promotedAttachment?.promotedAt).toBe(1700000020000);
  });

  it("keeps state in extension-owned storage and supports discard", async () => {
    const memory = createMemoryStateStore();
    const boundary = createStageChatSummarizedHistoryBoundary({
      stateStore: memory.store,
      summarizeAfterTurns: 4,
      retainRecentTurns: 4,
    });

    await boundary.retainTurns({
      identity: { taskId: "003", stageId: "context" },
      turns: createTurns(8, "owned"),
      now: 1700000021000,
    });

    const storedBefore = memory.state[DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY] as
      | Record<string, unknown>
      | undefined;
    expect(Object.keys(storedBefore ?? {})).toContain("003::context");

    const discarded = await boundary.discard({
      identity: { taskId: "003", stageId: "context" },
    });

    const storedAfter = memory.state[DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY] as
      | Record<string, unknown>
      | undefined;

    expect(discarded.removed).toBe(true);
    expect(Object.keys(storedAfter ?? {})).not.toContain("003::context");
  });
});
