import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentRunRecordPath,
  agentRunRecordSchema,
  buildAgentRunRecord,
  deriveAgentRunReviewStatus,
  readAgentRunRecord,
  writeAgentRunRecord,
  writeReconciliationStatus,
} from "./runRecord";
import type { AgentValidationReport } from "./validationReport";

describe("core/agentRuntime/runRecord", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => fs.remove(root)));
    tempRoots.length = 0;
  });

  async function makeTempRoot(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-agent-run-record-"));
    tempRoots.push(root);
    return root;
  }

  function baseValidationReport(runId = "run-2026-03-31-001"): AgentValidationReport {
    return {
      schemaVersion: "2.0",
      runId,
      taskId: "104",
      ok: false,
      status: "validation-failed",
      validatedAt: "2026-03-31T12:25:00.000Z",
      violations: [
        {
          code: "PAA003",
          severity: "error",
          message: "Changed file is outside allowed paths.",
          path: ".github/workflows/release.yml",
        },
      ],
      warnings: [],
      checksRun: ["scope", "required-evidence", "verification-commands", "pa-check"],
    };
  }

  it("persists run records under .project-arch/agent-runtime/runs keyed by runId", async () => {
    const cwd = await makeTempRoot();
    const record = buildAgentRunRecord({
      validationReport: baseValidationReport(),
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
      contractPath: ".project-arch/agent-runtime/contracts/run-2026-03-31-001.json",
    });

    const writtenPath = await writeAgentRunRecord(record, cwd);
    const expectedPath = agentRunRecordPath(record.runId, cwd);

    expect(writtenPath).toBe(expectedPath);
    expect(await fs.pathExists(expectedPath)).toBe(true);
    expect(path.relative(cwd, expectedPath).replace(/\\/g, "/")).toBe(
      ".project-arch/agent-runtime/runs/run-2026-03-31-001.json",
    );

    const loaded = await readAgentRunRecord(record.runId, cwd);
    expect(loaded).toEqual(record);
  });

  it("keeps repeated runs for one task unambiguous by runId", async () => {
    const cwd = await makeTempRoot();
    const first = buildAgentRunRecord({
      validationReport: baseValidationReport("run-2026-03-31-001"),
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
    });
    const second = buildAgentRunRecord({
      validationReport: baseValidationReport("run-2026-03-31-002"),
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-002.json",
    });

    await writeAgentRunRecord(first, cwd);
    await writeAgentRunRecord(second, cwd);

    const firstLoaded = await readAgentRunRecord(first.runId, cwd);
    const secondLoaded = await readAgentRunRecord(second.runId, cwd);

    expect(firstLoaded.taskId).toBe("104");
    expect(secondLoaded.taskId).toBe("104");
    expect(firstLoaded.runId).not.toBe(secondLoaded.runId);
  });

  it("tracks reconciliation status transitions for run review", async () => {
    const cwd = await makeTempRoot();
    const record = buildAgentRunRecord({
      validationReport: {
        ...baseValidationReport(),
        ok: true,
        status: "validation-passed",
        violations: [],
      },
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
    });
    await writeAgentRunRecord(record, cwd);

    const updated = await writeReconciliationStatus(
      {
        runId: record.runId,
        reconciliationStatus: "completed",
        reconciliationReportPath: ".project-arch/reconcile/104-2026-03-31.json",
        reconciledAt: "2026-03-31T12:30:00.000Z",
      },
      cwd,
    );

    expect(updated.reconciliationStatus).toBe("completed");
    expect(updated.reconciliationReportPath).toBe(".project-arch/reconcile/104-2026-03-31.json");
    expect(updated.reconciledAt).toBe("2026-03-31T12:30:00.000Z");
  });

  it("persists escalation draft paths when reconciliation writes promotion outputs", async () => {
    const cwd = await makeTempRoot();
    const record = buildAgentRunRecord({
      validationReport: {
        ...baseValidationReport(),
        ok: true,
        status: "validation-passed",
        violations: [],
      },
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
    });
    await writeAgentRunRecord(record, cwd);

    const updated = await writeReconciliationStatus(
      {
        runId: record.runId,
        reconciliationStatus: "completed",
        reconciliationReportPath: ".project-arch/reconcile/104-2026-03-31.json",
        escalationDraftPaths: [
          ".project-arch/reconcile/escalations/104-run-2026-03-31-001-01-public-contract-change.json",
          ".project-arch/reconcile/escalations/104-run-2026-03-31-001-01-public-contract-change.md",
        ],
        reconciledAt: "2026-03-31T12:30:00.000Z",
      },
      cwd,
    );

    expect(updated.escalationDraftPaths).toHaveLength(2);
  });

  it("rejects inconsistent validation and reconciliation status payloads", () => {
    expect(() =>
      agentRunRecordSchema.parse({
        ...buildAgentRunRecord({
          validationReport: baseValidationReport(),
          resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
        }),
        status: "validation-passed",
        ok: false,
      }),
    ).toThrow();

    expect(() =>
      agentRunRecordSchema.parse({
        ...buildAgentRunRecord({
          validationReport: {
            ...baseValidationReport(),
            ok: true,
            status: "validation-passed",
            violations: [],
          },
          resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
        }),
        reconciliationStatus: "completed",
      }),
    ).toThrow();
  });

  it("derives a coherent review status across validation and reconcile boundaries", () => {
    const failed = buildAgentRunRecord({
      validationReport: baseValidationReport(),
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
    });
    expect(deriveAgentRunReviewStatus(failed)).toBe("validation-failed");

    const awaiting = buildAgentRunRecord({
      validationReport: {
        ...baseValidationReport(),
        status: "validation-passed",
        ok: true,
        violations: [],
      },
      resultPath: ".project-arch/agent-runtime/results/run-2026-03-31-001.json",
    });
    expect(deriveAgentRunReviewStatus(awaiting)).toBe("validation-passed-awaiting-reconcile");

    const reconciled = agentRunRecordSchema.parse({
      ...awaiting,
      reconciliationStatus: "completed",
      reconciliationReportPath: ".project-arch/reconcile/104-2026-03-31.json",
      reconciledAt: "2026-03-31T12:30:00.000Z",
    });
    expect(deriveAgentRunReviewStatus(reconciled)).toBe("reconciled");
  });
});
