export const DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY = "projectArch.stageChat.sessions.v1" as const;
export const DEFAULT_STAGE_CHAT_STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 7;

export interface StageChatSessionStateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface StageChatSessionIdentity {
  taskId: string;
  stageId: string;
}

export interface StageChatSessionRecord extends StageChatSessionIdentity {
  threadKey: string;
  logicalThreadId: string;
  backingSessionId?: string;
  runtimeClass?: "local" | "cloud";
  createdAt: number;
  updatedAt: number;
}

export type StageChatSessionLookupResult =
  | {
      status: "found";
      threadKey: string;
      session: StageChatSessionRecord;
      isStale: false;
    }
  | {
      status: "missing";
      threadKey: string;
      isStale: false;
    }
  | {
      status: "stale";
      threadKey: string;
      session: StageChatSessionRecord;
      isStale: true;
      staleReason: "age-threshold" | "invalid-updated-at";
      staleAgeMs?: number;
    };

export interface StageChatSessionStoreBoundary {
  buildThreadKey(identity: StageChatSessionIdentity): string;
  upsertSession(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    stateKey?: string;
    logicalThreadId?: string;
    backingSessionId?: string;
    runtimeClass?: "local" | "cloud";
    at?: number;
  }): Promise<StageChatSessionRecord>;
  lookupSession(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    stateKey?: string;
    staleAfterMs?: number;
    now?: number;
  }): StageChatSessionLookupResult;
  deleteSession(input: {
    identity: StageChatSessionIdentity;
    stateStore: StageChatSessionStateStore;
    stateKey?: string;
  }): Promise<boolean>;
}

function normalizeIdentityValue(value: string): string {
  return value.trim();
}

function readSessionsMap(
  stateStore: StageChatSessionStateStore,
  stateKey: string,
): Record<string, StageChatSessionRecord> {
  const raw = stateStore.get<unknown>(stateKey);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as Record<string, StageChatSessionRecord>;
}

function createThreadKey(identity: StageChatSessionIdentity): string {
  const taskId = normalizeIdentityValue(identity.taskId);
  const stageId = normalizeIdentityValue(identity.stageId);
  if (!taskId || !stageId) {
    return "";
  }

  return `${taskId}::${stageId}`;
}

function computeStaleness(input: {
  session: StageChatSessionRecord;
  now: number;
  staleAfterMs: number;
}):
  | { isStale: false }
  | { isStale: true; staleReason: "age-threshold" | "invalid-updated-at"; staleAgeMs?: number } {
  const { session, now, staleAfterMs } = input;

  if (!Number.isFinite(session.updatedAt) || session.updatedAt <= 0) {
    return {
      isStale: true,
      staleReason: "invalid-updated-at",
    };
  }

  const ageMs = Math.max(0, now - session.updatedAt);
  if (ageMs > staleAfterMs) {
    return {
      isStale: true,
      staleReason: "age-threshold",
      staleAgeMs: ageMs,
    };
  }

  return { isStale: false };
}

export function buildStageChatThreadKey(identity: StageChatSessionIdentity): string {
  return createThreadKey(identity);
}

export async function upsertStageChatSession(input: {
  identity: StageChatSessionIdentity;
  stateStore: StageChatSessionStateStore;
  stateKey?: string;
  logicalThreadId?: string;
  backingSessionId?: string;
  runtimeClass?: "local" | "cloud";
  at?: number;
}): Promise<StageChatSessionRecord> {
  const stateKey = input.stateKey ?? DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY;
  const threadKey = createThreadKey(input.identity);
  if (!threadKey) {
    throw new Error("Cannot store stage-chat session without taskId and stageId.");
  }

  const stateMap = readSessionsMap(input.stateStore, stateKey);
  const existing = stateMap[threadKey];
  const timestamp = input.at ?? Date.now();

  const session: StageChatSessionRecord = {
    taskId: normalizeIdentityValue(input.identity.taskId),
    stageId: normalizeIdentityValue(input.identity.stageId),
    threadKey,
    logicalThreadId: input.logicalThreadId?.trim() || existing?.logicalThreadId || threadKey,
    ...(input.backingSessionId?.trim()
      ? { backingSessionId: input.backingSessionId.trim() }
      : existing?.backingSessionId
        ? { backingSessionId: existing.backingSessionId }
        : {}),
    ...(input.runtimeClass
      ? { runtimeClass: input.runtimeClass }
      : existing?.runtimeClass
        ? { runtimeClass: existing.runtimeClass }
        : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  stateMap[threadKey] = session;
  await input.stateStore.update(stateKey, stateMap);

  return session;
}

export function lookupStageChatSession(input: {
  identity: StageChatSessionIdentity;
  stateStore: StageChatSessionStateStore;
  stateKey?: string;
  staleAfterMs?: number;
  now?: number;
}): StageChatSessionLookupResult {
  const stateKey = input.stateKey ?? DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY;
  const threadKey = createThreadKey(input.identity);

  if (!threadKey) {
    return {
      status: "missing",
      threadKey,
      isStale: false,
    };
  }

  const stateMap = readSessionsMap(input.stateStore, stateKey);
  const session = stateMap[threadKey];

  if (!session) {
    return {
      status: "missing",
      threadKey,
      isStale: false,
    };
  }

  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STAGE_CHAT_STALE_AFTER_MS;
  const now = input.now ?? Date.now();
  const staleness = computeStaleness({
    session,
    now,
    staleAfterMs,
  });

  if (staleness.isStale) {
    return {
      status: "stale",
      threadKey,
      session,
      isStale: true,
      staleReason: staleness.staleReason,
      ...(typeof staleness.staleAgeMs === "number" ? { staleAgeMs: staleness.staleAgeMs } : {}),
    };
  }

  return {
    status: "found",
    threadKey,
    session,
    isStale: false,
  };
}

export async function deleteStageChatSession(input: {
  identity: StageChatSessionIdentity;
  stateStore: StageChatSessionStateStore;
  stateKey?: string;
}): Promise<boolean> {
  const stateKey = input.stateKey ?? DEFAULT_STAGE_CHAT_SESSIONS_STATE_KEY;
  const threadKey = createThreadKey(input.identity);
  if (!threadKey) {
    return false;
  }

  const stateMap = readSessionsMap(input.stateStore, stateKey);
  if (!(threadKey in stateMap)) {
    return false;
  }

  delete stateMap[threadKey];
  await input.stateStore.update(stateKey, stateMap);
  return true;
}

export function createStageChatSessionStoreBoundary(): StageChatSessionStoreBoundary {
  return {
    buildThreadKey: buildStageChatThreadKey,
    upsertSession: upsertStageChatSession,
    lookupSession: lookupStageChatSession,
    deleteSession: deleteStageChatSession,
  };
}
