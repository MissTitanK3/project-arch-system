import { describe, expect, it, vi } from "vitest";
import type { ProjectArchBoundary } from "../integration/projectArchBoundary";
import {
  buildAuditEntryNavigation,
  deriveRunArtifactPaths,
  groupEntriesByRun,
  lookupAuditHistory,
  lookupRunAuditGroup,
  parseAuditHistoryPayload,
  summariseAuditEntry,
  type AuditEntryViewModel,
  type AuditPresentationContext,
} from "./auditContext";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const LOG_PATH = ".project-arch/agent-runtime/logs/execution.jsonl";

function makeEntry(overrides: Partial<AuditEntryViewModel> = {}): AuditEntryViewModel {
  return {
    eventId: "evt-default",
    occurredAt: "2024-01-01T00:00:00.000Z",
    command: "run",
    status: "success",
    ...overrides,
  };
}

function makeSuccessPayload(
  events: AuditEntryViewModel[],
  overrides: Record<string, unknown> = {},
) {
  return {
    success: true,
    data: {
      schemaVersion: "2.0",
      status: "audit-history",
      logPath: LOG_PATH,
      events,
      total: events.length,
      ...overrides,
    },
  };
}

function makeErrorPayload(errors = ["Audit error"]) {
  return { success: false, errors };
}

// ---------------------------------------------------------------------------
// deriveRunArtifactPaths
// ---------------------------------------------------------------------------

describe("deriveRunArtifactPaths", () => {
  it("returns canonical paths for the given runId", () => {
    const paths = deriveRunArtifactPaths("run-abc");
    expect(paths.runRecordPath).toBe(".project-arch/agent-runtime/runs/run-abc.json");
    expect(paths.launchRecordPath).toBe(".project-arch/agent-runtime/launches/run-abc.json");
    expect(paths.orchestrationPath).toBe(".project-arch/agent-runtime/orchestration/run-abc.json");
  });
});

// ---------------------------------------------------------------------------
// buildAuditEntryNavigation
// ---------------------------------------------------------------------------

describe("buildAuditEntryNavigation", () => {
  it("includes logPath for any entry", () => {
    const nav = buildAuditEntryNavigation(makeEntry(), LOG_PATH);
    expect(nav.logPath).toBe(LOG_PATH);
  });

  it("omits run artifact paths when entry has no runId", () => {
    const nav = buildAuditEntryNavigation(makeEntry({ runId: undefined }), LOG_PATH);
    expect(nav.runRecordPath).toBeUndefined();
    expect(nav.launchRecordPath).toBeUndefined();
    expect(nav.orchestrationPath).toBeUndefined();
  });

  it("includes run artifact paths when entry has a runId", () => {
    const nav = buildAuditEntryNavigation(makeEntry({ runId: "run-xyz" }), LOG_PATH);
    expect(nav.runRecordPath).toBe(".project-arch/agent-runtime/runs/run-xyz.json");
    expect(nav.launchRecordPath).toBe(".project-arch/agent-runtime/launches/run-xyz.json");
    expect(nav.orchestrationPath).toBe(".project-arch/agent-runtime/orchestration/run-xyz.json");
  });
});

// ---------------------------------------------------------------------------
// groupEntriesByRun
// ---------------------------------------------------------------------------

describe("groupEntriesByRun", () => {
  it("groups entries by runId", () => {
    const entries = [
      makeEntry({ eventId: "e1", runId: "run-1", command: "prepare" }),
      makeEntry({ eventId: "e2", runId: "run-1", command: "run" }),
      makeEntry({ eventId: "e3", runId: "run-2", command: "validate" }),
    ];
    const { runs, unlinked } = groupEntriesByRun(entries, LOG_PATH);

    expect(runs).toHaveLength(2);
    const r1 = runs.find((r) => r.runId === "run-1");
    expect(r1?.events).toHaveLength(2);
    expect(r1?.events[0].eventId).toBe("e1");
    expect(r1?.events[1].eventId).toBe("e2");
    expect(unlinked).toHaveLength(0);
  });

  it("collects entries with no runId into unlinked", () => {
    const entries = [
      makeEntry({ eventId: "e1", runId: undefined }),
      makeEntry({ eventId: "e2", runId: "run-1" }),
    ];
    const { runs, unlinked } = groupEntriesByRun(entries, LOG_PATH);
    expect(runs).toHaveLength(1);
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0].eventId).toBe("e1");
  });

  it("marks run group hasErrors when any event has status error", () => {
    const entries = [
      makeEntry({ eventId: "e1", runId: "run-1", status: "success" }),
      makeEntry({ eventId: "e2", runId: "run-1", status: "error" }),
    ];
    const { runs } = groupEntriesByRun(entries, LOG_PATH);
    expect(runs[0].hasErrors).toBe(true);
  });

  it("does not mark hasErrors when all events are success", () => {
    const entries = [
      makeEntry({ eventId: "e1", runId: "run-1", status: "success" }),
      makeEntry({ eventId: "e2", runId: "run-1", status: "success" }),
    ];
    const { runs } = groupEntriesByRun(entries, LOG_PATH);
    expect(runs[0].hasErrors).toBe(false);
  });

  it("returns empty arrays for empty input", () => {
    const { runs, unlinked } = groupEntriesByRun([], LOG_PATH);
    expect(runs).toHaveLength(0);
    expect(unlinked).toHaveLength(0);
  });

  it("uses taskId from first event in the group", () => {
    const entries = [makeEntry({ runId: "run-1", taskId: "task-A" })];
    const { runs } = groupEntriesByRun(entries, LOG_PATH);
    expect(runs[0].taskId).toBe("task-A");
  });
});

// ---------------------------------------------------------------------------
// summariseAuditEntry
// ---------------------------------------------------------------------------

describe("summariseAuditEntry", () => {
  it("produces a baseline summary with required fields", () => {
    const entry = makeEntry({
      occurredAt: "2024-06-01T12:00:00.000Z",
      command: "validate",
      status: "success",
    });
    const summary = summariseAuditEntry(entry);
    expect(summary).toContain("2024-06-01T12:00:00.000Z");
    expect(summary).toContain("validate");
    expect(summary).toContain("success");
  });

  it("includes runId and taskId when present", () => {
    const entry = makeEntry({ runId: "run-1", taskId: "task-2" });
    const summary = summariseAuditEntry(entry);
    expect(summary).toContain("run=run-1");
    expect(summary).toContain("task=task-2");
  });

  it("includes message when present", () => {
    const entry = makeEntry({ message: "Validation failed" });
    const summary = summariseAuditEntry(entry);
    expect(summary).toContain("Validation failed");
  });

  it("omits optional fields when absent", () => {
    const entry = makeEntry({ runId: undefined, taskId: undefined, message: undefined });
    const summary = summariseAuditEntry(entry);
    expect(summary).not.toContain("run=");
    expect(summary).not.toContain("task=");
  });
});

// ---------------------------------------------------------------------------
// parseAuditHistoryPayload
// ---------------------------------------------------------------------------

describe("parseAuditHistoryPayload", () => {
  it("parses a successful payload with events", () => {
    const events = [
      makeEntry({ eventId: "e1", runId: "run-1" }),
      makeEntry({ eventId: "e2", runId: "run-1" }),
    ];
    const ctx = parseAuditHistoryPayload(makeSuccessPayload(events));
    expect(ctx.entries).toHaveLength(2);
    expect(ctx.logPath).toBe(LOG_PATH);
    expect(ctx.total).toBe(2);
    expect(ctx.hasErrors).toBe(false);
  });

  it("parses filteredByRunId when present", () => {
    const ctx = parseAuditHistoryPayload(makeSuccessPayload([], { filteredByRunId: "run-42" }));
    expect(ctx.filteredByRunId).toBe("run-42");
  });

  it("omits filteredByRunId when absent in payload", () => {
    const ctx = parseAuditHistoryPayload(makeSuccessPayload([]));
    expect(ctx.filteredByRunId).toBeUndefined();
  });

  it("throws on failure payload", () => {
    expect(() => parseAuditHistoryPayload(makeErrorPayload(["Disk error"]))).toThrow("Disk error");
  });

  it("throws when payload is not an object", () => {
    expect(() => parseAuditHistoryPayload("nope")).toThrow();
    expect(() => parseAuditHistoryPayload(null)).toThrow();
    expect(() => parseAuditHistoryPayload(42)).toThrow();
  });

  it("throws when success is true but data is missing", () => {
    expect(() => parseAuditHistoryPayload({ success: true, data: null })).toThrow("missing data");
  });

  it("returns empty entries for empty events array", () => {
    const ctx = parseAuditHistoryPayload(makeSuccessPayload([]));
    expect(ctx.entries).toHaveLength(0);
    expect(ctx.runs).toHaveLength(0);
    expect(ctx.unlinkedEntries).toHaveLength(0);
  });

  it("filters out malformed events that lack command or status", () => {
    const payload = {
      success: true,
      data: {
        logPath: LOG_PATH,
        events: [
          { eventId: "e1" }, // missing command & status
          makeEntry({ eventId: "e2" }), // valid
        ],
        total: 2,
      },
    };
    const ctx = parseAuditHistoryPayload(payload);
    expect(ctx.entries).toHaveLength(1);
    expect(ctx.entries[0].eventId).toBe("e2");
  });

  it("sets hasErrors true when any event has status error", () => {
    const events = [
      makeEntry({ eventId: "e1", status: "error", runId: "run-1" }),
      makeEntry({ eventId: "e2", status: "success", runId: "run-1" }),
    ];
    const ctx = parseAuditHistoryPayload(makeSuccessPayload(events));
    expect(ctx.hasErrors).toBe(true);
  });

  it("populates runs from grouped entries", () => {
    const events = [
      makeEntry({ eventId: "e1", runId: "run-1" }),
      makeEntry({ eventId: "e2", runId: "run-2" }),
    ];
    const ctx = parseAuditHistoryPayload(makeSuccessPayload(events));
    expect(ctx.runs).toHaveLength(2);
  });

  it("populates unlinkedEntries for events without runId", () => {
    const events = [makeEntry({ eventId: "e1", runId: undefined })];
    const ctx = parseAuditHistoryPayload(makeSuccessPayload(events));
    expect(ctx.unlinkedEntries).toHaveLength(1);
    expect(ctx.runs).toHaveLength(0);
  });

  it("carries metadata through when present", () => {
    const events = [makeEntry({ metadata: { key: "value" } })];
    const ctx = parseAuditHistoryPayload(makeSuccessPayload(events));
    expect(ctx.entries[0].metadata).toEqual({ key: "value" });
  });

  it("uses fallback logPath when omitted from payload data", () => {
    const payload = { success: true, data: { events: [], total: 0 } };
    const ctx = parseAuditHistoryPayload(payload);
    expect(ctx.logPath).toContain("execution.jsonl");
  });
});

// ---------------------------------------------------------------------------
// lookupAuditHistory
// ---------------------------------------------------------------------------

describe("lookupAuditHistory", () => {
  function makeBoundary(payload: unknown) {
    return {
      runCliJson: vi.fn(async () => payload) as unknown as ProjectArchBoundary["runCliJson"],
    } as ProjectArchBoundary;
  }

  it("calls boundary with base args when no options are provided", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupAuditHistory({ boundary });
    expect(boundary.runCliJson).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["agent", "audit"] }),
    );
  });

  it("appends runId to args when provided", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupAuditHistory({ runId: "run-1", boundary });
    expect(boundary.runCliJson).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["agent", "audit", "run-1"] }),
    );
  });

  it("appends --limit when provided", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupAuditHistory({ limit: 25, boundary });
    expect(boundary.runCliJson).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["agent", "audit", "--limit", "25"] }),
    );
  });

  it("appends both runId and --limit when provided", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupAuditHistory({ runId: "run-1", limit: 10, boundary });
    expect(boundary.runCliJson).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["agent", "audit", "run-1", "--limit", "10"] }),
    );
  });

  it("passes cwd to boundary", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupAuditHistory({ cwd: "/workspace", boundary });
    expect(boundary.runCliJson).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/workspace" }),
    );
  });

  it("returns parsed AuditPresentationContext", async () => {
    const events = [makeEntry({ runId: "run-1" })];
    const boundary = makeBoundary(makeSuccessPayload(events));
    const ctx = await lookupAuditHistory({ boundary });
    expect(ctx.entries).toHaveLength(1);
    expect(ctx.runs).toHaveLength(1);
  });

  it("does not append --limit 0 to args", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupAuditHistory({ limit: 0, boundary });
    const call = (boundary.runCliJson as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      args: string[];
    };
    expect(call.args).not.toContain("--limit");
  });
});

// ---------------------------------------------------------------------------
// lookupRunAuditGroup
// ---------------------------------------------------------------------------

describe("lookupRunAuditGroup", () => {
  function makeBoundary(payload: unknown) {
    return {
      runCliJson: vi.fn(async () => payload) as unknown as ProjectArchBoundary["runCliJson"],
    } as ProjectArchBoundary;
  }

  it("returns the matching RunAuditGroup for a known runId", async () => {
    const events = [makeEntry({ runId: "run-abc" })];
    const boundary = makeBoundary(makeSuccessPayload(events, { filteredByRunId: "run-abc" }));
    const group = await lookupRunAuditGroup({ runId: "run-abc", boundary });
    expect(group.runId).toBe("run-abc");
    expect(group.events).toHaveLength(1);
  });

  it("returns an empty group when no events exist for the runId", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    const group = await lookupRunAuditGroup({ runId: "run-missing", boundary });
    expect(group.runId).toBe("run-missing");
    expect(group.events).toHaveLength(0);
    expect(group.hasErrors).toBe(false);
  });

  it("reports hasErrors when the group has an error event", async () => {
    const events = [makeEntry({ runId: "run-err", status: "error" })];
    const boundary = makeBoundary(makeSuccessPayload(events));
    const group = await lookupRunAuditGroup({ runId: "run-err", boundary });
    expect(group.hasErrors).toBe(true);
  });

  it("passes cwd through to boundary", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    await lookupRunAuditGroup({ runId: "run-x", boundary, cwd: "/some/path" });
    expect(boundary.runCliJson).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/some/path" }),
    );
  });

  it("empty group navigation includes logPath and run artifact paths", async () => {
    const boundary = makeBoundary(makeSuccessPayload([]));
    const group = await lookupRunAuditGroup({ runId: "run-nav", boundary });
    expect(group.navigation.logPath).toBe(LOG_PATH);
    expect(group.navigation.runRecordPath).toBe(".project-arch/agent-runtime/runs/run-nav.json");
  });
}) satisfies unknown;

// Explicit export to avoid "isolatedModules" unused-file lint warnings
export type { AuditPresentationContext };
