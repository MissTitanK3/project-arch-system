import { describe, expect, it, vi } from "vitest";
import {
  buildRunReviewContext,
  deriveRunReviewActions,
  executeRunReviewAction,
  lookupRunReviewContext,
  type RunReviewAction,
} from "./runReviewContext";
import type { RunStatusViewModel } from "../integration/runStatusLookup";
import type { ProjectArchBoundary } from "../integration/projectArchBoundary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatusViewModel(overrides: Partial<RunStatusViewModel> = {}): RunStatusViewModel {
  return {
    runId: "run-2026-04-02-000001",
    taskRef: "001",
    phase: "pre-launch",
    runRecordExists: false,
    orchestrationRecordExists: false,
    artifacts: {},
    ...overrides,
  };
}

function makePostLaunchModel(overrides: Partial<RunStatusViewModel> = {}): RunStatusViewModel {
  return makeStatusViewModel({
    phase: "post-launch",
    runtime: "codex-cli",
    runHandle: "codex-cli:run-2026-04-02-000001",
    launchedAt: "2026-04-02T10:00:00.000Z",
    artifacts: {
      launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-02-000001.json",
    },
    ...overrides,
  });
}

function makeBoundary(runCliJson: ProjectArchBoundary["runCliJson"]): ProjectArchBoundary {
  return {
    transport: "cli-json",
    cliCommand: "pa",
    runCliJson,
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

function actionIds(actions: RunReviewAction[]): string[] {
  return actions.map((a) => a.id);
}

// ---------------------------------------------------------------------------
// deriveRunReviewActions
// ---------------------------------------------------------------------------

describe("deriveRunReviewActions", () => {
  const runId = "run-2026-04-02-000001";
  const emptyArtifacts = {};

  it("returns no actions for pre-launch with no artifacts", () => {
    const actions = deriveRunReviewActions(runId, "pre-launch", emptyArtifacts);
    expect(actions).toHaveLength(0);
  });

  it("returns no actions for launch-dispatched with no artifacts", () => {
    const actions = deriveRunReviewActions(runId, "launch-dispatched", emptyArtifacts);
    expect(actions).toHaveLength(0);
  });

  it("returns validate for post-launch-awaiting-validation", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "post-launch-awaiting-validation", emptyArtifacts),
    );
    expect(ids).toContain("validate");
    expect(ids).not.toContain("reconcile");
  });

  it("returns validate for validation-failed (retry)", () => {
    const ids = actionIds(deriveRunReviewActions(runId, "validation-failed", emptyArtifacts));
    expect(ids).toContain("validate");
    expect(ids).not.toContain("reconcile");
  });

  it("returns reconcile for validation-passed-awaiting-reconcile", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "validation-passed-awaiting-reconcile", emptyArtifacts),
    );
    expect(ids).toContain("reconcile");
    expect(ids).not.toContain("validate");
  });

  it("returns reconcile for reconciliation-failed (retry)", () => {
    const ids = actionIds(deriveRunReviewActions(runId, "reconciliation-failed", emptyArtifacts));
    expect(ids).toContain("reconcile");
    expect(ids).not.toContain("validate");
  });

  it("returns no command actions for reconciled (nothing left to do)", () => {
    const ids = actionIds(deriveRunReviewActions(runId, "reconciled", emptyArtifacts));
    expect(ids).not.toContain("validate");
    expect(ids).not.toContain("reconcile");
  });

  it("returns validate for orchestration-waiting-for-import", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "orchestration-waiting-for-import", emptyArtifacts),
    );
    expect(ids).toContain("validate");
  });

  it("returns validate for orchestration-failed fallback", () => {
    const ids = actionIds(deriveRunReviewActions(runId, "orchestration-failed", emptyArtifacts));
    expect(ids).toContain("validate");
  });

  it("returns view-launch-record when launchRecordPath is present", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "launch-dispatched", {
        launchRecordPath: ".project-arch/agent-runtime/launches/run-1.json",
      }),
    );
    expect(ids).toContain("view-launch-record");
  });

  it("returns view-run-record when runRecordPath is present", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "reconciled", {
        runRecordPath: ".project-arch/agent-runtime/runs/run-1.json",
      }),
    );
    expect(ids).toContain("view-run-record");
  });

  it("returns view-orchestration when orchestrationPath is present", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "orchestration-completed", {
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-1.json",
      }),
    );
    expect(ids).toContain("view-orchestration");
  });

  it("validate action carries correct cliArgs", () => {
    const actions = deriveRunReviewActions(
      runId,
      "post-launch-awaiting-validation",
      emptyArtifacts,
    );
    const validate = actions.find((a) => a.id === "validate");
    expect(validate?.cliArgs).toEqual(["agent", "validate", runId]);
  });

  it("reconcile action carries correct cliArgs", () => {
    const actions = deriveRunReviewActions(
      runId,
      "validation-passed-awaiting-reconcile",
      emptyArtifacts,
    );
    const reconcile = actions.find((a) => a.id === "reconcile");
    expect(reconcile?.cliArgs).toEqual(["agent", "reconcile", runId]);
  });

  it("view-run-record action has empty cliArgs and artifactPath set", () => {
    const path = ".project-arch/agent-runtime/runs/run-1.json";
    const actions = deriveRunReviewActions(runId, "reconciled", { runRecordPath: path });
    const viewAction = actions.find((a) => a.id === "view-run-record");
    expect(viewAction?.cliArgs).toEqual([]);
    expect(viewAction?.artifactPath).toBe(path);
  });

  it("full post-launch-reconciled scenario returns only view actions", () => {
    const ids = actionIds(
      deriveRunReviewActions(runId, "reconciled", {
        launchRecordPath: ".project-arch/agent-runtime/launches/run-1.json",
        runRecordPath: ".project-arch/agent-runtime/runs/run-1.json",
      }),
    );
    expect(ids).toEqual(expect.arrayContaining(["view-run-record", "view-launch-record"]));
    expect(ids).not.toContain("validate");
    expect(ids).not.toContain("reconcile");
  });
});

// ---------------------------------------------------------------------------
// buildRunReviewContext
// ---------------------------------------------------------------------------

describe("buildRunReviewContext", () => {
  it("builds a pre-launch context with no follow-up actions", () => {
    const vm = makeStatusViewModel({ phase: "pre-launch" });
    const ctx = buildRunReviewContext(vm);

    expect(ctx.runId).toBe(vm.runId);
    expect(ctx.taskRef).toBe(vm.taskRef);
    expect(ctx.outcome).toBe("pre-launch");
    expect(ctx.followUpActions).toHaveLength(0);
  });

  it("builds a launch-dispatched context with a launch-record view action", () => {
    const vm = makeStatusViewModel({
      phase: "launch-dispatched",
      runtime: "codex-cli",
      runHandle: "codex-cli:run-1",
      launchedAt: "2026-04-02T10:00:00.000Z",
      artifacts: {
        launchRecordPath: ".project-arch/agent-runtime/launches/run-1.json",
      },
    });
    const ctx = buildRunReviewContext(vm);

    expect(ctx.outcome).toBe("launch-dispatched");
    expect(ctx.runtime).toBe("codex-cli");
    expect(ctx.runHandle).toBe("codex-cli:run-1");
    expect(ctx.launchedAt).toBe("2026-04-02T10:00:00.000Z");
    expect(actionIds(ctx.followUpActions)).toContain("view-launch-record");
  });

  it("builds a post-launch validate context", () => {
    const vm = makePostLaunchModel({
      runRecordExists: true,
      artifacts: {
        launchRecordPath: ".project-arch/agent-runtime/launches/run-1.json",
        runRecordPath: ".project-arch/agent-runtime/runs/run-1.json",
      },
    });
    const ctx = buildRunReviewContext(vm);

    expect(ctx.outcome).toBe("post-launch-awaiting-validation");
    expect(ctx.runRecordExists).toBe(true);
    expect(actionIds(ctx.followUpActions)).toContain("validate");
    expect(actionIds(ctx.followUpActions)).toContain("view-run-record");
    expect(actionIds(ctx.followUpActions)).toContain("view-launch-record");
  });

  it("builds a reconciled context with no command actions", () => {
    const vm = makePostLaunchModel({
      runRecordExists: true,
      runReviewStatus: "reconciled",
      artifacts: {
        launchRecordPath: ".project-arch/agent-runtime/launches/run-1.json",
        runRecordPath: ".project-arch/agent-runtime/runs/run-1.json",
      },
    });
    const ctx = buildRunReviewContext(vm);

    expect(ctx.outcome).toBe("reconciled");
    expect(ctx.runReviewStatus).toBe("reconciled");
    expect(actionIds(ctx.followUpActions)).not.toContain("validate");
    expect(actionIds(ctx.followUpActions)).not.toContain("reconcile");
    expect(actionIds(ctx.followUpActions)).toContain("view-run-record");
  });

  it("includes orchestration metadata in the context", () => {
    const vm = makePostLaunchModel({
      orchestrationRecordExists: true,
      orchestration: {
        status: "in-progress",
        completedRoles: ["planner"],
        path: ".project-arch/agent-runtime/orchestration/run-1.json",
      },
      artifacts: {
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-1.json",
      },
    });
    const ctx = buildRunReviewContext(vm);

    expect(ctx.outcome).toBe("orchestration-in-progress");
    expect(ctx.orchestrationRecordExists).toBe(true);
    expect(actionIds(ctx.followUpActions)).toContain("view-orchestration");
  });

  it("passes artifact paths through to context.artifacts", () => {
    const artifacts = {
      launchRecordPath: ".project-arch/agent-runtime/launches/run-2.json",
      runRecordPath: ".project-arch/agent-runtime/runs/run-2.json",
    };
    const vm = makePostLaunchModel({ runRecordExists: true, artifacts });
    const ctx = buildRunReviewContext(vm);

    expect(ctx.artifacts).toEqual(artifacts);
  });
});

// ---------------------------------------------------------------------------
// lookupRunReviewContext
// ---------------------------------------------------------------------------

describe("lookupRunReviewContext", () => {
  function makeStatusPayload(runId: string, phase: string): unknown {
    return {
      success: true,
      data: {
        schemaVersion: "2.0",
        runId,
        taskRef: "001",
        status: "launch-status",
        phase,
        lifecycleBoundary: "prepare-first",
        runRecordExists: false,
        orchestrationRecordExists: false,
        runtime: "codex-cli",
        launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
      },
    };
  }

  it("calls boundary with agent status args and returns review context", async () => {
    const runId = "run-2026-04-02-000010";
    const runCliJson = vi.fn(async () =>
      makeStatusPayload(runId, "launch-dispatched"),
    ) as unknown as ProjectArchBoundary["runCliJson"];

    const ctx = await lookupRunReviewContext({
      runId,
      boundary: makeBoundary(runCliJson),
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "status", runId],
      cwd: undefined,
    });
    expect(ctx.runId).toBe(runId);
    expect(ctx.outcome).toBe("launch-dispatched");
    expect(actionIds(ctx.followUpActions)).toContain("view-launch-record");
  });

  it("passes cwd through to the boundary call", async () => {
    const runId = "run-2026-04-02-000011";
    const runCliJson = vi.fn(async () =>
      makeStatusPayload(runId, "pre-launch"),
    ) as unknown as ProjectArchBoundary["runCliJson"];

    await lookupRunReviewContext({
      runId,
      cwd: "/tmp/workspace",
      boundary: makeBoundary(runCliJson),
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "status", runId],
      cwd: "/tmp/workspace",
    });
  });

  it("returns a pre-launch context for a run with no launch record", async () => {
    const runId = "run-2026-04-02-000012";
    const preLaunchPayload: unknown = {
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
        // no launchRecordPath - run has not been dispatched
      },
    };
    const runCliJson = vi.fn(
      async () => preLaunchPayload,
    ) as unknown as ProjectArchBoundary["runCliJson"];

    const ctx = await lookupRunReviewContext({ runId, boundary: makeBoundary(runCliJson) });

    expect(ctx.outcome).toBe("pre-launch");
    expect(ctx.followUpActions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// executeRunReviewAction
// ---------------------------------------------------------------------------

describe("executeRunReviewAction", () => {
  it("calls runCliJson with the action's cliArgs", async () => {
    const runId = "run-2026-04-02-000020";
    const validatePayload = { success: true, data: { runId, ok: true } };
    const runCliJson = vi.fn(
      async () => validatePayload,
    ) as unknown as ProjectArchBoundary["runCliJson"];

    const action: RunReviewAction = {
      id: "validate",
      label: "Validate Run",
      description: "Run pa agent validate.",
      cliArgs: ["agent", "validate", runId],
    };

    const result = await executeRunReviewAction({
      action,
      boundary: makeBoundary(runCliJson),
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "validate", runId],
      cwd: undefined,
    });
    expect(result).toEqual(validatePayload);
  });

  it("throws for a view-only action", async () => {
    const action: RunReviewAction = {
      id: "view-run-record",
      label: "View Run Record",
      description: "Open the run record.",
      cliArgs: [],
      artifactPath: ".project-arch/agent-runtime/runs/run-1.json",
    };

    await expect(
      executeRunReviewAction({
        action,
        boundary: makeBoundary(vi.fn() as unknown as ProjectArchBoundary["runCliJson"]),
      }),
    ).rejects.toThrow("view-only action");
  });

  it("passes cwd through to the boundary", async () => {
    const runId = "run-2026-04-02-000021";
    const runCliJson = vi.fn(async () => ({
      success: true,
      data: {},
    })) as unknown as ProjectArchBoundary["runCliJson"];

    const action: RunReviewAction = {
      id: "reconcile",
      label: "Reconcile Run",
      description: "Reconcile the run.",
      cliArgs: ["agent", "reconcile", runId],
    };

    await executeRunReviewAction({
      action,
      boundary: makeBoundary(runCliJson),
      cwd: "/tmp/workspace",
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "reconcile", runId],
      cwd: "/tmp/workspace",
    });
  });
});
