import { describe, expect, it } from "vitest";
import {
  createStageChatSessionStoreBoundary,
  DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY,
} from "./stageChatSessionStoreBoundary";

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

describe("stageChatSessionStoreBoundary", () => {
  it("stores and retrieves a session by task and stage identity", async () => {
    const boundary = createStageChatSessionStoreBoundary();
    const memory = createMemoryStateStore();

    const stored = await boundary.upsertSession({
      identity: { taskId: "001", stageId: "context-and-readiness" },
      logicalThreadId: "thread-001-context",
      backingSessionId: "local-session-1",
      at: 1700000000000,
      stateStore: memory.store,
    });

    const lookup = boundary.lookupSession({
      identity: { taskId: "001", stageId: "context-and-readiness" },
      stateStore: memory.store,
      now: 1700000001000,
      staleAfterMs: 60_000,
    });

    expect(stored.threadKey).toBe("001::context-and-readiness");
    expect(lookup.status).toBe("found");
    if (lookup.status === "found") {
      expect(lookup.session.threadKey).toBe("001::context-and-readiness");
      expect(lookup.session.logicalThreadId).toBe("thread-001-context");
      expect(lookup.session.backingSessionId).toBe("local-session-1");
    }
  });

  it("returns missing when no persisted session exists for task-stage key", () => {
    const boundary = createStageChatSessionStoreBoundary();
    const memory = createMemoryStateStore();

    const lookup = boundary.lookupSession({
      identity: { taskId: "001", stageId: "validation" },
      stateStore: memory.store,
    });

    expect(lookup.status).toBe("missing");
    expect(lookup.threadKey).toBe("001::validation");
  });

  it("flags persisted sessions as stale when age exceeds threshold", async () => {
    const boundary = createStageChatSessionStoreBoundary();
    const memory = createMemoryStateStore();

    await boundary.upsertSession({
      identity: { taskId: "001", stageId: "task-refinement" },
      logicalThreadId: "thread-001-refine",
      at: 1700000000000,
      stateStore: memory.store,
    });

    const lookup = boundary.lookupSession({
      identity: { taskId: "001", stageId: "task-refinement" },
      stateStore: memory.store,
      now: 1700000200000,
      staleAfterMs: 10_000,
    });

    expect(lookup.status).toBe("stale");
    if (lookup.status === "stale") {
      expect(lookup.staleReason).toBe("age-threshold");
      expect(lookup.staleAgeMs).toBeGreaterThan(10_000);
    }
  });

  it("uses extension-owned state key and keeps records out of task artifacts", async () => {
    const boundary = createStageChatSessionStoreBoundary();
    const memory = createMemoryStateStore();

    await boundary.upsertSession({
      identity: { taskId: "002", stageId: "validation" },
      stateStore: memory.store,
      at: 1700000000000,
    });

    const raw = memory.state[DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY] as Record<string, unknown>;
    expect(raw).toBeTruthy();
    expect(Object.keys(raw)).toContain("002::validation");
  });
});
