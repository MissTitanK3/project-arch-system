import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { writeJsonDeterministic } from "../utils/fs";
import { agentContractPath, agentResultPath } from "../core/agentRuntime/paths";
import { agentValidate, classifyAgentValidateOutcome } from "./agent";
import type { AgentTaskContract } from "../schemas/agentTaskContract";

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

function makeResult(runId: string) {
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

describe("sdk/agent validate", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns validation report + run record path for a valid run", async () => {
    const runId = "run-2026-04-01-130000";
    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), makeContract(runId));
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), makeResult(runId));

    const result = await agentValidate({ runId, cwd: context.tempDir, pathsOnly: true });
    resultAssertions.assertSuccess(result);
    expect(result.data.status).toBe("validation-passed");
    expect(result.data.runRecordPath).toBe(`.project-arch/agent-runtime/runs/${runId}.json`);
    expect(await fs.pathExists(path.join(context.tempDir, result.data.runRecordPath))).toBe(true);
  });

  it("returns an error for missing contract/result inputs", async () => {
    const result = await agentValidate({ runId: "run-2026-04-01-130001", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "Prepared contract not found");
  });

  it("surfaces stronger command-policy validation failures", async () => {
    const runId = "run-2026-04-01-130002";
    const contract = makeContract(runId);
    contract.scope.allowedOperations = ["read", "write", "create", "run-typecheck"];

    const resultBundle = makeResult(runId);
    resultBundle.commandsRun = [{ command: "pnpm lint", exitCode: 0 }];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), contract);
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), resultBundle);

    const result = await agentValidate({ runId, cwd: context.tempDir, pathsOnly: true });
    resultAssertions.assertSuccess(result);
    expect(result.data.status).toBe("validation-failed");
    expect(result.data.violations.some((finding) => finding.code === "PAA008")).toBe(true);
  });

  it("surfaces readonly trust-level enforcement failures", async () => {
    const runId = "run-2026-04-01-130003";
    const contract = makeContract(runId);
    contract.trustLevel = "t0-readonly";
    contract.scope.allowedOperations = ["read", "run-tests"];

    const resultBundle = makeResult(runId);
    resultBundle.changedFiles = ["packages/project-arch/src/core/agentRuntime/validate.ts"];

    await writeJsonDeterministic(agentContractPath(runId, context.tempDir), contract);
    await writeJsonDeterministic(agentResultPath(runId, context.tempDir), resultBundle);

    const result = await agentValidate({ runId, cwd: context.tempDir, pathsOnly: true });
    resultAssertions.assertSuccess(result);
    expect(result.data.status).toBe("validation-failed");
    expect(result.data.violations.some((finding) => finding.code === "PAA009")).toBe(true);
  });

  it("classifies validate outcomes for consumer surfaces", () => {
    expect(
      classifyAgentValidateOutcome({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130011",
        taskId: "001",
        ok: false,
        status: "validation-failed",
        validatedAt: "2026-04-01T13:21:00.000Z",
        violations: [
          {
            code: "PAA003",
            severity: "error",
            message: "Changed file is outside allowed paths.",
          },
        ],
        warnings: [],
        checksRun: ["scope"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130011.json",
      }),
    ).toBe("validation-failed");

    expect(
      classifyAgentValidateOutcome({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130012",
        taskId: "001",
        ok: true,
        status: "validation-passed",
        validatedAt: "2026-04-01T13:22:00.000Z",
        violations: [],
        warnings: [
          {
            code: "PAA007",
            severity: "warning",
            message: "Escalation is required before validation can pass reconciliation review.",
          },
        ],
        checksRun: ["scope"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130012.json",
      }),
    ).toBe("escalation-ready");

    expect(
      classifyAgentValidateOutcome({
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130013",
        taskId: "001",
        ok: true,
        status: "validation-passed",
        validatedAt: "2026-04-01T13:23:00.000Z",
        violations: [],
        warnings: [],
        checksRun: ["scope"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130013.json",
      }),
    ).toBe("validation-passed");
  });
});
