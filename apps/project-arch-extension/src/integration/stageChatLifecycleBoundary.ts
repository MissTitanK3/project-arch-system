import {
  createStageChatSessionStoreBoundary,
  type StageChatSessionIdentity,
  type StageChatSessionRecord,
  type StageChatSessionStateStore,
  type StageChatSessionStoreBoundary,
} from "./stageChatSessionStoreBoundary";

export interface StageChatLifecycleTransition {
  direction: "local-to-cloud" | "cloud-to-local";
  fromRuntime: "local" | "cloud";
  toRuntime: "local" | "cloud";
  reason: "manual-escalation" | "manual-deescalation";
  at: number;
}

export interface StageChatLifecycleBoundary {
  openOrResume(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    backingSessionId?: string;
    runtimeClass?: "local" | "cloud";
    now?: number;
  }): Promise<{
    operation: "opened" | "resumed";
    session: StageChatSessionRecord;
    wasStale: boolean;
  }>;
  reset(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    now?: number;
    runtimeClass?: "local" | "cloud";
    backingSessionId?: string;
  }): Promise<{
    operation: "reset";
    priorSession?: StageChatSessionRecord;
    session: StageChatSessionRecord;
  }>;
  discard(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
  }): Promise<{
    operation: "discarded";
    removed: boolean;
  }>;
  escalate(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    backingSessionId?: string;
    now?: number;
  }): Promise<{
    operation: "escalated" | "opened";
    session: StageChatSessionRecord;
    transition?: StageChatLifecycleTransition;
  }>;
  deescalate(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    backingSessionId?: string;
    now?: number;
  }): Promise<{
    operation: "deescalated" | "opened";
    session: StageChatSessionRecord;
    transition?: StageChatLifecycleTransition;
  }>;
}

function createResetLogicalThreadId(threadKey: string, at: number): string {
  return `${threadKey}::reset::${at}`;
}

export function createStageChatLifecycleBoundary(input?: {
  storeBoundary?: StageChatSessionStoreBoundary;
}): StageChatLifecycleBoundary {
  const store = input?.storeBoundary ?? createStageChatSessionStoreBoundary();

  return {
    async openOrResume(input) {
      const now = input.now ?? Date.now();
      const lookup = store.lookupSession({
        identity: input.identity,
        stateStore: input.stateStore,
        now,
      });

      if (lookup.status === "missing") {
        const session = await store.upsertSession({
          identity: input.identity,
          stateStore: input.stateStore,
          at: now,
          backingSessionId: input.backingSessionId,
          runtimeClass: input.runtimeClass,
        });

        return {
          operation: "opened" as const,
          session,
          wasStale: false,
        };
      }

      const session = await store.upsertSession({
        identity: input.identity,
        stateStore: input.stateStore,
        at: now,
        logicalThreadId: lookup.session.logicalThreadId,
        backingSessionId: input.backingSessionId,
        runtimeClass: input.runtimeClass,
      });

      return {
        operation: "resumed" as const,
        session,
        wasStale: lookup.status === "stale",
      };
    },

    async reset(input) {
      const now = input.now ?? Date.now();
      const lookup = store.lookupSession({
        identity: input.identity,
        stateStore: input.stateStore,
        now,
      });

      const threadKey = store.buildThreadKey(input.identity);
      if (!threadKey) {
        throw new Error("Cannot reset stage-chat session without taskId and stageId.");
      }

      const session = await store.upsertSession({
        identity: input.identity,
        stateStore: input.stateStore,
        at: now,
        logicalThreadId: createResetLogicalThreadId(threadKey, now),
        backingSessionId: input.backingSessionId,
        runtimeClass: input.runtimeClass,
      });

      return {
        operation: "reset" as const,
        ...(lookup.status === "missing" ? {} : { priorSession: lookup.session }),
        session,
      };
    },

    async discard(input) {
      const removed = await store.deleteSession({
        identity: input.identity,
        stateStore: input.stateStore,
      });

      return {
        operation: "discarded" as const,
        removed,
      };
    },

    async escalate(input) {
      const now = input.now ?? Date.now();
      const lookup = store.lookupSession({
        identity: input.identity,
        stateStore: input.stateStore,
        now,
      });

      if (lookup.status === "missing") {
        const session = await store.upsertSession({
          identity: input.identity,
          stateStore: input.stateStore,
          at: now,
          runtimeClass: "cloud",
          backingSessionId: input.backingSessionId,
        });

        return {
          operation: "opened" as const,
          session,
        };
      }

      const fromRuntime = lookup.session.runtimeClass ?? "local";
      const session = await store.upsertSession({
        identity: input.identity,
        stateStore: input.stateStore,
        at: now,
        logicalThreadId: lookup.session.logicalThreadId,
        runtimeClass: "cloud",
        backingSessionId: input.backingSessionId,
      });

      return {
        operation: "escalated" as const,
        session,
        ...(fromRuntime === "cloud"
          ? {}
          : {
              transition: {
                direction: "local-to-cloud" as const,
                fromRuntime,
                toRuntime: "cloud" as const,
                reason: "manual-escalation" as const,
                at: now,
              },
            }),
      };
    },

    async deescalate(input) {
      const now = input.now ?? Date.now();
      const lookup = store.lookupSession({
        identity: input.identity,
        stateStore: input.stateStore,
        now,
      });

      if (lookup.status === "missing") {
        const session = await store.upsertSession({
          identity: input.identity,
          stateStore: input.stateStore,
          at: now,
          runtimeClass: "local",
          backingSessionId: input.backingSessionId,
        });

        return {
          operation: "opened" as const,
          session,
        };
      }

      const fromRuntime = lookup.session.runtimeClass ?? "cloud";
      const session = await store.upsertSession({
        identity: input.identity,
        stateStore: input.stateStore,
        at: now,
        logicalThreadId: lookup.session.logicalThreadId,
        runtimeClass: "local",
        backingSessionId: input.backingSessionId,
      });

      return {
        operation: "deescalated" as const,
        session,
        ...(fromRuntime === "local"
          ? {}
          : {
              transition: {
                direction: "cloud-to-local" as const,
                fromRuntime,
                toRuntime: "local" as const,
                reason: "manual-deescalation" as const,
                at: now,
              },
            }),
      };
    },
  };
}
