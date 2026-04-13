import { describe, expect, it } from "vitest";
import {
  buildEnterStageChatIntent,
  buildReturnToWorkflowIntent,
  buildStageChatSurfaceModel,
  buildStageChatWorkflowEntries,
  buildStageChatWorkflowViewModel,
  DISCARD_STAGE_CHAT_COMMAND_ID,
  OPEN_STAGE_CHAT_COMMAND_ID,
  renderStageChatStageEntry,
  renderStageChatSurface,
  renderStageChatWorkflowPanel,
  RESET_STAGE_CHAT_COMMAND_ID,
  RETURN_TO_WORKFLOW_VIEW_COMMAND_ID,
  resolveStageChatLifecycleActions,
  resolveStageChatSessionStatus,
  type StageChatLifecycleAction,
  type StageChatStageEntry,
  type StageChatWorkflowViewModel,
} from "./stageChatWorkflowView";
import type { StageChatSessionBoundary } from "../integration/stageChatSessionBoundary";
import type { StageChatSessionLookupResult } from "../integration/stageChatSessionStoreBoundary";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeThreadKey(taskId: string, stageId: string): string {
  return `${taskId}::${stageId}`;
}

function makeStages(ids: string[]) {
  return ids.map((id, i) => ({
    id,
    title: `Stage ${id}`,
    description: i % 2 === 0 ? `Description for ${id}` : undefined,
  }));
}

/**
 * Creates a minimal mock boundary that returns a configurable lookup result
 * per stageId.
 */
function makeMockBoundary(
  taskId: string,
  sessionMap: Record<string, StageChatSessionLookupResult>,
  handoffCounts: Record<string, number> = {},
): Pick<StageChatSessionBoundary, "buildThreadKey" | "lookupSession" | "lookupHandoffs"> {
  return {
    buildThreadKey: (identity) => makeThreadKey(identity.taskId, identity.stageId),
    lookupSession: (input) => {
      const key = makeThreadKey(input.identity.taskId, input.identity.stageId);
      return (
        sessionMap[input.identity.stageId] ?? {
          status: "missing",
          threadKey: key,
          isStale: false,
        }
      );
    },
    lookupHandoffs: (input) => {
      const threadKey = makeThreadKey(taskId, input.identity.stageId);
      const count = handoffCounts[input.identity.stageId] ?? 0;
      return {
        threadKey,
        handoffs: Array.from({ length: count }, (_, i) => ({
          id: `${threadKey}::handoff::${i}`,
          threadKey,
          direction: "local-to-cloud" as const,
          fromRuntime: "local" as const,
          toRuntime: "cloud" as const,
          reason: "manual-escalation" as const,
          createdAt: 1700000000000 + i,
          summary: {
            stage: input.identity.stageId,
            currentGoal: "",
            keyFacts: [],
            decisionsMade: [],
            openQuestions: [],
          },
          summaryText: "",
        })),
      };
    },
  };
}

function makeFoundLookup(
  taskId: string,
  stageId: string,
  runtimeClass: "local" | "cloud" = "local",
): StageChatSessionLookupResult {
  const threadKey = makeThreadKey(taskId, stageId);
  return {
    status: "found",
    threadKey,
    isStale: false,
    session: {
      taskId,
      stageId,
      threadKey,
      logicalThreadId: `${threadKey}::logical`,
      runtimeClass,
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    },
  };
}

function makeStaleLookup(taskId: string, stageId: string): StageChatSessionLookupResult {
  const threadKey = makeThreadKey(taskId, stageId);
  return {
    status: "stale",
    threadKey,
    isStale: true,
    staleReason: "age-threshold",
    staleAgeMs: 1000 * 60 * 60 * 24 * 8,
    session: {
      taskId,
      stageId,
      threadKey,
      logicalThreadId: `${threadKey}::logical`,
      runtimeClass: "local",
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    },
  };
}

// ---------------------------------------------------------------------------
// resolveStageChatSessionStatus
// ---------------------------------------------------------------------------

describe("resolveStageChatSessionStatus", () => {
  it("returns 'none' for missing status", () => {
    expect(resolveStageChatSessionStatus({ status: "missing" })).toBe("none");
  });

  it("returns 'active' for found status", () => {
    expect(resolveStageChatSessionStatus({ status: "found" })).toBe("active");
  });

  it("returns 'stale' for stale status", () => {
    expect(resolveStageChatSessionStatus({ status: "stale" })).toBe("stale");
  });
});

// ---------------------------------------------------------------------------
// resolveStageChatLifecycleActions
// ---------------------------------------------------------------------------

describe("resolveStageChatLifecycleActions", () => {
  it("offers only 'open' when no session exists", () => {
    expect(resolveStageChatLifecycleActions("none")).toEqual(["open"]);
  });

  it("offers resume, reset, discard for an active session", () => {
    expect(resolveStageChatLifecycleActions("active")).toEqual(["resume", "reset", "discard"]);
  });

  it("offers resume, reset, discard for a stale session", () => {
    expect(resolveStageChatLifecycleActions("stale")).toEqual(["resume", "reset", "discard"]);
  });
});

// ---------------------------------------------------------------------------
// Navigation intents
// ---------------------------------------------------------------------------

describe("buildEnterStageChatIntent", () => {
  it("produces an enter-stage-chat intent with stage identity", () => {
    const intent = buildEnterStageChatIntent({ id: "implementation", title: "Implementation" });
    expect(intent).toEqual({
      kind: "enter-stage-chat",
      stageId: "implementation",
      stageTitle: "Implementation",
    });
  });
});

describe("buildReturnToWorkflowIntent", () => {
  it("produces a return-to-workflow-view intent", () => {
    const intent = buildReturnToWorkflowIntent();
    expect(intent).toEqual({ kind: "return-to-workflow-view" });
  });
});

// ---------------------------------------------------------------------------
// buildStageChatWorkflowEntries
// ---------------------------------------------------------------------------

describe("buildStageChatWorkflowEntries", () => {
  const TASK_ID = "001";

  it("produces one entry per stage", () => {
    const stages = makeStages(["context", "implementation", "validation"]);
    const boundary = makeMockBoundary(TASK_ID, {});

    const entries = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.stageId)).toEqual(["context", "implementation", "validation"]);
  });

  it("stage with no existing session gets 'none' status and open action only", () => {
    const stages = makeStages(["context"]);
    const boundary = makeMockBoundary(TASK_ID, {});

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.sessionStatus).toBe("none");
    expect(entry.availableActions).toEqual(["open"]);
  });

  it("stage with active session gets 'active' status and resume/reset/discard actions", () => {
    const stages = makeStages(["implementation"]);
    const boundary = makeMockBoundary(TASK_ID, {
      implementation: makeFoundLookup(TASK_ID, "implementation"),
    });

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.sessionStatus).toBe("active");
    expect(entry.availableActions).toEqual(["resume", "reset", "discard"]);
  });

  it("stage with stale session gets 'stale' status and resume/reset/discard actions", () => {
    const stages = makeStages(["validation"]);
    const boundary = makeMockBoundary(TASK_ID, {
      validation: makeStaleLookup(TASK_ID, "validation"),
    });

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.sessionStatus).toBe("stale");
    expect(entry.availableActions).toEqual(["resume", "reset", "discard"]);
  });

  it("thread key is derived from taskId and stageId", () => {
    const stages = makeStages(["context"]);
    const boundary = makeMockBoundary(TASK_ID, {});

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.threadKey).toBe(`${TASK_ID}::context`);
  });

  it("stage description is passed through when present", () => {
    const stages = [{ id: "ctx", title: "Context", description: "Understand the scope" }];
    const boundary = makeMockBoundary(TASK_ID, {});

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.stageDescription).toBe("Understand the scope");
  });

  it("stage description is undefined when absent", () => {
    const stages = [{ id: "ctx", title: "Context", description: undefined }];
    const boundary = makeMockBoundary(TASK_ID, {});

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.stageDescription).toBeUndefined();
  });

  it("runtimeClass is taken from active session when available", () => {
    const stages = makeStages(["impl"]);
    const boundary = makeMockBoundary(TASK_ID, {
      impl: makeFoundLookup(TASK_ID, "impl", "cloud"),
    });

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.runtimeClass).toBe("cloud");
  });

  it("runtimeClass is undefined for stages with no session", () => {
    const stages = makeStages(["impl"]);
    const boundary = makeMockBoundary(TASK_ID, {});

    const [entry] = buildStageChatWorkflowEntries({ taskId: TASK_ID, stages, boundary });

    expect(entry.runtimeClass).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildStageChatSurfaceModel
// ---------------------------------------------------------------------------

describe("buildStageChatSurfaceModel", () => {
  const TASK_ID = "002";
  const STAGE = { id: "implementation", title: "Implementation", description: "Build the thing" };

  it("reflects 'active' session status when session is found", () => {
    const boundary = makeMockBoundary(TASK_ID, {
      implementation: makeFoundLookup(TASK_ID, "implementation"),
    });

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.sessionStatus).toBe("active");
    expect(model.lifecycleControls).toEqual(["resume", "reset", "discard"]);
  });

  it("reflects 'none' session status when no session exists", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.sessionStatus).toBe("none");
    expect(model.lifecycleControls).toEqual(["open"]);
  });

  it("reflects 'stale' session status for a stale session", () => {
    const boundary = makeMockBoundary(TASK_ID, {
      implementation: makeStaleLookup(TASK_ID, "implementation"),
    });

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.sessionStatus).toBe("stale");
  });

  it("defaults runtimeClass to 'local' when session has none", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.runtimeClass).toBe("local");
  });

  it("uses explicit runtimeClass override when provided", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const model = buildStageChatSurfaceModel({
      taskId: TASK_ID,
      stage: STAGE,
      boundary,
      runtimeClass: "cloud",
    });

    expect(model.runtimeClass).toBe("cloud");
  });

  it("reflects handoff count and hasHandoffs from lookupHandoffs", () => {
    const boundary = makeMockBoundary(TASK_ID, {}, { implementation: 2 });

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.hasHandoffs).toBe(true);
    expect(model.handoffCount).toBe(2);
  });

  it("has zero handoffs by default", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.hasHandoffs).toBe(false);
    expect(model.handoffCount).toBe(0);
  });

  it("carries stage identity fields", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const model = buildStageChatSurfaceModel({ taskId: TASK_ID, stage: STAGE, boundary });

    expect(model.taskId).toBe(TASK_ID);
    expect(model.stageId).toBe("implementation");
    expect(model.stageTitle).toBe("Implementation");
    expect(model.stageDescription).toBe("Build the thing");
  });
});

// ---------------------------------------------------------------------------
// buildStageChatWorkflowViewModel
// ---------------------------------------------------------------------------

describe("buildStageChatWorkflowViewModel", () => {
  const TASK_ID = "003";
  const STAGES = makeStages(["context", "implementation", "validation"]);

  it("produces stage entries for all stages in workflow-view layer", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "workflow-view" },
      stages: STAGES,
      boundary,
    });

    expect(vm.layer.kind).toBe("workflow-view");
    expect(vm.stages).toHaveLength(3);
    expect(vm.surface).toBeUndefined();
  });

  it("produces surface model when in stage-chat layer and stage exists", () => {
    const boundary = makeMockBoundary(TASK_ID, {
      implementation: makeFoundLookup(TASK_ID, "implementation"),
    });

    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "stage-chat", stageId: "implementation", stageTitle: "Implementation" },
      stages: STAGES,
      boundary,
    });

    expect(vm.layer.kind).toBe("stage-chat");
    expect(vm.surface).toBeDefined();
    expect(vm.surface?.stageId).toBe("implementation");
    expect(vm.surface?.sessionStatus).toBe("active");
  });

  it("surface is undefined when stage-chat layer refers to unknown stageId", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "stage-chat", stageId: "unknown-stage", stageTitle: "Unknown" },
      stages: STAGES,
      boundary,
    });

    expect(vm.surface).toBeUndefined();
  });

  it("stage entries are still present in stage-chat layer for workflow orientation", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "stage-chat", stageId: "context", stageTitle: "Context" },
      stages: STAGES,
      boundary,
    });

    expect(vm.stages).toHaveLength(3);
  });

  it("taskId is threaded through to the top-level model", () => {
    const boundary = makeMockBoundary(TASK_ID, {});

    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "workflow-view" },
      stages: STAGES,
      boundary,
    });

    expect(vm.taskId).toBe(TASK_ID);
  });
});

// ---------------------------------------------------------------------------
// renderStageChatStageEntry
// ---------------------------------------------------------------------------

describe("renderStageChatStageEntry", () => {
  function makeEntry(overrides: Partial<StageChatStageEntry> = {}): StageChatStageEntry {
    return {
      stageId: "context",
      stageTitle: "Context and Readiness",
      sessionStatus: "none",
      threadKey: "003::context",
      availableActions: ["open"],
      ...overrides,
    };
  }

  it("includes stage title in rendered output", () => {
    const html = renderStageChatStageEntry(makeEntry());
    expect(html).toContain("Context and Readiness");
  });

  it("includes open button for no-session stage", () => {
    const html = renderStageChatStageEntry(
      makeEntry({ sessionStatus: "none", availableActions: ["open"] }),
    );
    expect(html).toContain(OPEN_STAGE_CHAT_COMMAND_ID);
    expect(html).toContain('data-action="open"');
  });

  it("includes resume, reset, discard buttons for active session", () => {
    const html = renderStageChatStageEntry(
      makeEntry({
        sessionStatus: "active",
        availableActions: ["resume", "reset", "discard"],
      }),
    );
    expect(html).toContain('data-action="resume"');
    expect(html).toContain(RESET_STAGE_CHAT_COMMAND_ID);
    expect(html).toContain(DISCARD_STAGE_CHAT_COMMAND_ID);
  });

  it("includes description when present", () => {
    const html = renderStageChatStageEntry(
      makeEntry({ stageDescription: "Understand scope before starting" }),
    );
    expect(html).toContain("Understand scope before starting");
  });

  it("omits description line when absent", () => {
    const html = renderStageChatStageEntry(makeEntry({ stageDescription: undefined }));
    expect(html).not.toContain("description");
  });

  it("includes thread key as data attribute", () => {
    const html = renderStageChatStageEntry(makeEntry({ threadKey: "003::context" }));
    expect(html).toContain('data-thread-key="003::context"');
  });

  it("escapes HTML in stage title", () => {
    const html = renderStageChatStageEntry(makeEntry({ stageTitle: "<Script> & Test" }));
    expect(html).toContain("&lt;Script&gt;");
    expect(html).toContain("&amp;");
  });
});

// ---------------------------------------------------------------------------
// renderStageChatSurface
// ---------------------------------------------------------------------------

describe("renderStageChatSurface", () => {
  function makeSurface(overrides: Partial<ReturnType<typeof buildStageChatSurfaceModel>> = {}) {
    return {
      taskId: "003",
      stageId: "implementation",
      stageTitle: "Implementation",
      stageDescription: "Build the feature",
      sessionStatus: "active" as const,
      threadKey: "003::implementation",
      runtimeClass: "local" as const,
      hasHandoffs: false,
      handoffCount: 0,
      lifecycleControls: ["resume", "reset", "discard"] as StageChatLifecycleAction[],
      generatedAt: new Date(1700000000000).toISOString(),
      ...overrides,
    };
  }

  it("includes stage title", () => {
    const html = renderStageChatSurface(makeSurface());
    expect(html).toContain("Implementation");
  });

  it("includes return-to-workflow button", () => {
    const html = renderStageChatSurface(makeSurface());
    expect(html).toContain(RETURN_TO_WORKFLOW_VIEW_COMMAND_ID);
  });

  it("includes lifecycle control buttons", () => {
    const html = renderStageChatSurface(makeSurface());
    expect(html).toContain('data-action="resume"');
    expect(html).toContain(RESET_STAGE_CHAT_COMMAND_ID);
    expect(html).toContain(DISCARD_STAGE_CHAT_COMMAND_ID);
  });

  it("shows handoff count when hasHandoffs is true", () => {
    const html = renderStageChatSurface(makeSurface({ hasHandoffs: true, handoffCount: 3 }));
    expect(html).toContain("Runtime Transitions");
    expect(html).toContain("3");
  });

  it("omits handoff line when hasHandoffs is false", () => {
    const html = renderStageChatSurface(makeSurface({ hasHandoffs: false, handoffCount: 0 }));
    expect(html).not.toContain("Runtime Transitions");
  });

  it("includes description when present", () => {
    const html = renderStageChatSurface(makeSurface({ stageDescription: "Build the feature" }));
    expect(html).toContain("Build the feature");
  });

  it("displays runtime class in meta", () => {
    const html = renderStageChatSurface(makeSurface({ runtimeClass: "cloud" }));
    expect(html).toContain("cloud");
  });
});

// ---------------------------------------------------------------------------
// renderStageChatWorkflowPanel
// ---------------------------------------------------------------------------

describe("renderStageChatWorkflowPanel", () => {
  const TASK_ID = "004";
  const STAGES = makeStages(["context", "implementation", "validation"]);

  it("workflow-view layer renders all stage cards", () => {
    const boundary = makeMockBoundary(TASK_ID, {});
    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "workflow-view" },
      stages: STAGES,
      boundary,
    });

    const html = renderStageChatWorkflowPanel(vm);

    expect(html).toContain("layer-workflow-view");
    expect(html).toContain("Stage context");
    expect(html).toContain("Stage implementation");
    expect(html).toContain("Stage validation");
  });

  it("stage-chat layer renders surface and other-stages orientation list", () => {
    const boundary = makeMockBoundary(TASK_ID, {
      implementation: makeFoundLookup(TASK_ID, "implementation"),
    });
    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "stage-chat", stageId: "implementation", stageTitle: "Implementation" },
      stages: STAGES,
      boundary,
    });

    const html = renderStageChatWorkflowPanel(vm);

    expect(html).toContain("layer-stage-chat");
    expect(html).toContain("stage-chat-surface");
    expect(html).toContain(RETURN_TO_WORKFLOW_VIEW_COMMAND_ID);
    // Other stages appear in orientation list
    expect(html).toContain("Stage context");
    expect(html).toContain("Stage validation");
  });

  it("stage-chat layer without surface falls through to workflow-view rendering", () => {
    const boundary = makeMockBoundary(TASK_ID, {});
    const vm: StageChatWorkflowViewModel = {
      taskId: TASK_ID,
      layer: { kind: "stage-chat", stageId: "unknown", stageTitle: "Unknown" },
      stages: buildStageChatWorkflowEntries({ taskId: TASK_ID, stages: STAGES, boundary }),
      surface: undefined,
      generatedAt: new Date(1700000000000).toISOString(),
    };

    const html = renderStageChatWorkflowPanel(vm);

    // Falls through to workflow-view rendering since surface is absent
    expect(html).toContain("layer-workflow-view");
  });

  it("workflow-view layer does not contain the return button", () => {
    const boundary = makeMockBoundary(TASK_ID, {});
    const vm = buildStageChatWorkflowViewModel({
      taskId: TASK_ID,
      layer: { kind: "workflow-view" },
      stages: STAGES,
      boundary,
    });

    const html = renderStageChatWorkflowPanel(vm);

    expect(html).not.toContain(RETURN_TO_WORKFLOW_VIEW_COMMAND_ID);
  });
});
