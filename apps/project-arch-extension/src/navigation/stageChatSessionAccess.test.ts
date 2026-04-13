import { describe, expect, it } from "vitest";
import { resolveStageChatSessionBoundary } from "./stageChatSessionAccess";

function createWorkspaceStateStore() {
  const values: Record<string, unknown> = {};
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
    update: async (key: string, value: unknown): Promise<void> => {
      values[key] = value;
    },
  };
}

describe("stageChatSessionAccess", () => {
  it("returns injected shared boundary when provided", () => {
    const injected = {
      buildThreadKey: () => "injected",
      lookupSession: () => ({ status: "missing", threadKey: "injected", isStale: false }) as const,
      openOrResume: async () => {
        throw new Error("not needed");
      },
      reset: async () => {
        throw new Error("not needed");
      },
      discard: async () => ({ operation: "discarded" as const, removed: false }),
      lookupHandoffs: () => ({ threadKey: "injected", handoffs: [] }),
      escalate: async () => {
        throw new Error("not needed");
      },
      deescalate: async () => {
        throw new Error("not needed");
      },
    };

    const resolved = resolveStageChatSessionBoundary({
      context: { workspaceState: createWorkspaceStateStore() },
      dependencies: { boundary: injected },
    });

    expect(resolved).toBe(injected);
  });

  it("creates a shared boundary backed by workspace state for navigation consumers", async () => {
    const resolved = resolveStageChatSessionBoundary({
      context: { workspaceState: createWorkspaceStateStore() },
    });

    const opened = await resolved.openOrResume({
      identity: { taskId: "004", stageId: "context" },
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
    });

    const lookup = resolved.lookupSession({
      identity: { taskId: "004", stageId: "context" },
      now: 1700000000100,
    });

    expect(opened.operation).toBe("opened");
    expect(lookup.status).toBe("found");
  });
});
