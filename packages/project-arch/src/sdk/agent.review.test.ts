import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { writeJsonDeterministic } from "../utils/fs";
import { agentContractPath, agentPromptPath, agentResultPath } from "../core/agentRuntime/paths";
import {
  buildAgentRunRecord,
  writeAgentRunRecord,
  writeReconciliationStatus,
} from "../core/agentRuntime/runRecord";
import { agentReviewRun } from "./agent";
import { orchestrationRecordPath } from "../core/agentRuntime/orchestration";

function makeContract(runId: string, taskId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId,
    status: "authorized" as const,
    title: "Run artifact review hooks",
    objective: "Resolve run-scoped artifacts for review consumers.",
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
      milestoneId: "milestone-3-cli-and-consumer-alignment",
      taskPath:
        "roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-3-cli-and-consumer-alignment/tasks/planned/002-add-run-artifact-consumption-hooks-for-review-flows.md",
      relatedDecisions: [],
      relevantDocs: ["feedback/4-vscode-agent-integration-spec.md"],
      relevantSkills: [],
    },
    successCriteria: ["Review consumers can read run artifacts by runId."],
    verification: {
      commands: ['node -e "process.exit(0)"'],
      requiredEvidence: ["diff-summary", "changed-files", "command-results"],
    },
    escalationRules: ["requires-new-dependency", "public-contract-change"],
    preparedAt: "2026-04-01T15:00:00.000Z",
  };
}

function makeResult(runId: string, taskId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId,
    runtime: { name: "codex-cli", version: "0.0.0-dev" },
    status: "completed" as const,
    summary: "Run completed for review integration.",
    changedFiles: ["packages/project-arch/src/sdk/agent.ts"],
    commandsRun: [{ command: "pnpm --filter project-arch test", exitCode: 0 }],
    evidence: {
      diffSummary: "Added review API.",
      changedFileCount: 1,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T15:10:00.000Z",
  };
}

function makeValidationReport(runId: string, taskId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId,
    ok: true,
    status: "validation-passed" as const,
    validatedAt: "2026-04-01T15:20:00.000Z",
    violations: [],
    warnings: [],
    checksRun: ["scope", "blocked-operations", "required-evidence"],
  };
}

function makeReconciliationReport(runId: string, taskId: string) {
  return {
    schemaVersion: "2.0" as const,
    id: `reconcile-${taskId}-2026-04-01`,
    type: "local-reconciliation" as const,
    status: "reconciliation complete" as const,
    taskId,
    runId,
    date: "2026-04-01",
    author: "pa agent reconcile",
    summary: "Reconciliation complete.",
    changedFiles: ["packages/project-arch/src/sdk/agent.ts"],
    affectedAreas: ["packages/project-arch"],
    missingUpdates: [],
    missingTraceLinks: [],
    decisionCandidates: [],
    standardsGaps: [],
    proposedActions: [],
    feedbackCandidates: [],
    notes: "No additional action required.",
  };
}

describe("sdk/agent review", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("loads run-scoped review artifacts from one SDK hook", async () => {
    const runId = "run-2026-04-01-160000";
    const taskId = "002";

    await writeJsonDeterministic(
      agentContractPath(runId, context.tempDir),
      makeContract(runId, taskId),
    );
    await writeJsonDeterministic(
      agentResultPath(runId, context.tempDir),
      makeResult(runId, taskId),
    );
    await fs.ensureDir(path.dirname(agentPromptPath(runId, context.tempDir)));
    await fs.writeFile(
      agentPromptPath(runId, context.tempDir),
      "# Prompt\n\nReview this run.\n",
      "utf8",
    );

    const runRecord = buildAgentRunRecord({
      validationReport: makeValidationReport(runId, taskId),
      resultPath: `.project-arch/agent-runtime/results/${runId}.json`,
      contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
    });
    await writeAgentRunRecord(runRecord, context.tempDir);

    const reconcileReportPath = ".project-arch/reconcile/002-2026-04-01.json";
    await writeJsonDeterministic(
      path.join(context.tempDir, reconcileReportPath),
      makeReconciliationReport(runId, taskId),
    );
    await fs.writeFile(
      path.join(context.tempDir, ".project-arch/reconcile/002-2026-04-01.md"),
      "# Reconciliation\n",
      "utf8",
    );

    await writeReconciliationStatus(
      {
        runId,
        reconciliationStatus: "completed",
        reconciliationReportPath: reconcileReportPath,
        escalationDraftPaths: [
          ".project-arch/reconcile/escalations/002-run-2026-04-01-160000-01-public-contract-change.json",
          ".project-arch/reconcile/escalations/002-run-2026-04-01-160000-01-public-contract-change.md",
        ],
        reconciledAt: "2026-04-01T15:25:00.000Z",
      },
      context.tempDir,
    );

    await fs.ensureDir(path.join(context.tempDir, ".project-arch/reconcile/escalations"));
    await writeJsonDeterministic(
      path.join(
        context.tempDir,
        ".project-arch/reconcile/escalations/002-run-2026-04-01-160000-01-public-contract-change.json",
      ),
      {
        schemaVersion: "2.0",
        runId,
        taskId,
        type: "agent-escalation-draft",
        status: "draft",
        escalationType: "public-contract-change",
        severity: "medium",
        summary: "Public schema shape changed.",
        details: ["Review and decision required before acceptance."],
        options: [{ label: "create decision draft", impact: "adds approval gate" }],
        recommendedNextStep: "create-decision-draft",
        sourceCreatedAt: "2026-04-01T15:24:00.000Z",
        promotedAt: "2026-04-01T15:25:00.000Z",
      },
    );
    await fs.writeFile(
      path.join(
        context.tempDir,
        ".project-arch/reconcile/escalations/002-run-2026-04-01-160000-01-public-contract-change.md",
      ),
      "# Escalation Draft\n",
      "utf8",
    );

    await writeJsonDeterministic(orchestrationRecordPath(runId, context.tempDir), {
      schemaVersion: "2.0",
      runId,
      taskId,
      runtime: "codex-cli",
      lifecycleModel: "prepare-run-validate-reconcile",
      status: "completed",
      roles: [
        {
          role: "planner",
          status: "completed",
          startedAt: "2026-04-01T15:00:01.000Z",
          completedAt: "2026-04-01T15:00:02.000Z",
        },
        {
          role: "implementer",
          status: "completed",
          startedAt: "2026-04-01T15:00:03.000Z",
          completedAt: "2026-04-01T15:00:05.000Z",
        },
        {
          role: "reviewer",
          status: "completed",
          startedAt: "2026-04-01T15:00:06.000Z",
          completedAt: "2026-04-01T15:00:08.000Z",
        },
        {
          role: "reconciler",
          status: "completed",
          startedAt: "2026-04-01T15:00:09.000Z",
          completedAt: "2026-04-01T15:00:10.000Z",
        },
      ],
      handoffs: [
        {
          fromRole: "planner",
          toRole: "implementer",
          lifecycleBoundary: "prepare",
          requiredArtifacts: ["task-contract", "prompt"],
          authorityModel: "single-agent-lifecycle",
          trustBoundary: "inherit-authorized-task-scope",
          status: "completed",
          checkedAt: "2026-04-01T15:00:02.000Z",
        },
        {
          fromRole: "implementer",
          toRole: "reviewer",
          lifecycleBoundary: "validate",
          requiredArtifacts: ["result-bundle", "task-contract"],
          authorityModel: "single-agent-lifecycle",
          trustBoundary: "inherit-authorized-task-scope",
          status: "completed",
          checkedAt: "2026-04-01T15:00:08.000Z",
        },
        {
          fromRole: "reviewer",
          toRole: "reconciler",
          lifecycleBoundary: "reconcile",
          requiredArtifacts: ["run-record", "review-surface", "result-bundle"],
          authorityModel: "single-agent-lifecycle",
          trustBoundary: "inherit-authorized-task-scope",
          status: "completed",
          checkedAt: "2026-04-01T15:00:10.000Z",
        },
      ],
      artifacts: {
        contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
        promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
        launchRecordPath: `.project-arch/agent-runtime/launches/${runId}.json`,
        resultPath: `.project-arch/agent-runtime/results/${runId}.json`,
        runRecordPath: `.project-arch/agent-runtime/runs/${runId}.json`,
        reconciliationReportPath: reconcileReportPath,
      },
      auditTrail: [
        {
          sequence: 1,
          occurredAt: "2026-04-01T15:00:02.000Z",
          kind: "role-transition",
          role: "planner",
          fromStatus: "pending",
          toStatus: "completed",
        },
      ],
      createdAt: "2026-04-01T15:00:00.000Z",
      updatedAt: "2026-04-01T15:25:00.000Z",
    });

    const result = await agentReviewRun({ runId, cwd: context.tempDir });
    resultAssertions.assertSuccess(result);

    expect(result.data.status).toBe("review-ready");
    expect(result.data.reviewStatus).toBe("reconciled");
    expect(result.data.artifacts.contract?.path).toBe(
      `.project-arch/agent-runtime/contracts/${runId}.json`,
    );
    expect(result.data.artifacts.prompt.path).toBe(
      `.project-arch/agent-runtime/prompts/${runId}.md`,
    );
    expect(result.data.artifacts.result.path).toBe(
      `.project-arch/agent-runtime/results/${runId}.json`,
    );
    expect(result.data.artifacts.reconciliationReport?.path).toBe(reconcileReportPath);
    expect(result.data.artifacts.reconciliationMarkdown?.path).toBe(
      ".project-arch/reconcile/002-2026-04-01.md",
    );
    expect(result.data.artifacts.orchestrationRecord).toEqual({
      path: `.project-arch/agent-runtime/orchestration/${runId}.json`,
      exists: true,
    });
    expect(result.data.artifacts.escalationDrafts).toEqual([
      {
        path: ".project-arch/reconcile/escalations/002-run-2026-04-01-160000-01-public-contract-change.json",
        exists: true,
      },
      {
        path: ".project-arch/reconcile/escalations/002-run-2026-04-01-160000-01-public-contract-change.md",
        exists: true,
      },
    ]);
    expect(result.data.missingArtifacts).toEqual([]);
    expect(result.data.reconciliationReport?.runId).toBe(runId);
    expect(result.data.orchestrationRecord?.status).toBe("completed");
  });

  it("keeps repeated runs addressable by runId", async () => {
    const firstRunId = "run-2026-04-01-160001";
    const secondRunId = "run-2026-04-01-160002";
    const taskId = "002";

    await writeJsonDeterministic(
      agentContractPath(firstRunId, context.tempDir),
      makeContract(firstRunId, taskId),
    );
    await writeJsonDeterministic(
      agentResultPath(firstRunId, context.tempDir),
      makeResult(firstRunId, taskId),
    );
    await fs.ensureDir(path.dirname(agentPromptPath(firstRunId, context.tempDir)));
    await fs.writeFile(agentPromptPath(firstRunId, context.tempDir), "# Prompt 1\n", "utf8");
    await writeAgentRunRecord(
      buildAgentRunRecord({
        validationReport: makeValidationReport(firstRunId, taskId),
        resultPath: `.project-arch/agent-runtime/results/${firstRunId}.json`,
        contractPath: `.project-arch/agent-runtime/contracts/${firstRunId}.json`,
      }),
      context.tempDir,
    );

    await writeJsonDeterministic(
      agentContractPath(secondRunId, context.tempDir),
      makeContract(secondRunId, taskId),
    );
    await writeJsonDeterministic(
      agentResultPath(secondRunId, context.tempDir),
      makeResult(secondRunId, taskId),
    );
    await fs.writeFile(agentPromptPath(secondRunId, context.tempDir), "# Prompt 2\n", "utf8");
    await writeAgentRunRecord(
      buildAgentRunRecord({
        validationReport: makeValidationReport(secondRunId, taskId),
        resultPath: `.project-arch/agent-runtime/results/${secondRunId}.json`,
        contractPath: `.project-arch/agent-runtime/contracts/${secondRunId}.json`,
      }),
      context.tempDir,
    );

    const first = await agentReviewRun({ runId: firstRunId, cwd: context.tempDir });
    const second = await agentReviewRun({ runId: secondRunId, cwd: context.tempDir });
    resultAssertions.assertSuccess(first);
    resultAssertions.assertSuccess(second);

    expect(first.data.runId).toBe(firstRunId);
    expect(second.data.runId).toBe(secondRunId);
    expect(first.data.artifacts.runRecord.path).toBe(
      `.project-arch/agent-runtime/runs/${firstRunId}.json`,
    );
    expect(second.data.artifacts.runRecord.path).toBe(
      `.project-arch/agent-runtime/runs/${secondRunId}.json`,
    );
    expect(first.data.prompt?.trim()).toBe("# Prompt 1");
    expect(second.data.prompt?.trim()).toBe("# Prompt 2");
  });

  it("returns an error when run record is missing", async () => {
    const result = await agentReviewRun({ runId: "run-2026-04-01-169999", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "Run record not found");
  });
});
