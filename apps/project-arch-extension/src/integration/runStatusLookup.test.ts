import { describe, expect, it, vi } from "vitest";
import {
  classifyRunStatusOutcome,
  lookupRunStatus,
  parseRunStatusPayload,
  resolveRunArtifacts,
  type RunStatusViewModel,
} from "./runStatusLookup";
import type { ProjectArchBoundary } from "./projectArchBoundary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePreLaunchPayload(runId = "run-2026-04-02-000001") {
  return {
    success: true,
    data: {
      schemaVersion: "2.0",
      runId,
      taskRef: runId,
      status: "launch-status",
      phase: "pre-launch",
      lifecycleBoundary: "prepare-first",
      runRecordExists: false,
      orchestrationRecordExists: false,
    },
  };
}

function makeLaunchDispatchedPayload(runId = "run-2026-04-02-000002") {
  return {
    success: true,
    data: {
      schemaVersion: "2.0",
      runId,
      taskRef: "002",
      status: "launch-status",
      phase: "launch-dispatched",
      lifecycleBoundary: "prepare-first",
      runRecordExists: false,
      orchestrationRecordExists: false,
      runtime: "codex-cli",
      runHandle: `codex-cli:${runId}`,
      launchedAt: "2026-04-02T11:00:00.000Z",
      launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
    },
  };
}

function makePostLaunchReconciledPayload(runId = "run-2026-04-02-000003") {
  return {
    success: true,
    data: {
      schemaVersion: "2.0",
      runId,
      taskRef: "003",
      status: "launch-status",
      phase: "post-launch",
      lifecycleBoundary: "prepare-first",
      runRecordExists: true,
      runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
      orchestrationRecordExists: false,
      runReviewStatus: "reconciled",
      runtime: "codex-cli",
      runHandle: `codex-cli:${runId}`,
      launchedAt: "2026-04-02T12:00:00.000Z",
      launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
    },
  };
}

function makeOrchestrationPayload(runId = "run-2026-04-02-000004") {
  return {
    success: true,
    data: {
      schemaVersion: "2.0",
      runId,
      taskRef: "004",
      status: "launch-status",
      phase: "post-launch",
      lifecycleBoundary: "prepare-first",
      runRecordExists: false,
      orchestrationRecordExists: true,
      orchestrationStatus: "in-progress",
      orchestrationPath: `.project-arch/agent-runtime/orchestration/${runId}.json`,
      orchestrationCompletedRoles: ["planner", "implementer"],
      runtime: "codex-cli",
      runHandle: `codex-cli:${runId}`,
      launchedAt: "2026-04-02T13:00:00.000Z",
    },
  };
}

// ---------------------------------------------------------------------------
// parseRunStatusPayload
// ---------------------------------------------------------------------------

describe("parseRunStatusPayload", () => {
  it("parses a pre-launch payload", () => {
    const result = parseRunStatusPayload(makePreLaunchPayload());

    expect(result.phase).toBe("pre-launch");
    expect(result.runRecordExists).toBe(false);
    expect(result.orchestrationRecordExists).toBe(false);
    expect(result.runReviewStatus).toBeUndefined();
    expect(result.orchestration).toBeUndefined();
    expect(result.artifacts.launchRecordPath).toBeUndefined();
  });

  it("parses a launch-dispatched payload with runtime metadata", () => {
    const payload = makeLaunchDispatchedPayload();
    const result = parseRunStatusPayload(payload);

    expect(result.phase).toBe("launch-dispatched");
    expect(result.runId).toBe(payload.data.runId);
    expect(result.taskRef).toBe("002");
    expect(result.runtime).toBe("codex-cli");
    expect(result.runHandle).toBe(`codex-cli:${payload.data.runId}`);
    expect(result.launchedAt).toBe("2026-04-02T11:00:00.000Z");
    expect(result.artifacts.launchRecordPath).toMatch(/launches\/run-/);
  });

  it("parses a post-launch payload with reconciled review status", () => {
    const payload = makePostLaunchReconciledPayload();
    const result = parseRunStatusPayload(payload);

    expect(result.phase).toBe("post-launch");
    expect(result.runRecordExists).toBe(true);
    expect(result.runReviewStatus).toBe("reconciled");
    expect(result.artifacts.runRecordPath).toMatch(/runs\/run-/);
  });

  it("parses an orchestration payload with completed roles", () => {
    const payload = makeOrchestrationPayload();
    const result = parseRunStatusPayload(payload);

    expect(result.orchestrationRecordExists).toBe(true);
    expect(result.orchestration).not.toBeUndefined();
    expect(result.orchestration?.status).toBe("in-progress");
    expect(result.orchestration?.completedRoles).toEqual(["planner", "implementer"]);
    expect(result.orchestration?.path).toMatch(/orchestration\/run-/);
    expect(result.artifacts.orchestrationPath).toMatch(/orchestration\/run-/);
  });

  it("throws on a failed operation result", () => {
    const payload = {
      success: false,
      errors: ["Run not found."],
    };

    expect(() => parseRunStatusPayload(payload)).toThrow("Run status lookup failed");
    expect(() => parseRunStatusPayload(payload)).toThrow("Run not found.");
  });

  it("throws when payload is not an object", () => {
    expect(() => parseRunStatusPayload("not-an-object")).toThrow(
      "Run status payload must be an object",
    );
  });

  it("throws when payload data is missing", () => {
    expect(() => parseRunStatusPayload({ success: true, data: null })).toThrow(
      "Run status payload is missing data",
    );
  });

  it("falls back to empty runId when field is absent", () => {
    const result = parseRunStatusPayload({
      success: true,
      data: {
        phase: "pre-launch",
        runRecordExists: false,
        orchestrationRecordExists: false,
      },
    });

    expect(result.runId).toBe("");
  });
});

// ---------------------------------------------------------------------------
// classifyRunStatusOutcome
// ---------------------------------------------------------------------------

describe("classifyRunStatusOutcome", () => {
  function makeViewModel(overrides: Partial<RunStatusViewModel>): RunStatusViewModel {
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

  it("returns pre-launch for pre-launch phase with no run record", () => {
    expect(classifyRunStatusOutcome(makeViewModel({ phase: "pre-launch" }))).toBe("pre-launch");
  });

  it("returns launch-dispatched for launch-dispatched phase", () => {
    expect(classifyRunStatusOutcome(makeViewModel({ phase: "launch-dispatched" }))).toBe(
      "launch-dispatched",
    );
  });

  it("returns launch-failed for launch-failed phase", () => {
    expect(classifyRunStatusOutcome(makeViewModel({ phase: "launch-failed" }))).toBe(
      "launch-failed",
    );
  });

  it("returns post-launch-awaiting-validation when post-launch with no review status", () => {
    expect(
      classifyRunStatusOutcome(makeViewModel({ phase: "post-launch", runRecordExists: true })),
    ).toBe("post-launch-awaiting-validation");
  });

  it("returns validation-failed when runReviewStatus is validation-failed", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          runRecordExists: true,
          runReviewStatus: "validation-failed",
        }),
      ),
    ).toBe("validation-failed");
  });

  it("returns validation-passed-awaiting-reconcile when runReviewStatus is validation-passed-awaiting-reconcile", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          runRecordExists: true,
          runReviewStatus: "validation-passed-awaiting-reconcile",
        }),
      ),
    ).toBe("validation-passed-awaiting-reconcile");
  });

  it("returns reconciliation-failed when runReviewStatus is reconciliation-failed", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          runRecordExists: true,
          runReviewStatus: "reconciliation-failed",
        }),
      ),
    ).toBe("reconciliation-failed");
  });

  it("returns reconciled when runReviewStatus is reconciled", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          runRecordExists: true,
          runReviewStatus: "reconciled",
        }),
      ),
    ).toBe("reconciled");
  });

  it("returns orchestration-in-progress when orchestration is in-progress", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          orchestrationRecordExists: true,
          orchestration: { status: "in-progress", completedRoles: [] },
        }),
      ),
    ).toBe("orchestration-in-progress");
  });

  it("returns orchestration-waiting-for-import when orchestration is waiting-for-result-import", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          orchestrationRecordExists: true,
          orchestration: { status: "waiting-for-result-import", completedRoles: ["planner"] },
        }),
      ),
    ).toBe("orchestration-waiting-for-import");
  });

  it("returns orchestration-completed when orchestration is complete", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          orchestrationRecordExists: true,
          orchestration: {
            status: "completed",
            completedRoles: ["planner", "implementer", "reviewer", "reconciler"],
          },
        }),
      ),
    ).toBe("orchestration-completed");
  });

  it("returns orchestration-failed when orchestration has failed", () => {
    expect(
      classifyRunStatusOutcome(
        makeViewModel({
          phase: "post-launch",
          orchestrationRecordExists: true,
          orchestration: { status: "failed", completedRoles: ["planner"] },
        }),
      ),
    ).toBe("orchestration-failed");
  });
});

// ---------------------------------------------------------------------------
// lookupRunStatus
// ---------------------------------------------------------------------------

describe("lookupRunStatus", () => {
  it("calls pa agent status <runId> --json via boundary and returns view model", async () => {
    const runId = "run-2026-04-02-000010";
    const runCliJson = vi.fn(async () =>
      makeLaunchDispatchedPayload(runId),
    ) as unknown as ProjectArchBoundary["runCliJson"];

    const result = await lookupRunStatus({
      runId,
      boundary: {
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
      },
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "status", runId],
      cwd: undefined,
    });
    expect(result.runId).toBe(runId);
    expect(result.phase).toBe("launch-dispatched");
    expect(result.runtime).toBe("codex-cli");
  });

  it("passes cwd through to the boundary call", async () => {
    const runId = "run-2026-04-02-000011";
    const runCliJson = vi.fn(async () =>
      makePreLaunchPayload(runId),
    ) as unknown as ProjectArchBoundary["runCliJson"];

    await lookupRunStatus({
      runId,
      cwd: "/tmp/test-workspace",
      boundary: {
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
      },
    });

    expect(runCliJson).toHaveBeenCalledWith({
      args: ["agent", "status", runId],
      cwd: "/tmp/test-workspace",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveRunArtifacts
// ---------------------------------------------------------------------------

describe("resolveRunArtifacts", () => {
  it("returns the artifact paths from the view model", () => {
    const viewModel: RunStatusViewModel = {
      runId: "run-2026-04-02-000020",
      taskRef: "020",
      phase: "post-launch",
      runRecordExists: true,
      orchestrationRecordExists: false,
      artifacts: {
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-02-000020.json",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-000020.json",
      },
    };

    const artifacts = resolveRunArtifacts(viewModel);

    expect(artifacts.launchRecordPath).toBe(
      ".project-arch/agent-runtime/launches/run-2026-04-02-000020.json",
    );
    expect(artifacts.runRecordPath).toBe(
      ".project-arch/agent-runtime/runs/run-2026-04-02-000020.json",
    );
    expect(artifacts.orchestrationPath).toBeUndefined();
  });

  it("returns empty artifacts for a pre-launch view model", () => {
    const viewModel: RunStatusViewModel = {
      runId: "run-2026-04-02-000021",
      taskRef: "021",
      phase: "pre-launch",
      runRecordExists: false,
      orchestrationRecordExists: false,
      artifacts: {},
    };

    const artifacts = resolveRunArtifacts(viewModel);

    expect(artifacts.launchRecordPath).toBeUndefined();
    expect(artifacts.runRecordPath).toBeUndefined();
    expect(artifacts.orchestrationPath).toBeUndefined();
  });
});
