import { describe, expect, it, vi } from "vitest";
import {
  buildOrchestrationReviewContext,
  deriveHandoffSummaries,
  deriveRoleProgress,
  describeOrchestrationPosition,
  lookupOrchestrationReviewContext,
  ORCHESTRATION_ROLE_ORDER,
  type OrchestrationRoleProgress,
} from "./orchestrationContext";
import type { RunStatusViewModel } from "../integration/runStatusLookup";
import type { ProjectArchBoundary } from "../integration/projectArchBoundary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RoleState = OrchestrationRoleProgress["state"];

function statesFor(progress: OrchestrationRoleProgress[]): RoleState[] {
  return progress.map((p) => p.state);
}

function makeOrchestrationViewModel(
  overrides: Partial<RunStatusViewModel> = {},
): RunStatusViewModel {
  return {
    runId: "run-2026-04-02-000001",
    taskRef: "001",
    phase: "post-launch",
    runRecordExists: false,
    orchestrationRecordExists: true,
    orchestration: {
      status: "in-progress",
      completedRoles: [],
      path: ".project-arch/agent-runtime/orchestration/run-2026-04-02-000001.json",
    },
    artifacts: {
      orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-02-000001.json",
    },
    ...overrides,
  };
}

function makeBoundary(payload: unknown): ProjectArchBoundary {
  return {
    transport: "cli-json",
    cliCommand: "pa",
    runCliJson: vi.fn(async () => payload) as unknown as ProjectArchBoundary["runCliJson"],
    parseArtifact: vi.fn(),
    parseResultBundle: vi.fn(),
    parseRuntimeInventoryListResult: vi.fn(),
    parseRuntimeReadinessCheckResult: vi.fn(),
    parseRuntimeScanResult: vi.fn(),
    readRuntimeInventoryList: vi.fn(),
    readRuntimeReadinessCheck: vi.fn(),
    readRuntimeScan: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// deriveRoleProgress
// ---------------------------------------------------------------------------

describe("deriveRoleProgress", () => {
  it("marks all roles pending when none completed and status is in-progress", () => {
    const progress = deriveRoleProgress([], "in-progress");
    // first non-completed is in-progress, rest are pending
    expect(statesFor(progress)).toEqual(["in-progress", "pending", "pending", "pending"]);
  });

  it("marks roles in correct order: completed then in-progress then pending", () => {
    const progress = deriveRoleProgress(["planner"], "in-progress");
    expect(statesFor(progress)).toEqual(["completed", "in-progress", "pending", "pending"]);
  });

  it("marks two completed roles then in-progress then pending", () => {
    const progress = deriveRoleProgress(["planner", "implementer"], "in-progress");
    expect(statesFor(progress)).toEqual(["completed", "completed", "in-progress", "pending"]);
  });

  it("marks three completed roles then in-progress for last", () => {
    const progress = deriveRoleProgress(["planner", "implementer", "reviewer"], "in-progress");
    expect(statesFor(progress)).toEqual(["completed", "completed", "completed", "in-progress"]);
  });

  it("marks all completed for completed status", () => {
    const progress = deriveRoleProgress(
      ["planner", "implementer", "reviewer", "reconciler"],
      "completed",
    );
    expect(statesFor(progress)).toEqual(["completed", "completed", "completed", "completed"]);
  });

  it("marks first non-completed as failed for failed status", () => {
    const progress = deriveRoleProgress(["planner"], "failed");
    expect(statesFor(progress)).toEqual(["completed", "failed", "pending", "pending"]);
  });

  it("marks first role as failed when none completed and status is failed", () => {
    const progress = deriveRoleProgress([], "failed");
    expect(statesFor(progress)).toEqual(["failed", "pending", "pending", "pending"]);
  });

  it("marks first non-completed as in-progress for waiting-for-result-import", () => {
    const progress = deriveRoleProgress(["planner"], "waiting-for-result-import");
    expect(statesFor(progress)).toEqual(["completed", "in-progress", "pending", "pending"]);
  });

  it("preserves role ordering from ORCHESTRATION_ROLE_ORDER", () => {
    const progress = deriveRoleProgress([], "in-progress");
    expect(progress.map((p) => p.role)).toEqual([...ORCHESTRATION_ROLE_ORDER]);
  });
});

// ---------------------------------------------------------------------------
// deriveHandoffSummaries
// ---------------------------------------------------------------------------

describe("deriveHandoffSummaries", () => {
  it("returns three handoff summaries", () => {
    const summaries = deriveHandoffSummaries([]);
    expect(summaries).toHaveLength(3);
  });

  it("no handoffs crossed when no roles completed", () => {
    const summaries = deriveHandoffSummaries([]);
    expect(summaries.every((h) => !h.crossed)).toBe(true);
  });

  it("crosses prepare boundary when planner completes", () => {
    const summaries = deriveHandoffSummaries(["planner"]);
    const prepare = summaries.find((h) => h.lifecycleBoundary === "prepare");
    expect(prepare?.crossed).toBe(true);
    expect(summaries.filter((h) => h.crossed)).toHaveLength(1);
  });

  it("crosses prepare and validate boundaries when planner and implementer complete", () => {
    const summaries = deriveHandoffSummaries(["planner", "implementer"]);
    const crossed = summaries.filter((h) => h.crossed);
    expect(crossed).toHaveLength(2);
    expect(crossed.map((h) => h.lifecycleBoundary)).toContain("prepare");
    expect(crossed.map((h) => h.lifecycleBoundary)).toContain("validate");
  });

  it("crosses all boundaries when all roles complete", () => {
    const summaries = deriveHandoffSummaries(["planner", "implementer", "reviewer", "reconciler"]);
    // 3 handoffs, reconciler is last so reconciler→? doesn't appear
    expect(summaries.every((h) => h.crossed)).toBe(true);
  });

  it("handoff roles follow canonical ordering", () => {
    const summaries = deriveHandoffSummaries([]);
    expect(summaries[0]).toMatchObject({
      fromRole: "planner",
      toRole: "implementer",
      lifecycleBoundary: "prepare",
    });
    expect(summaries[1]).toMatchObject({
      fromRole: "implementer",
      toRole: "reviewer",
      lifecycleBoundary: "validate",
    });
    expect(summaries[2]).toMatchObject({
      fromRole: "reviewer",
      toRole: "reconciler",
      lifecycleBoundary: "reconcile",
    });
  });
});

// ---------------------------------------------------------------------------
// describeOrchestrationPosition
// ---------------------------------------------------------------------------

describe("describeOrchestrationPosition", () => {
  it("describes completed orchestration", () => {
    const progress = deriveRoleProgress(
      ["planner", "implementer", "reviewer", "reconciler"],
      "completed",
    );
    const pos = describeOrchestrationPosition("completed", progress);
    expect(pos).toContain("All roles completed");
  });

  it("describes the active role when in-progress", () => {
    const progress = deriveRoleProgress(["planner"], "in-progress");
    const pos = describeOrchestrationPosition("in-progress", progress);
    expect(pos.toLowerCase()).toContain("implementer");
    expect(pos.toLowerCase()).toContain("progress");
  });

  it("describes waiting-for-result-import position", () => {
    const progress = deriveRoleProgress(["planner"], "waiting-for-result-import");
    const pos = describeOrchestrationPosition("waiting-for-result-import", progress);
    expect(pos.toLowerCase()).toContain("waiting");
    expect(pos.toLowerCase()).toContain("import");
  });

  it("describes the failed role when status is failed", () => {
    const progress = deriveRoleProgress(["planner"], "failed");
    const pos = describeOrchestrationPosition("failed", progress);
    expect(pos.toLowerCase()).toContain("implementer");
    expect(pos.toLowerCase()).toContain("fail");
  });

  it("describes initial in-progress planner state", () => {
    const progress = deriveRoleProgress([], "in-progress");
    const pos = describeOrchestrationPosition("in-progress", progress);
    expect(pos.toLowerCase()).toContain("planner");
  });
});

// ---------------------------------------------------------------------------
// buildOrchestrationReviewContext
// ---------------------------------------------------------------------------

describe("buildOrchestrationReviewContext", () => {
  it("throws when status view model has no orchestration info", () => {
    const vm: RunStatusViewModel = {
      runId: "run-1",
      taskRef: "001",
      phase: "pre-launch",
      runRecordExists: false,
      orchestrationRecordExists: false,
      artifacts: {},
    };
    expect(() => buildOrchestrationReviewContext(vm)).toThrow("does not have orchestration info");
  });

  it("returns context with correct runId and taskRef", () => {
    const vm = makeOrchestrationViewModel();
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.runId).toBe(vm.runId);
    expect(ctx.taskRef).toBe(vm.taskRef);
  });

  it("derives in-progress status from orchestration info", () => {
    const vm = makeOrchestrationViewModel();
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.status).toBe("in-progress");
    expect(ctx.outcome).toBe("orchestration-in-progress");
  });

  it("identifies active role as planner when none completed", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: { status: "in-progress", completedRoles: [], path: undefined },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.activeRole).toBe("planner");
    expect(ctx.failedRole).toBeUndefined();
  });

  it("identifies active role as implementer when planner completed", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: {
        status: "in-progress",
        completedRoles: ["planner"],
        path: undefined,
      },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.activeRole).toBe("implementer");
  });

  it("identifies failed role as implementer when planner completed and status failed", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: {
        status: "failed",
        completedRoles: ["planner"],
        path: undefined,
      },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.failedRole).toBe("implementer");
    expect(ctx.activeRole).toBeUndefined();
  });

  it("produces four role progress entries in canonical order", () => {
    const vm = makeOrchestrationViewModel();
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.roleProgress).toHaveLength(4);
    expect(ctx.roleProgress.map((r) => r.role)).toEqual([...ORCHESTRATION_ROLE_ORDER]);
  });

  it("produces three handoff summaries", () => {
    const vm = makeOrchestrationViewModel();
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.handoffs).toHaveLength(3);
  });

  it("surfaces orchestration path from orchestration info", () => {
    const vm = makeOrchestrationViewModel();
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.orchestrationPath).toBe(
      ".project-arch/agent-runtime/orchestration/run-2026-04-02-000001.json",
    );
  });

  it("includes view-orchestration follow-up action when path is known", () => {
    const vm = makeOrchestrationViewModel({
      artifacts: {
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-02-000001.json",
      },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    const actionIds = ctx.followUpActions.map((a) => a.id);
    expect(actionIds).toContain("view-orchestration");
  });

  it("includes validate action for waiting-for-result-import", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: {
        status: "waiting-for-result-import",
        completedRoles: ["planner"],
        path: undefined,
      },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    const actionIds = ctx.followUpActions.map((a) => a.id);
    expect(actionIds).toContain("validate");
  });

  it("includes validate action for failed orchestration (fallback path)", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: {
        status: "failed",
        completedRoles: ["planner"],
        path: undefined,
      },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    const actionIds = ctx.followUpActions.map((a) => a.id);
    expect(actionIds).toContain("validate");
  });

  it("includes no command actions for completed orchestration", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: {
        status: "completed",
        completedRoles: ["planner", "implementer", "reviewer", "reconciler"],
        path: ".project-arch/agent-runtime/orchestration/run-1.json",
      },
      runReviewStatus: "reconciled",
      artifacts: {
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-1.json",
      },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    const commandActions = ctx.followUpActions.filter((a) => a.cliArgs.length > 0);
    expect(commandActions).toHaveLength(0);
    const actionIds = ctx.followUpActions.map((a) => a.id);
    expect(actionIds).toContain("view-orchestration");
  });

  it("includes baseReviewContext from task-002 layer", () => {
    const vm = makeOrchestrationViewModel();
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.baseReviewContext).toBeDefined();
    expect(ctx.baseReviewContext.runId).toBe(vm.runId);
    expect(ctx.baseReviewContext.outcome).toBe("orchestration-in-progress");
  });

  it("provides humanreadable lifecycle position string", () => {
    const vm = makeOrchestrationViewModel({
      orchestration: { status: "in-progress", completedRoles: ["planner"], path: undefined },
    });
    const ctx = buildOrchestrationReviewContext(vm);
    expect(typeof ctx.lifecyclePosition).toBe("string");
    expect(ctx.lifecyclePosition.length).toBeGreaterThan(0);
    expect(ctx.lifecyclePosition.toLowerCase()).toContain("implementer");
  });

  it("includes all artifact paths in context.artifacts", () => {
    const artifacts = {
      launchRecordPath: ".project-arch/agent-runtime/launches/run-1.json",
      orchestrationPath: ".project-arch/agent-runtime/orchestration/run-1.json",
    };
    const vm = makeOrchestrationViewModel({ artifacts });
    const ctx = buildOrchestrationReviewContext(vm);
    expect(ctx.artifacts).toEqual(artifacts);
  });
});

// ---------------------------------------------------------------------------
// lookupOrchestrationReviewContext
// ---------------------------------------------------------------------------

describe("lookupOrchestrationReviewContext", () => {
  function makeOrchestrationPayload(runId: string): unknown {
    return {
      success: true,
      data: {
        schemaVersion: "2.0",
        runId,
        taskRef: "001",
        status: "launch-status",
        phase: "post-launch",
        lifecycleBoundary: "prepare-first",
        runRecordExists: false,
        orchestrationRecordExists: true,
        orchestrationStatus: "in-progress",
        orchestrationPath: `.project-arch/agent-runtime/orchestration/${runId}.json`,
        orchestrationCompletedRoles: ["planner"],
        runtime: "codex-cli",
        launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
      },
    };
  }

  it("calls boundary with agent status args and returns orchestration context", async () => {
    const runId = "run-2026-04-02-000050";
    const boundary = makeBoundary(makeOrchestrationPayload(runId));

    const ctx = await lookupOrchestrationReviewContext({ runId, boundary });

    expect((boundary.runCliJson as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      args: ["agent", "status", runId],
    });
    expect(ctx.runId).toBe(runId);
    expect(ctx.status).toBe("in-progress");
    expect(ctx.activeRole).toBe("implementer");
  });

  it("passes cwd through to the boundary", async () => {
    const runId = "run-2026-04-02-000051";
    const boundary = makeBoundary(makeOrchestrationPayload(runId));

    await lookupOrchestrationReviewContext({ runId, cwd: "/tmp/ws", boundary });

    expect((boundary.runCliJson as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      cwd: "/tmp/ws",
    });
  });

  it("throws when the run has no orchestration info", async () => {
    const runId = "run-2026-04-02-000052";
    const payload = {
      success: true,
      data: {
        schemaVersion: "2.0",
        runId,
        taskRef: "001",
        status: "launch-status",
        phase: "pre-launch",
        lifecycleBoundary: "prepare-first",
        runRecordExists: false,
        orchestrationRecordExists: false,
      },
    };
    const boundary = makeBoundary(payload);

    await expect(lookupOrchestrationReviewContext({ runId, boundary })).rejects.toThrow(
      "does not have orchestration info",
    );
  });
});
