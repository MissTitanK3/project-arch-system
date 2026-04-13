import {
  createStageChatLifecycleBoundary,
  type StageChatLifecycleBoundary,
  type StageChatLifecycleTransition,
} from "./stageChatLifecycleBoundary";
import {
  buildStageChatContextPackage,
  buildStageChatSeedMessage,
  type StageChatContextPackageInput,
  type StageChatSeedMessage,
} from "./stageChatContextPackage";
import {
  DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY,
  type StageChatSummarizedHistoryThreadState,
} from "./stageChatSummarizedHistoryBoundary";
import {
  buildStageChatTransferSummary,
  formatStageChatTransferSummary,
  type StageChatTransferSummary,
} from "./stageChatRuntimeHandoff";
import {
  createStageChatSessionStoreBoundary,
  type StageChatSessionIdentity,
  type StageChatSessionLookupResult,
  type StageChatSessionRecord,
  type StageChatSessionStateStore,
  type StageChatSessionStoreBoundary,
} from "./stageChatSessionStoreBoundary";

export const DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY = "projectArch.stageChat.seeds.v1" as const;
export const DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY = "projectArch.stageChat.handoffs.v1" as const;

interface StageChatSeedStateRecord {
  seed: StageChatSeedMessage;
  seededAt: number;
  updatedAt: number;
}

export interface StageChatRuntimeHandoffRecord {
  id: string;
  threadKey: string;
  direction: "local-to-cloud" | "cloud-to-local";
  fromRuntime: "local" | "cloud";
  toRuntime: "local" | "cloud";
  reason: "manual-escalation" | "manual-deescalation";
  createdAt: number;
  summary: StageChatTransferSummary;
  summaryText: string;
}

interface StageChatHandoffContextInput {
  currentGoal?: string;
  openQuestions?: string[];
  pinnedNotes?: string[];
  referencedArtifacts?: string[];
}

type StageChatHandoffMap = Record<string, StageChatRuntimeHandoffRecord[]>;
type StageChatSummarizedHistoryMap = Record<string, StageChatSummarizedHistoryThreadState>;

function readSeedMap(
  stateStore: StageChatSessionStateStore,
  stateKey: string,
): Record<string, StageChatSeedStateRecord> {
  const raw = stateStore.get<unknown>(stateKey);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as Record<string, StageChatSeedStateRecord>;
}

async function upsertSeed(input: {
  stateStore: StageChatSessionStateStore;
  stateKey: string;
  threadKey: string;
  seed: StageChatSeedMessage;
  at: number;
}): Promise<void> {
  const map = readSeedMap(input.stateStore, input.stateKey);
  const existing = map[input.threadKey];

  await input.stateStore.update(input.stateKey, {
    ...map,
    [input.threadKey]: {
      seed: input.seed,
      seededAt: existing?.seededAt ?? input.at,
      updatedAt: input.at,
    } satisfies StageChatSeedStateRecord,
  });
}

async function deleteSeed(input: {
  stateStore: StageChatSessionStateStore;
  stateKey: string;
  threadKey: string;
}): Promise<void> {
  const map = readSeedMap(input.stateStore, input.stateKey);
  if (!map[input.threadKey]) {
    return;
  }

  const next = { ...map };
  delete next[input.threadKey];
  await input.stateStore.update(input.stateKey, next);
}

function readHandoffMap(
  stateStore: StageChatSessionStateStore,
  stateKey: string,
): StageChatHandoffMap {
  const raw = stateStore.get<unknown>(stateKey);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as StageChatHandoffMap;
}

function readSummarizedHistoryMap(
  stateStore: StageChatSessionStateStore,
): StageChatSummarizedHistoryMap {
  const raw = stateStore.get<unknown>(DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as StageChatSummarizedHistoryMap;
}

function createHandoffId(threadKey: string, at: number, direction: string): string {
  return `${threadKey}::handoff::${direction}::${at}`;
}

async function appendHandoff(input: {
  stateStore: StageChatSessionStateStore;
  stateKey: string;
  threadKey: string;
  handoff: StageChatRuntimeHandoffRecord;
}): Promise<void> {
  const map = readHandoffMap(input.stateStore, input.stateKey);
  const next = {
    ...map,
    [input.threadKey]: [...(map[input.threadKey] ?? []), input.handoff],
  };

  await input.stateStore.update(input.stateKey, next);
}

async function deleteHandoffs(input: {
  stateStore: StageChatSessionStateStore;
  stateKey: string;
  threadKey: string;
}): Promise<void> {
  const map = readHandoffMap(input.stateStore, input.stateKey);
  if (!map[input.threadKey]) {
    return;
  }

  const next = { ...map };
  delete next[input.threadKey];
  await input.stateStore.update(input.stateKey, next);
}

async function deleteSummarizedHistory(input: {
  stateStore: StageChatSessionStateStore;
  threadKey: string;
}): Promise<void> {
  const map = readSummarizedHistoryMap(input.stateStore);
  if (!map[input.threadKey]) {
    return;
  }

  const next = { ...map };
  delete next[input.threadKey];
  await input.stateStore.update(DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY, next);
}

export interface StageChatSessionBoundary {
  buildThreadKey(identity: StageChatSessionIdentity): string;
  lookupSession(input: {
    identity: StageChatSessionIdentity;
    staleAfterMs?: number;
    now?: number;
  }): StageChatSessionLookupResult;
  openOrResume(input: {
    identity: StageChatSessionIdentity;
    backingSessionId?: string;
    runtimeClass?: "local" | "cloud";
    now?: number;
    seedContext?: StageChatContextPackageInput;
  }): Promise<{
    operation: "opened" | "resumed";
    session: StageChatSessionRecord;
    wasStale: boolean;
    seed?: StageChatSeedMessage;
    seedSource?: "created" | "existing";
  }>;
  reset(input: {
    identity: StageChatSessionIdentity;
    now?: number;
    runtimeClass?: "local" | "cloud";
    backingSessionId?: string;
  }): Promise<{
    operation: "reset";
    priorSession?: StageChatSessionRecord;
    session: StageChatSessionRecord;
  }>;
  discard(input: { identity: StageChatSessionIdentity }): Promise<{
    operation: "discarded";
    removed: boolean;
  }>;
  lookupHandoffs(input: { identity: StageChatSessionIdentity }): {
    threadKey: string;
    handoffs: StageChatRuntimeHandoffRecord[];
  };
  escalate(input: {
    identity: StageChatSessionIdentity;
    backingSessionId?: string;
    now?: number;
    handoffContext?: StageChatHandoffContextInput;
  }): Promise<{
    operation: "escalated" | "opened";
    session: StageChatSessionRecord;
    transition?: StageChatLifecycleTransition;
    handoff?: StageChatRuntimeHandoffRecord;
  }>;
  deescalate(input: {
    identity: StageChatSessionIdentity;
    backingSessionId?: string;
    now?: number;
    handoffContext?: StageChatHandoffContextInput;
  }): Promise<{
    operation: "deescalated" | "opened";
    session: StageChatSessionRecord;
    transition?: StageChatLifecycleTransition;
    handoff?: StageChatRuntimeHandoffRecord;
  }>;
}

export function createStageChatSessionBoundary(input: {
  stateStore: StageChatSessionStateStore;
  storeBoundary?: StageChatSessionStoreBoundary;
  lifecycleBoundary?: StageChatLifecycleBoundary;
  seedsStateKey?: string;
  handoffStateKey?: string;
}): StageChatSessionBoundary {
  const store = input.storeBoundary ?? createStageChatSessionStoreBoundary();
  const seedsStateKey = input.seedsStateKey ?? DEFAULT_STAGE_CHAT_SEEDS_STATE_KEY;
  const handoffStateKey = input.handoffStateKey ?? DEFAULT_STAGE_CHAT_HANDOFF_STATE_KEY;
  const lifecycle =
    input.lifecycleBoundary ??
    createStageChatLifecycleBoundary({
      storeBoundary: store,
    });

  return {
    buildThreadKey(identity) {
      return store.buildThreadKey(identity);
    },

    lookupSession({ identity, staleAfterMs, now }) {
      return store.lookupSession({
        identity,
        stateStore: input.stateStore,
        staleAfterMs,
        now,
      });
    },

    async openOrResume({ identity, backingSessionId, runtimeClass, now, seedContext }) {
      const result = await lifecycle.openOrResume({
        identity,
        stateStore: input.stateStore,
        backingSessionId,
        runtimeClass,
        now,
      });

      if (!seedContext) {
        return result;
      }

      const existingSeed = readSeedMap(input.stateStore, seedsStateKey)[result.session.threadKey]
        ?.seed;
      if (existingSeed) {
        return {
          ...result,
          seed: existingSeed,
          seedSource: "existing" as const,
        };
      }

      const buildResult = buildStageChatContextPackage(seedContext);
      if (!buildResult.ok) {
        throw new Error(`Cannot seed stage-chat session: ${buildResult.error}.`);
      }

      const seed = buildStageChatSeedMessage(buildResult.package);
      await upsertSeed({
        stateStore: input.stateStore,
        stateKey: seedsStateKey,
        threadKey: result.session.threadKey,
        seed,
        at: now ?? Date.now(),
      });

      return {
        ...result,
        seed,
        seedSource: "created" as const,
      };
    },

    async reset({ identity, runtimeClass, backingSessionId, now }) {
      return await lifecycle.reset({
        identity,
        stateStore: input.stateStore,
        runtimeClass,
        backingSessionId,
        now,
      });
    },

    async discard({ identity }) {
      const result = await lifecycle.discard({
        identity,
        stateStore: input.stateStore,
      });

      if (!result.removed) {
        return result;
      }

      const threadKey = store.buildThreadKey(identity);
      if (threadKey) {
        await deleteSeed({
          stateStore: input.stateStore,
          stateKey: seedsStateKey,
          threadKey,
        });
        await deleteHandoffs({
          stateStore: input.stateStore,
          stateKey: handoffStateKey,
          threadKey,
        });
        await deleteSummarizedHistory({
          stateStore: input.stateStore,
          threadKey,
        });
      }

      return result;
    },

    lookupHandoffs({ identity }) {
      const threadKey = store.buildThreadKey(identity);
      return {
        threadKey,
        handoffs: threadKey
          ? (readHandoffMap(input.stateStore, handoffStateKey)[threadKey] ?? [])
          : [],
      };
    },

    async escalate({ identity, backingSessionId, now, handoffContext }) {
      const result = await lifecycle.escalate({
        identity,
        stateStore: input.stateStore,
        backingSessionId,
        now,
      });

      if (!result.transition) {
        return result;
      }

      const threadKey = result.session.threadKey;
      const seed = readSeedMap(input.stateStore, seedsStateKey)[threadKey]?.seed;
      const summarizedHistory = readSummarizedHistoryMap(input.stateStore)[threadKey];
      const summary = buildStageChatTransferSummary({
        direction: result.transition.direction,
        seed,
        summarizedHistory,
        currentGoal: handoffContext?.currentGoal,
        openQuestions: handoffContext?.openQuestions,
        pinnedNotes: handoffContext?.pinnedNotes,
        referencedArtifacts: handoffContext?.referencedArtifacts,
      });
      const at = now ?? Date.now();
      const handoff: StageChatRuntimeHandoffRecord = {
        id: createHandoffId(threadKey, at, result.transition.direction),
        threadKey,
        direction: result.transition.direction,
        fromRuntime: result.transition.fromRuntime,
        toRuntime: result.transition.toRuntime,
        reason: result.transition.reason,
        createdAt: at,
        summary,
        summaryText: formatStageChatTransferSummary(summary),
      };

      await appendHandoff({
        stateStore: input.stateStore,
        stateKey: handoffStateKey,
        threadKey,
        handoff,
      });

      return {
        ...result,
        handoff,
      };
    },

    async deescalate({ identity, backingSessionId, now, handoffContext }) {
      const result = await lifecycle.deescalate({
        identity,
        stateStore: input.stateStore,
        backingSessionId,
        now,
      });

      if (!result.transition) {
        return result;
      }

      const threadKey = result.session.threadKey;
      const seed = readSeedMap(input.stateStore, seedsStateKey)[threadKey]?.seed;
      const summarizedHistory = readSummarizedHistoryMap(input.stateStore)[threadKey];
      const summary = buildStageChatTransferSummary({
        direction: result.transition.direction,
        seed,
        summarizedHistory,
        currentGoal: handoffContext?.currentGoal,
        openQuestions: handoffContext?.openQuestions,
        pinnedNotes: handoffContext?.pinnedNotes,
        referencedArtifacts: handoffContext?.referencedArtifacts,
      });
      const at = now ?? Date.now();
      const handoff: StageChatRuntimeHandoffRecord = {
        id: createHandoffId(threadKey, at, result.transition.direction),
        threadKey,
        direction: result.transition.direction,
        fromRuntime: result.transition.fromRuntime,
        toRuntime: result.transition.toRuntime,
        reason: result.transition.reason,
        createdAt: at,
        summary,
        summaryText: formatStageChatTransferSummary(summary),
      };

      await appendHandoff({
        stateStore: input.stateStore,
        stateKey: handoffStateKey,
        threadKey,
        handoff,
      });

      return {
        ...result,
        handoff,
      };
    },
  };
}
