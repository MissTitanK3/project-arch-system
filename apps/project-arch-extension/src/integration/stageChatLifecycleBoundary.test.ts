import { describe, expect, it } from "vitest";
import { createStageChatLifecycleBoundary } from "./stageChatLifecycleBoundary";
import {
  DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY,
  type StageChatSessionRecord,
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

function readSession(
  memory: ReturnType<typeof createMemoryStateStore>,
  threadKey: string,
): StageChatSessionRecord | undefined {
  const sessions = memory.state[DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY] as
    | Record<string, StageChatSessionRecord>
    | undefined;
  return sessions?.[threadKey];
}

describe("stageChatLifecycleBoundary", () => {
  it("opens a new stage-chat session when missing and resumes it when present", async () => {
    const boundary = createStageChatLifecycleBoundary();
    const memory = createMemoryStateStore();

    const opened = await boundary.openOrResume({
      identity: { taskId: "003", stageId: "context" },
      stateStore: memory.store,
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
    });

    const resumed = await boundary.openOrResume({
      identity: { taskId: "003", stageId: "context" },
      stateStore: memory.store,
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000001000,
    });

    expect(opened.operation).toBe("opened");
    expect(resumed.operation).toBe("resumed");
    expect(resumed.session.logicalThreadId).toBe(opened.session.logicalThreadId);
  });

  it("resets a session with a new logical thread id without mutating task artifacts", async () => {
    const boundary = createStageChatLifecycleBoundary();
    const memory = createMemoryStateStore();

    const opened = await boundary.openOrResume({
      identity: { taskId: "003", stageId: "validation" },
      stateStore: memory.store,
      now: 1700000000000,
    });

    const reset = await boundary.reset({
      identity: { taskId: "003", stageId: "validation" },
      stateStore: memory.store,
      now: 1700000002000,
    });

    expect(reset.operation).toBe("reset");
    expect(reset.priorSession?.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(reset.session.logicalThreadId).not.toBe(opened.session.logicalThreadId);
    expect(memory.state["feedback/task.md"]).toBeUndefined();
  });

  it("discards extension-owned session state for a task-stage key", async () => {
    const boundary = createStageChatLifecycleBoundary();
    const memory = createMemoryStateStore();

    await boundary.openOrResume({
      identity: { taskId: "003", stageId: "task-refinement" },
      stateStore: memory.store,
      now: 1700000000000,
    });

    const discarded = await boundary.discard({
      identity: { taskId: "003", stageId: "task-refinement" },
      stateStore: memory.store,
    });

    expect(discarded.operation).toBe("discarded");
    expect(discarded.removed).toBe(true);
    expect(readSession(memory, "003::task-refinement")).toBeUndefined();
  });

  it("preserves logical thread across escalation and de-escalation runtime transitions", async () => {
    const boundary = createStageChatLifecycleBoundary();
    const memory = createMemoryStateStore();

    const opened = await boundary.openOrResume({
      identity: { taskId: "003", stageId: "implementation" },
      stateStore: memory.store,
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
    });

    const escalated = await boundary.escalate({
      identity: { taskId: "003", stageId: "implementation" },
      stateStore: memory.store,
      backingSessionId: "cloud-1",
      now: 1700000003000,
    });

    const deescalated = await boundary.deescalate({
      identity: { taskId: "003", stageId: "implementation" },
      stateStore: memory.store,
      backingSessionId: "local-2",
      now: 1700000005000,
    });

    expect(escalated.operation).toBe("escalated");
    expect(deescalated.operation).toBe("deescalated");
    expect(escalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(deescalated.session.logicalThreadId).toBe(opened.session.logicalThreadId);
    expect(escalated.transition?.direction).toBe("local-to-cloud");
    expect(deescalated.transition?.direction).toBe("cloud-to-local");
    expect(deescalated.session.runtimeClass).toBe("local");
    expect(deescalated.session.backingSessionId).toBe("local-2");
  });
});
