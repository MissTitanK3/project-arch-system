import {
  createStageChatSessionStoreBoundary,
  type StageChatSessionIdentity,
  type StageChatSessionStateStore,
  type StageChatSessionStoreBoundary,
} from "./stageChatSessionStoreBoundary";

export const DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY =
  "projectArch.stageChat.summarizedHistory.v1" as const;
export const DEFAULT_SUMMARIZE_AFTER_TURNS = 16;
export const DEFAULT_SUMMARIZE_AFTER_ESTIMATED_TOKENS = 12_000;
export const DEFAULT_RETAIN_RECENT_TURNS = 16;
export const MIN_RETAIN_RECENT_TURNS = 10;

export type StageChatTurnRole = "user" | "assistant" | "system";

export interface StageChatTurnRecord {
  id: string;
  role: StageChatTurnRole;
  text: string;
  createdAt: number;
  estimatedTokens?: number;
}

export interface StageChatSummarySections {
  keyFacts: string[];
  decisions: string[];
  nextSteps: string[];
}

export interface StageChatSummarizedHistoryEntry {
  id: string;
  createdAt: number;
  sourceTurnIds: string[];
  sections: StageChatSummarySections;
}

export interface StageChatRestoredHistoryAttachment {
  id: string;
  createdAt: number;
  sourceHistoryEntryIds: string[];
  mode: "temporary";
  sections: StageChatSummarySections;
  promotedAt?: number;
}

export interface StageChatSummarizedHistoryThreadState {
  recentTurns: StageChatTurnRecord[];
  rollingSummary: StageChatSummarySections;
  summarizedHistory: StageChatSummarizedHistoryEntry[];
  restoredAttachments: StageChatRestoredHistoryAttachment[];
  lastUpdatedAt: number;
}

export interface StageChatSummarizedHistoryBoundary {
  retainTurns(input: {
    identity: StageChatSessionIdentity;
    turns: StageChatTurnRecord[];
    now?: number;
  }): Promise<{
    operation: "retained";
    threadKey: string;
    summarized: boolean;
    summarizedHistoryEntry?: StageChatSummarizedHistoryEntry;
    state: StageChatSummarizedHistoryThreadState;
  }>;
  inspectSummarizedHistory(input: { identity: StageChatSessionIdentity }): {
    threadKey: string;
    entries: StageChatSummarizedHistoryEntry[];
    restoredAttachments: StageChatRestoredHistoryAttachment[];
  };
  useHistoryInChat(input: {
    identity: StageChatSessionIdentity;
    historyEntryIds?: string[];
    now?: number;
  }): Promise<{
    operation: "attached" | "no-op";
    attachment?: StageChatRestoredHistoryAttachment;
    state: StageChatSummarizedHistoryThreadState;
  }>;
  promoteRestoredHistory(input: {
    identity: StageChatSessionIdentity;
    attachmentId: string;
    now?: number;
  }): Promise<{
    operation: "promoted" | "missing-attachment";
    state: StageChatSummarizedHistoryThreadState;
  }>;
  discard(input: { identity: StageChatSessionIdentity }): Promise<{
    operation: "discarded";
    removed: boolean;
  }>;
  getThreadState(input: { identity: StageChatSessionIdentity }): {
    threadKey: string;
    state: StageChatSummarizedHistoryThreadState;
  };
}

type ThreadStateMap = Record<string, StageChatSummarizedHistoryThreadState>;

function createEmptySections(): StageChatSummarySections {
  return {
    keyFacts: [],
    decisions: [],
    nextSteps: [],
  };
}

function createEmptyThreadState(now: number): StageChatSummarizedHistoryThreadState {
  return {
    recentTurns: [],
    rollingSummary: createEmptySections(),
    summarizedHistory: [],
    restoredAttachments: [],
    lastUpdatedAt: now,
  };
}

function readMap(stateStore: StageChatSessionStateStore, stateKey: string): ThreadStateMap {
  const raw = stateStore.get<unknown>(stateKey);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as ThreadStateMap;
}

async function writeMap(input: {
  stateStore: StageChatSessionStateStore;
  stateKey: string;
  map: ThreadStateMap;
}): Promise<void> {
  await input.stateStore.update(input.stateKey, input.map);
}

function normalizeForDedup(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeConservative(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeForDedup(value);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(value.trim());
  }

  return deduped;
}

function mergeSectionsIncrementally(
  base: StageChatSummarySections,
  incoming: StageChatSummarySections,
): StageChatSummarySections {
  return {
    keyFacts: dedupeConservative([...base.keyFacts, ...incoming.keyFacts]),
    decisions: dedupeConservative([...base.decisions, ...incoming.decisions]),
    nextSteps: dedupeConservative([...base.nextSteps, ...incoming.nextSteps]),
  };
}

function splitTurnIntoSummaryLines(turn: StageChatTurnRecord): StageChatSummarySections {
  const lines = turn.text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);

  const sections = createEmptySections();

  for (const line of lines) {
    if (/^(decision|decided|we will|chosen)\b/i.test(line)) {
      sections.decisions.push(line);
      continue;
    }

    if (/^(next step|next steps|todo|follow-up|follow up|action item|action)\b/i.test(line)) {
      sections.nextSteps.push(line);
      continue;
    }

    sections.keyFacts.push(line);
  }

  return {
    keyFacts: dedupeConservative(sections.keyFacts),
    decisions: dedupeConservative(sections.decisions),
    nextSteps: dedupeConservative(sections.nextSteps),
  };
}

function summarizeTurns(turns: StageChatTurnRecord[]): StageChatSummarySections {
  return turns.reduce(
    (acc, turn) => mergeSectionsIncrementally(acc, splitTurnIntoSummaryLines(turn)),
    createEmptySections(),
  );
}

function estimateTokens(turns: StageChatTurnRecord[]): number {
  return turns.reduce((total, turn) => {
    if (typeof turn.estimatedTokens === "number" && Number.isFinite(turn.estimatedTokens)) {
      return total + Math.max(0, Math.floor(turn.estimatedTokens));
    }

    return total + Math.max(1, Math.ceil(turn.text.length / 4));
  }, 0);
}

function createHistoryEntryId(threadKey: string, at: number, sourceTurnIds: string[]): string {
  return `${threadKey}::summary::${at}::${sourceTurnIds.length}`;
}

function createAttachmentId(threadKey: string, at: number, sourceEntryCount: number): string {
  return `${threadKey}::restored::${at}::${sourceEntryCount}`;
}

function resolveThreadKeyOrThrow(
  store: StageChatSessionStoreBoundary,
  identity: StageChatSessionIdentity,
): string {
  const threadKey = store.buildThreadKey(identity);
  if (!threadKey) {
    throw new Error("Cannot resolve stage-chat summarized history without taskId and stageId.");
  }

  return threadKey;
}

export function createStageChatSummarizedHistoryBoundary(input: {
  stateStore: StageChatSessionStateStore;
  storeBoundary?: StageChatSessionStoreBoundary;
  stateKey?: string;
  summarizeAfterTurns?: number;
  summarizeAfterEstimatedTokens?: number;
  retainRecentTurns?: number;
}): StageChatSummarizedHistoryBoundary {
  const store = input.storeBoundary ?? createStageChatSessionStoreBoundary();
  const stateKey = input.stateKey ?? DEFAULT_STAGE_CHAT_SUMMARIZED_HISTORY_STATE_KEY;
  const summarizeAfterTurns = input.summarizeAfterTurns ?? DEFAULT_SUMMARIZE_AFTER_TURNS;
  const summarizeAfterEstimatedTokens =
    input.summarizeAfterEstimatedTokens ?? DEFAULT_SUMMARIZE_AFTER_ESTIMATED_TOKENS;
  const retainRecentTurns = Math.max(
    MIN_RETAIN_RECENT_TURNS,
    input.retainRecentTurns ?? DEFAULT_RETAIN_RECENT_TURNS,
  );

  return {
    async retainTurns({ identity, turns, now }) {
      const at = now ?? Date.now();
      const threadKey = resolveThreadKeyOrThrow(store, identity);
      const map = readMap(input.stateStore, stateKey);
      const prior = map[threadKey] ?? createEmptyThreadState(at);

      const nextRecentTurns = [...prior.recentTurns, ...turns];
      const turnsForSummary: StageChatTurnRecord[] = [];

      if (nextRecentTurns.length > summarizeAfterTurns) {
        const overflow = Math.max(0, nextRecentTurns.length - retainRecentTurns);
        if (overflow > 0) {
          turnsForSummary.push(...nextRecentTurns.splice(0, overflow));
        }
      }

      while (
        nextRecentTurns.length > MIN_RETAIN_RECENT_TURNS &&
        estimateTokens(nextRecentTurns) > summarizeAfterEstimatedTokens
      ) {
        const shifted = nextRecentTurns.shift();
        if (!shifted) {
          break;
        }

        turnsForSummary.push(shifted);
      }

      let summarizedHistoryEntry: StageChatSummarizedHistoryEntry | undefined;
      let rollingSummary = prior.rollingSummary;
      let summarizedHistory = prior.summarizedHistory;

      if (turnsForSummary.length > 0) {
        const sections = summarizeTurns(turnsForSummary);
        summarizedHistoryEntry = {
          id: createHistoryEntryId(
            threadKey,
            at,
            turnsForSummary.map((turn) => turn.id),
          ),
          createdAt: at,
          sourceTurnIds: turnsForSummary.map((turn) => turn.id),
          sections,
        };

        rollingSummary = mergeSectionsIncrementally(prior.rollingSummary, sections);
        summarizedHistory = [...prior.summarizedHistory, summarizedHistoryEntry];
      }

      const nextState: StageChatSummarizedHistoryThreadState = {
        ...prior,
        recentTurns: nextRecentTurns,
        rollingSummary,
        summarizedHistory,
        lastUpdatedAt: at,
      };

      await writeMap({
        stateStore: input.stateStore,
        stateKey,
        map: {
          ...map,
          [threadKey]: nextState,
        },
      });

      return {
        operation: "retained" as const,
        threadKey,
        summarized: Boolean(summarizedHistoryEntry),
        summarizedHistoryEntry,
        state: nextState,
      };
    },

    inspectSummarizedHistory({ identity }) {
      const threadKey = resolveThreadKeyOrThrow(store, identity);
      const map = readMap(input.stateStore, stateKey);
      const state = map[threadKey] ?? createEmptyThreadState(Date.now());

      return {
        threadKey,
        entries: state.summarizedHistory,
        restoredAttachments: state.restoredAttachments,
      };
    },

    async useHistoryInChat({ identity, historyEntryIds, now }) {
      const at = now ?? Date.now();
      const threadKey = resolveThreadKeyOrThrow(store, identity);
      const map = readMap(input.stateStore, stateKey);
      const prior = map[threadKey] ?? createEmptyThreadState(at);

      const selectedEntries =
        historyEntryIds && historyEntryIds.length > 0
          ? prior.summarizedHistory.filter((entry) => historyEntryIds.includes(entry.id))
          : prior.summarizedHistory;

      if (selectedEntries.length === 0) {
        return {
          operation: "no-op" as const,
          state: prior,
        };
      }

      const sections = selectedEntries.reduce(
        (acc, entry) => mergeSectionsIncrementally(acc, entry.sections),
        createEmptySections(),
      );

      const attachment: StageChatRestoredHistoryAttachment = {
        id: createAttachmentId(threadKey, at, selectedEntries.length),
        createdAt: at,
        sourceHistoryEntryIds: selectedEntries.map((entry) => entry.id),
        mode: "temporary",
        sections,
      };

      const nextState: StageChatSummarizedHistoryThreadState = {
        ...prior,
        restoredAttachments: [...prior.restoredAttachments, attachment],
        lastUpdatedAt: at,
      };

      await writeMap({
        stateStore: input.stateStore,
        stateKey,
        map: {
          ...map,
          [threadKey]: nextState,
        },
      });

      return {
        operation: "attached" as const,
        attachment,
        state: nextState,
      };
    },

    async promoteRestoredHistory({ identity, attachmentId, now }) {
      const at = now ?? Date.now();
      const threadKey = resolveThreadKeyOrThrow(store, identity);
      const map = readMap(input.stateStore, stateKey);
      const prior = map[threadKey] ?? createEmptyThreadState(at);

      const attachment = prior.restoredAttachments.find((item) => item.id === attachmentId);
      if (!attachment) {
        return {
          operation: "missing-attachment" as const,
          state: prior,
        };
      }

      const rollingSummary = mergeSectionsIncrementally(prior.rollingSummary, attachment.sections);

      const nextState: StageChatSummarizedHistoryThreadState = {
        ...prior,
        rollingSummary,
        restoredAttachments: prior.restoredAttachments.map((item) =>
          item.id === attachmentId ? { ...item, promotedAt: at } : item,
        ),
        lastUpdatedAt: at,
      };

      await writeMap({
        stateStore: input.stateStore,
        stateKey,
        map: {
          ...map,
          [threadKey]: nextState,
        },
      });

      return {
        operation: "promoted" as const,
        state: nextState,
      };
    },

    async discard({ identity }) {
      const threadKey = resolveThreadKeyOrThrow(store, identity);
      const map = readMap(input.stateStore, stateKey);
      if (!map[threadKey]) {
        return {
          operation: "discarded" as const,
          removed: false,
        };
      }

      const next = { ...map };
      delete next[threadKey];
      await writeMap({
        stateStore: input.stateStore,
        stateKey,
        map: next,
      });

      return {
        operation: "discarded" as const,
        removed: true,
      };
    },

    getThreadState({ identity }) {
      const threadKey = resolveThreadKeyOrThrow(store, identity);
      const map = readMap(input.stateStore, stateKey);
      return {
        threadKey,
        state: map[threadKey] ?? createEmptyThreadState(Date.now()),
      };
    },
  };
}
