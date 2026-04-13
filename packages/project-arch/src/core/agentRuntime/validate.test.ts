import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { writeJsonDeterministic } from "../../utils/fs";
import { agentContractPath, agentResultPath, toPosixRelativePath } from "./paths";
import { readAgentRunRecord } from "./runRecord";
import { ValidateError, loadValidationInputs, validateAgentRun } from "./validate";
import type { AgentResultBundle } from "../../schemas/agentResultBundle";
import type { AgentTaskContract } from "../../schemas/agentTaskContract";
import { readAgentAuditHistory } from "./audit";

function makeContract(runId: string): AgentTaskContract {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    status: "authorized" as const,
    title: "Implement agent validate runtime flow",
    objective: "Validate one run end-to-end.",
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
        "roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-2-validate-and-reconcile-commands/tasks/planned/001-implement-agent-validate-runtime-flow.md",
      relatedDecisions: [],
      relevantDocs: ["feedback/2-agent-command-surface-spec.md"],
      relevantSkills: [],
    },
    successCriteria: ["Validation report persists a run record."],
    verification: {
      commands: ['node -e "process.exit(0)"'],
      requiredEvidence: ["diff-summary", "changed-files", "command-results"],
    },
    escalationRules: ["requires-new-dependency", "public-contract-change"],
    preparedAt: "2026-04-01T12:00:00.000Z",
  };
}

function makeResult(runId: string): AgentResultBundle {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId: "001",
    runtime: {
      name: "codex-cli",
      version: "0.0.0-dev",
    },
    status: "completed" as const,
    summary: "Validated runtime behavior.",
    changedFiles: ["packages/project-arch/src/core/agentRuntime/validate.ts"],
    commandsRun: [{ command: "pnpm --filter project-arch test", exitCode: 0 }],
    evidence: {
      diffSummary: "Added validate flow.",
      changedFileCount: 1,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T12:30:00.000Z",
  };
}

describe("core/agentRuntime/validate", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  async function seedRun(runId = "run-2026-04-01-120000"): Promise<void> {
    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), makeResult(runId));
  }

  it("loads contract and result artifacts by runId", async () => {
    await seedRun();

    const loaded = await loadValidationInputs("run-2026-04-01-120000", context.tempDir);
    expect(loaded.contract.taskId).toBe("001");
    expect(loaded.result.taskId).toBe("001");
  });

  it("fails with PAA002 when the contract is missing", async () => {
    await writeJsonDeterministic(
      agentResultPath("run-2026-04-01-120000", context.tempDir),
      makeResult("run-2026-04-01-120000"),
    );

    await expect(
      loadValidationInputs("run-2026-04-01-120000", context.tempDir),
    ).rejects.toMatchObject({
      code: "PAA002",
    });
  });

  it("fails with PAA002 when the result is missing", async () => {
    await writeJsonDeterministic(
      agentContractPath("run-2026-04-01-120000", context.tempDir),
      makeContract("run-2026-04-01-120000"),
    );

    await expect(
      loadValidationInputs("run-2026-04-01-120000", context.tempDir),
    ).rejects.toMatchObject({
      code: "PAA002",
    });
  });

  it("validates scope/evidence checks and persists a run record in paths-only mode", async () => {
    const runId = "run-2026-04-01-120000";
    await seedRun(runId);

    const report = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });

    expect(report.schemaVersion).toBe("2.0");
    expect(report.status).toBe("validation-passed");
    expect(report.ok).toBe(true);
    expect(report.checksRun).toEqual([
      "scope",
      "blocked-operations",
      "required-evidence",
      "command-policy",
      "trust-level",
    ]);
    expect(report.runRecordPath).toBe(`.project-arch/agent-runtime/runs/${runId}.json`);

    const persisted = await readAgentRunRecord(runId, context.tempDir);
    expect(persisted.status).toBe("validation-passed");
    expect(persisted.contractPath).toBe(
      toPosixRelativePath(context.tempDir, agentContractPath(runId, context.tempDir)),
    );
    expect(persisted.resultPath).toBe(
      toPosixRelativePath(context.tempDir, agentResultPath(runId, context.tempDir)),
    );

    const audit = await readAgentAuditHistory({ cwd: context.tempDir, runId });
    expect(audit.total).toBeGreaterThan(0);
    expect(audit.events.some((event) => event.command === "validate")).toBe(true);
  });

  it("reports PAA003 when changed files are outside allowed scope", async () => {
    const runId = "run-2026-04-01-120001";
    const result = makeResult(runId);
    result.changedFiles = [".github/workflows/release.yml"];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    const report = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(report.ok).toBe(false);
    expect(report.violations.some((finding) => finding.code === "PAA003")).toBe(true);
  });

  it("reports PAA004 for blocked operations reported by runtime findings", async () => {
    const runId = "run-2026-04-01-120002";
    const result = makeResult(runId);
    result.policyFindings = [
      {
        code: "modify-ci",
        severity: "high",
        message: "Attempted CI workflow edit.",
      },
    ];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    const report = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(report.ok).toBe(false);
    expect(report.violations.some((finding) => finding.code === "PAA004")).toBe(true);
  });

  it("reports PAA005 when required evidence is missing", async () => {
    const runId = "run-2026-04-01-120003";
    const result = makeResult(runId);
    result.changedFiles = [];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    const report = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(report.ok).toBe(false);
    expect(report.violations.some((finding) => finding.code === "PAA005")).toBe(true);
  });

  it("reports PAA008 when runtime command classes are outside allowed operations", async () => {
    const runId = "run-2026-04-01-120006";
    const contract = makeContract(runId);
    contract.scope.allowedOperations = ["read", "write", "create", "run-typecheck"];

    const result = makeResult(runId);
    result.commandsRun = [{ command: "pnpm lint", exitCode: 0 }];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), contract);
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    const report = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(report.ok).toBe(false);
    expect(report.violations.some((finding) => finding.code === "PAA008")).toBe(true);
  });

  it("reports PAA009 when readonly trust level includes file changes", async () => {
    const runId = "run-2026-04-01-120007";
    const contract = makeContract(runId);
    contract.trustLevel = "t0-readonly";
    contract.scope.allowedOperations = ["read", "run-tests"];

    const result = makeResult(runId);
    result.changedFiles = ["packages/project-arch/src/core/agentRuntime/validate.ts"];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), contract);
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    const report = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(report.ok).toBe(false);
    expect(report.violations.some((finding) => finding.code === "PAA009")).toBe(true);
  });

  it("treats escalation as warning by default and violation under strict mode", async () => {
    const runId = "run-2026-04-01-120004";
    const result = makeResult(runId);
    result.policyFindings = [
      {
        code: "requires-new-dependency",
        severity: "medium",
        message: "New dependency requested.",
      },
    ];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    const defaultReport = await validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true });
    expect(defaultReport.ok).toBe(true);
    expect(defaultReport.warnings.some((finding) => finding.code === "PAA007")).toBe(true);

    const strictReport = await validateAgentRun({
      runId,
      cwd: context.tempDir,
      pathsOnly: true,
      strict: true,
    });
    expect(strictReport.ok).toBe(false);
    expect(strictReport.violations.some((finding) => finding.code === "PAA007")).toBe(true);
  });

  it("raises PAA002 on contract/result identity mismatch", async () => {
    const runId = "run-2026-04-01-120005";
    const contract = makeContract(runId);
    const result = makeResult(runId);
    result.taskId = "002";

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), contract);
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), result);

    await expect(
      validateAgentRun({ runId, cwd: context.tempDir, pathsOnly: true }),
    ).rejects.toThrow(ValidateError);
  });
});
