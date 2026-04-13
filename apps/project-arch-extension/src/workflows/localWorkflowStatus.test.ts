import { describe, expect, it } from "vitest";
import {
  buildCompletedStatus,
  buildFailureStatus,
  buildStatusFromStep,
  formatStatusSummary,
} from "./localWorkflowStatus";

describe("localWorkflowStatus", () => {
  it("maps step events to canonical in-progress and completed statuses", () => {
    const running = buildStatusFromStep({
      action: "implement",
      taskRef: "004",
      phase: "prepare",
      state: "started",
      at: "2026-04-02T15:00:00.000Z",
    });

    const completed = buildStatusFromStep({
      action: "implement",
      taskRef: "004",
      runId: "run-2026-04-02-150000",
      phase: "prepare",
      state: "completed",
      at: "2026-04-02T15:00:10.000Z",
    });

    expect(running.state).toBe("in-progress");
    expect(running.canonicalOutcome).toBe("prepare-running");
    expect(completed.state).toBe("completed");
    expect(completed.canonicalOutcome).toBe("prepare-completed");
  });

  it("classifies actionable failures by canonical phase semantics", () => {
    const authorization = buildFailureStatus({
      action: "implement",
      taskRef: "004",
      phase: "prepare",
      message: "PAA013: Approval required",
      at: "2026-04-02T15:01:00.000Z",
    });
    expect(authorization.canonicalOutcome).toBe("authorization-failed");

    const validation = buildFailureStatus({
      action: "implement",
      taskRef: "004",
      runId: "run-2026-04-02-150100",
      phase: "validate",
      message: "Validation failed for run run-2026-04-02-150100",
      at: "2026-04-02T15:02:00.000Z",
    });
    expect(validation.canonicalOutcome).toBe("validation-failed");
    expect(validation.nextStep).toContain("rerun validate/reconcile");
  });

  it("builds coherent completion summaries for implement workflow", () => {
    const status = buildCompletedStatus(
      {
        action: "implement",
        taskRef: "004",
        runId: "run-2026-04-02-150200",
        transport: "cli-json",
        startedAt: "2026-04-02T15:02:00.000Z",
        completedAt: "2026-04-02T15:03:00.000Z",
        prepare: {
          schemaVersion: "2.0",
          runId: "run-2026-04-02-150150",
          taskRef: "004",
          status: "prepared",
          contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-150150.json",
          promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-150150.md",
        },
        artifacts: {
          contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-150150.json",
          promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-150150.md",
          resultPath: ".project-arch/agent-runtime/results/run-2026-04-02-150200.json",
          runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-150200.json",
          reportPath: ".project-arch/reconcile/004-2026-04-02.json",
          reportMarkdownPath: ".project-arch/reconcile/004-2026-04-02.md",
        },
      },
      "2026-04-02T15:03:00.000Z",
    );

    expect(status.canonicalOutcome).toBe("reconcile-completed");
    expect(formatStatusSummary(status)).toContain("completed (reconcile)");
  });
});
