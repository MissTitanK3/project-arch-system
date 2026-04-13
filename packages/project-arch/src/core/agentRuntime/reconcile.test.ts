import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJsonDeterministic } from "../../utils/fs";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { agentEscalationDraftSchema } from "../../schemas/agentEscalationDraft";
import { agentContractPath, agentResultPath } from "./paths";
import { buildAgentRunRecord, readAgentRunRecord, writeAgentRunRecord } from "./runRecord";
import { reconcileAgentRun, ReconcileError } from "./reconcile";

function makeContract(runId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    status: "authorized" as const,
    title: "Implement agent reconcile runtime integration",
    objective: "Reconcile one validated run.",
    lane: "planned" as const,
    trustLevel: "t1-scoped-edit" as const,
    scope: {
      allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      blockedPaths: [".github/**"],
      allowedOperations: ["read", "write", "create", "run-tests", "run-typecheck"] as const,
      blockedOperations: [
        "install-dependency",
        "modify-ci",
        "change-public-api-without-decision",
      ] as const,
    },
    architectureContext: {
      projectId: "shared",
      phaseId: "phase-agent-command-surface",
      milestoneId: "milestone-2-validate-and-reconcile-commands",
      taskPath:
        "roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-2-validate-and-reconcile-commands/tasks/planned/003-implement-agent-reconcile-runtime-integration.md",
      relatedDecisions: [],
      relevantDocs: ["feedback/2-agent-command-surface-spec.md"],
      relevantSkills: [],
    },
    successCriteria: ["Reconciliation report is generated for validated run."],
    verification: {
      commands: ['node -e "process.exit(0)"'],
      requiredEvidence: ["diff-summary", "changed-files", "command-results"],
    },
    escalationRules: ["requires-new-dependency", "public-contract-change"],
    preparedAt: "2026-04-01T12:00:00.000Z",
  };
}

function makeResult(runId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    runtime: { name: "codex-cli", version: "0.0.0-dev" },
    status: "completed" as const,
    summary: "Validated runtime behavior.",
    changedFiles: ["packages/project-arch/src/core/agentRuntime/reconcile.ts"],
    commandsRun: [{ command: "pnpm --filter project-arch test", exitCode: 0 }],
    evidence: {
      diffSummary: "Added reconcile flow.",
      changedFileCount: 1,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T12:30:00.000Z",
  };
}

function makeValidationReport(runId: string, ok: boolean) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    ok,
    status: ok ? ("validation-passed" as const) : ("validation-failed" as const),
    validatedAt: "2026-04-01T12:40:00.000Z",
    violations: ok
      ? []
      : [
          {
            code: "PAA003",
            severity: "error" as const,
            message: "Changed file is outside allowed paths.",
          },
        ],
    warnings: [],
    checksRun: ["scope", "blocked-operations", "required-evidence"],
  };
}

describe("core/agentRuntime/reconcile", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  async function seedValidatedRun(runId = "run-2026-04-01-140000"): Promise<void> {
    await fs.ensureDir(
      path.join(
        context.tempDir,
        "roadmap",
        "phases",
        "phase-agent-command-surface",
        "milestones",
        "milestone-2-validate-and-reconcile-commands",
        "tasks",
        "planned",
      ),
    );

    await fs.writeFile(
      path.join(
        context.tempDir,
        "roadmap",
        "phases",
        "phase-agent-command-surface",
        "milestones",
        "milestone-2-validate-and-reconcile-commands",
        "tasks",
        "planned",
        "001-implement-agent-validate-runtime-flow.md",
      ),
      `---
schemaVersion: "2.0"
id: "001"
slug: implement-agent-validate-runtime-flow
title: Implement agent validate runtime flow
lane: planned
status: todo
createdAt: "2026-04-01"
updatedAt: "2026-04-01"
discoveredFromTask: null
tags: [agent-runtime]
codeTargets:
  - packages/project-arch/src/core/agentRuntime/reconcile.ts
publicDocs: []
decisions: []
completionCriteria:
  - Reconcile integration is implemented.
traceLinks: []
---

# Task
`,
      "utf8",
    );

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), makeResult(runId));

    const runRecord = buildAgentRunRecord({
      validationReport: makeValidationReport(runId, true),
      resultPath: `.project-arch/agent-runtime/results/${runId}.json`,
      contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
    });
    await writeAgentRunRecord(runRecord, context.tempDir);
  }

  it("reconciles a validated run and updates run record status", async () => {
    const runId = "run-2026-04-01-140000";
    await seedValidatedRun(runId);

    const result = await reconcileAgentRun({ runId, cwd: context.tempDir });

    expect(result.schemaVersion).toBe("2.0");
    expect(result.status).toBe("reconciled");
    expect(result.reconciliationStatus).toBe("completed");
    expect(result.reportPath).toMatch(/^\.project-arch\/reconcile\/001-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.reportMarkdownPath).toMatch(
      /^\.project-arch\/reconcile\/001-\d{4}-\d{2}-\d{2}\.md$/,
    );

    const updatedRunRecord = await readAgentRunRecord(runId, context.tempDir);
    expect(updatedRunRecord.reconciliationStatus).toBe("completed");
    expect(updatedRunRecord.reconciliationReportPath).toBe(result.reportPath);
  });

  it("refuses runs that have not passed validation", async () => {
    const runId = "run-2026-04-01-140001";
    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), makeResult(runId));

    const failedRunRecord = buildAgentRunRecord({
      validationReport: makeValidationReport(runId, false),
      resultPath: `.project-arch/agent-runtime/results/${runId}.json`,
      contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
    });
    await writeAgentRunRecord(failedRunRecord, context.tempDir);

    await expect(reconcileAgentRun({ runId, cwd: context.tempDir })).rejects.toThrow(
      ReconcileError,
    );
  });

  it("marks run record as failed when reconciliation generation fails", async () => {
    const runId = "run-2026-04-01-140002";

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), makeResult(runId));

    const runRecord = buildAgentRunRecord({
      validationReport: makeValidationReport(runId, true),
      resultPath: `.project-arch/agent-runtime/results/${runId}.json`,
      contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
    });
    await writeAgentRunRecord(runRecord, context.tempDir);

    await expect(reconcileAgentRun({ runId, cwd: context.tempDir })).rejects.toThrow(
      ReconcileError,
    );

    const updatedRunRecord = await readAgentRunRecord(runId, context.tempDir);
    expect(updatedRunRecord.reconciliationStatus).toBe("failed");
  });

  it("supports optional discovered draft generation", async () => {
    const runId = "run-2026-04-01-140003";
    await seedValidatedRun(runId);

    const result = await reconcileAgentRun({
      runId,
      cwd: context.tempDir,
      createDiscovered: true,
    });

    expect(result.createDiscovered).toBe(true);
    expect(result.discoveredDraftPath).toMatch(
      /^\.project-arch\/reconcile\/discovered-001-run-2026-04-01-140003-\d{4}-\d{2}-\d{2}\.md$/,
    );
    expect(await fs.pathExists(path.join(context.tempDir, result.discoveredDraftPath ?? ""))).toBe(
      true,
    );
  });

  it("promotes decision requests into deterministic escalation drafts", async () => {
    const runId = "run-2026-04-01-140005";
    await seedValidatedRun(runId);

    const resultPath = agentResultPath(runId, context.tempDir);
    const seededResult = await fs.readJson(resultPath);
    seededResult.decisionRequests = [
      {
        schemaVersion: "2.0",
        runId,
        taskId: "001",
        escalationType: "public-contract-change",
        severity: "medium",
        summary: "Public contract shape changed and requires review.",
        details: ["Contract fields were extended for validation-policy coverage."],
        options: [{ label: "create decision draft", impact: "review before acceptance" }],
        recommendedNextStep: "create-decision-draft",
        createdAt: "2026-04-01T12:35:00.000Z",
      },
    ];
    await writeJsonDeterministic(resultPath, seededResult);

    const result = await reconcileAgentRun({ runId, cwd: context.tempDir });

    expect(result.escalationDraftPaths).toHaveLength(2);
    expect(result.escalationDraftPaths[0]).toMatch(
      /^\.project-arch\/reconcile\/escalations\/001-run-2026-04-01-140005-01-public-contract-change\.json$/,
    );
    expect(result.escalationDraftPaths[1]).toMatch(
      /^\.project-arch\/reconcile\/escalations\/001-run-2026-04-01-140005-01-public-contract-change\.md$/,
    );

    for (const draftPath of result.escalationDraftPaths) {
      expect(await fs.pathExists(path.join(context.tempDir, draftPath))).toBe(true);
    }
    const draftJson = await fs.readJson(path.join(context.tempDir, result.escalationDraftPaths[0]));
    expect(agentEscalationDraftSchema.parse(draftJson).runId).toBe(runId);

    const updatedRunRecord = await readAgentRunRecord(runId, context.tempDir);
    expect(updatedRunRecord.escalationDraftPaths).toEqual(result.escalationDraftPaths);
  });

  it("applies non-destructive reconcile updates when apply=true", async () => {
    const runId = "run-2026-04-01-140004";
    await seedValidatedRun(runId);

    const result = await reconcileAgentRun({
      runId,
      cwd: context.tempDir,
      apply: true,
    });

    expect(result.apply).toBe(true);

    const latestPointerPath = path.join(
      context.tempDir,
      ".project-arch",
      "reconcile",
      "latest",
      "001.json",
    );
    expect(await fs.pathExists(latestPointerPath)).toBe(true);

    const pointer = await fs.readJson(latestPointerPath);
    expect(pointer.schemaVersion).toBe("2.0");
    expect(pointer.taskId).toBe("001");
    expect(pointer.latest.runId).toBe(runId);
    expect(pointer.latest.jsonPath).toBe(result.reportPath);
    expect(pointer.latest.markdownPath).toBe(result.reportMarkdownPath);

    expect(await fs.pathExists(path.join(context.tempDir, result.reportPath))).toBe(true);
    expect(await fs.pathExists(path.join(context.tempDir, result.reportMarkdownPath))).toBe(true);
  });

  it("returns missing-run error when validated run record does not exist", async () => {
    await expect(
      reconcileAgentRun({ runId: "run-2026-04-01-149999", cwd: context.tempDir }),
    ).rejects.toThrow(ReconcileError);
  });
});
