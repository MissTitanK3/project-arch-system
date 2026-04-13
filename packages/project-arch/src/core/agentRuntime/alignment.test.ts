import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TaskRecord } from "../validation/tasks";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { prepareAgentRunFromRecord } from "./prepare";
import { importAgentResult } from "./resultImport";
import { writeJsonDeterministic } from "../../utils/fs";
import { agentContractPath, agentPromptPath, agentResultPath } from "./paths";
import { readAgentRunRecord } from "./runRecord";
import { validateAgentRun } from "./validate";
import { reconcileAgentRun } from "./reconcile";
import { getAgentRunReview } from "./review";
import { readAgentAuditHistory } from "./audit";
import { getAgentRunLaunchStatus } from "./runStatus";
import { readAgentRunLaunchRecord, runAgentTask } from "./run";
import { createAgentRuntimeAdapterRegistry, registerAgentRuntimeAdapter } from "./adapters";
import { parseAgentContractArtifact } from "../../sdk/contracts";

function makeTaskRecord(cwd: string): TaskRecord {
  return {
    projectId: "shared",
    phaseId: "phase-agent-command-surface",
    milestoneId: "milestone-1-prepare-and-result-import",
    lane: "planned",
    filePath: path.join(
      cwd,
      "roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-1-prepare-and-result-import/tasks/planned/004-align-prepare-import-artifacts-and-outputs.md",
    ),
    frontmatter: {
      schemaVersion: "2.0",
      id: "004",
      slug: "align-prepare-import-artifacts-and-outputs",
      title: "Align prepare and import artifacts and outputs",
      lane: "planned",
      status: "todo",
      createdAt: "2026-04-01",
      updatedAt: "2026-04-01",
      discoveredFromTask: null,
      tags: ["agent-runtime", "cli", "consistency"],
      codeTargets: [
        "packages/project-arch/src/core/agentRuntime/",
        "packages/project-arch/src/sdk/",
      ],
      publicDocs: ["feedback/2-agent-command-surface-spec.md"],
      decisions: [],
      completionCriteria: ["Prepare and import use one run-scoped artifact model."],
      scope: "Align the MVP command slice.",
    },
  };
}

function makeResultBundle(runId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "004",
    runtime: { name: "codex-cli", version: "0.0.0-dev" },
    status: "completed" as const,
    summary: "Aligned prepare and import output conventions.",
    changedFiles: ["packages/project-arch/src/core/agentRuntime/prepare.ts"],
    commandsRun: [{ command: "pnpm --filter project-arch test", exitCode: 0 }],
    evidence: {
      diffSummary: "Aligned command-slice artifacts.",
      changedFileCount: 1,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T13:00:00.000Z",
  };
}

function makeValidateReconcileContract(runId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    status: "authorized" as const,
    title: "Align validate and reconcile run state and outputs",
    objective: "Ensure one coherent post-run command slice.",
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
        "roadmap/phases/phase-agent-command-surface/milestones/milestone-2-validate-and-reconcile-commands/tasks/planned/005-align-validate-reconcile-run-state-and-outputs.md",
      relatedDecisions: [],
      relevantDocs: ["feedback/2-agent-command-surface-spec.md"],
      relevantSkills: [],
    },
    successCriteria: ["Validate and reconcile remain output-compatible and state-consistent."],
    verification: {
      commands: ['node -e "process.exit(0)"'],
      requiredEvidence: ["diff-summary", "changed-files", "command-results"],
    },
    escalationRules: ["requires-new-dependency", "public-contract-change"],
    preparedAt: "2026-04-01T14:00:00.000Z",
  };
}

function makeValidateReconcileResult(runId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    runtime: { name: "codex-cli", version: "0.0.0-dev" },
    status: "completed" as const,
    summary: "Validated runtime behavior for reconcile alignment.",
    changedFiles: ["packages/project-arch/src/core/agentRuntime/reconcile.ts"],
    commandsRun: [{ command: "pnpm --filter project-arch test", exitCode: 0 }],
    evidence: {
      diffSummary: "Aligned validate/reconcile flow.",
      changedFileCount: 1,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T14:10:00.000Z",
  };
}

describe("core/agentRuntime alignment", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("uses one run-scoped runtime root and one shared success envelope shape", async () => {
    const runId = "run-2026-04-01-130000";
    const prepareResult = await prepareAgentRunFromRecord(makeTaskRecord(context.tempDir), {
      cwd: context.tempDir,
      runId,
    });

    const bundlePath = path.join(context.tempDir, "bundle.json");
    await fs.writeJson(bundlePath, makeResultBundle(runId), { spaces: 2 });
    const importResult = await importAgentResult({ path: bundlePath, cwd: context.tempDir });

    expect(prepareResult.schemaVersion).toBe("2.0");
    expect(importResult.schemaVersion).toBe("2.0");
    expect(prepareResult.runId).toBe(runId);
    expect(importResult.runId).toBe(runId);
    expect(prepareResult.taskId).toBe(importResult.taskId);
    expect(prepareResult.contractPath).toBe(
      ".project-arch/agent-runtime/contracts/run-2026-04-01-130000.json",
    );
    expect(prepareResult.promptPath).toBe(
      ".project-arch/agent-runtime/prompts/run-2026-04-01-130000.md",
    );
    expect(importResult.resultPath).toBe(
      ".project-arch/agent-runtime/results/run-2026-04-01-130000.json",
    );
  });

  it("keeps validate->reconcile state transitions and run-scoped outputs coherent", async () => {
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

    await writeJsonDeterministic(
      agentContractPath(runId, context.tempDir),
      makeValidateReconcileContract(runId),
    );
    await writeJsonDeterministic(
      agentResultPath(runId, context.tempDir),
      makeValidateReconcileResult(runId),
    );

    const validateResult = await validateAgentRun({
      runId,
      cwd: context.tempDir,
      pathsOnly: true,
    });
    expect(validateResult.status).toBe("validation-passed");
    expect(validateResult.runRecordPath).toBe(`.project-arch/agent-runtime/runs/${runId}.json`);

    const runAfterValidate = await readAgentRunRecord(runId, context.tempDir);
    expect(runAfterValidate.reconciliationStatus).toBe("not-run");

    const reconcileResult = await reconcileAgentRun({ runId, cwd: context.tempDir });
    expect(reconcileResult.schemaVersion).toBe("2.0");
    expect(reconcileResult.status).toBe("reconciled");
    expect(reconcileResult.reconciliationStatus).toBe("completed");
    expect(reconcileResult.runRecordPath).toBe(validateResult.runRecordPath);

    const runAfterReconcile = await readAgentRunRecord(runId, context.tempDir);
    expect(runAfterReconcile.status).toBe("validation-passed");
    expect(runAfterReconcile.reconciliationStatus).toBe("completed");
    expect(runAfterReconcile.reconciliationReportPath).toBe(reconcileResult.reportPath);
  });

  it("aligns validation, escalation promotion, review artifacts, and runtime-local audit history", async () => {
    const runId = "run-2026-04-01-151500";

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

    await writeJsonDeterministic(
      agentContractPath(runId, context.tempDir),
      makeValidateReconcileContract(runId),
    );
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), {
      ...makeValidateReconcileResult(runId),
      decisionRequests: [
        {
          schemaVersion: "2.0",
          runId,
          taskId: "001",
          escalationType: "public-contract-change",
          severity: "medium",
          summary: "Public contract needs approval before merge.",
          details: ["Validation/report contract additions require review."],
          options: [{ label: "create decision draft", impact: "add approval checkpoint" }],
          recommendedNextStep: "create-decision-draft",
          createdAt: "2026-04-01T14:11:00.000Z",
        },
      ],
    });
    await fs.ensureDir(path.dirname(agentPromptPath(runId, context.tempDir)));
    await fs.writeFile(agentPromptPath(runId, context.tempDir), "# Prompt\n", "utf8");

    const validateResult = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(validateResult.status).toBe("validation-passed");

    const reconcileResult = await reconcileAgentRun({ runId, cwd: context.tempDir });
    expect(reconcileResult.escalationDraftPaths).toHaveLength(2);

    const reviewResult = await getAgentRunReview({ runId, cwd: context.tempDir });
    expect(reviewResult.status).toBe("review-ready");
    expect(reviewResult.reviewStatus).toBe("reconciled");
    expect(reviewResult.artifacts.escalationDrafts).toEqual([
      { path: reconcileResult.escalationDraftPaths[0], exists: true },
      { path: reconcileResult.escalationDraftPaths[1], exists: true },
    ]);
    expect(reviewResult.missingArtifacts).toEqual([]);

    const audit = await readAgentAuditHistory({ cwd: context.tempDir, runId });
    expect(audit.status).toBe("audit-history");
    expect(audit.total).toBeGreaterThanOrEqual(3);
    expect(audit.events.map((event) => event.command)).toEqual(
      expect.arrayContaining(["validate", "reconcile", "review"]),
    );
  });

  it("keeps launch records, status lookup, SDK contract parsing, and audit history aligned", async () => {
    const registry = createAgentRuntimeAdapterRegistry();
    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        runId: input.runId,
        taskId: input.taskId,
        status: "launch-dispatched",
        runHandle: `codex-cli:${input.runId}`,
        launchedAt: "2026-04-02T12:00:05.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    const runResult = await runAgentTask({
      taskId: "005",
      runtime: "codex-cli",
      cwd: context.tempDir,
      adapterRegistry: registry,
      requestedAt: "2026-04-02T12:00:00.000Z",
      prepare: async () => ({
        schemaVersion: "2.0",
        runId: "run-2026-04-02-120000",
        taskId: "005",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      }),
    });

    const persistedLaunchRecord = await readAgentRunLaunchRecord(runResult.runId, context.tempDir);
    const parsedLaunchRecord = parseAgentContractArtifact(
      "runtime-launch-record",
      persistedLaunchRecord,
    );
    const statusResult = await getAgentRunLaunchStatus({
      runId: runResult.runId,
      cwd: context.tempDir,
    });
    const audit = await readAgentAuditHistory({ cwd: context.tempDir, runId: runResult.runId });

    expect(parsedLaunchRecord).toEqual(persistedLaunchRecord);
    expect(parsedLaunchRecord.runtime).toBe(runResult.runtime);
    expect(parsedLaunchRecord.runHandle).toBe(runResult.runHandle);
    expect(parsedLaunchRecord.status).toBe(runResult.status);
    expect(parsedLaunchRecord.lifecycleBoundary).toBe(runResult.lifecycleBoundary);

    expect(statusResult.phase).toBe("launch-dispatched");
    expect(statusResult.runtime).toBe(parsedLaunchRecord.runtime);
    expect(statusResult.runHandle).toBe(parsedLaunchRecord.runHandle);
    expect(statusResult.launchRecordPath).toBe(runResult.launchRecordPath);
    expect(statusResult.runRecordExists).toBe(false);

    expect(audit.events.map((event) => event.command)).toEqual(
      expect.arrayContaining(["run", "review"]),
    );
  });
});
