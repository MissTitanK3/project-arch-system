import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { writeJsonDeterministic } from "../utils/fs";
import { agentContractPath, agentResultPath } from "../core/agentRuntime/paths";
import { buildAgentRunRecord, writeAgentRunRecord } from "../core/agentRuntime/runRecord";
import { agentReconcile } from "./agent";

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

function makeValidationReport(runId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    ok: true,
    status: "validation-passed" as const,
    validatedAt: "2026-04-01T12:40:00.000Z",
    violations: [],
    warnings: [],
    checksRun: ["scope", "blocked-operations", "required-evidence"],
  };
}

describe("sdk/agent reconcile", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns reconciled output for a validated run", async () => {
    const runId = "run-2026-04-01-150000";

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
      `---\nschemaVersion: "2.0"\nid: "001"\nslug: task\ntitle: Task\nlane: planned\nstatus: todo\ncreatedAt: "2026-04-01"\nupdatedAt: "2026-04-01"\ndiscoveredFromTask: null\ntags: [agent-runtime]\ncodeTargets:\n  - packages/project-arch/src/core/agentRuntime/reconcile.ts\npublicDocs: []\ndecisions: []\ncompletionCriteria:\n  - ok\ntraceLinks: []\n---\n\n# Task\n`,
      "utf8",
    );

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), makeResult(runId));

    const runRecord = buildAgentRunRecord({
      validationReport: makeValidationReport(runId),
      resultPath: `.project-arch/agent-runtime/results/${runId}.json`,
      contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
    });
    await writeAgentRunRecord(runRecord, context.tempDir);

    const result = await agentReconcile({ runId, cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.status).toBe("reconciled");
    expect(result.data.reportPath).toMatch(
      /^\.project-arch\/reconcile\/001-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });

  it("returns error when run record is missing", async () => {
    const result = await agentReconcile({ runId: "run-2026-04-01-159999", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "Validated run record not found");
  });
});
