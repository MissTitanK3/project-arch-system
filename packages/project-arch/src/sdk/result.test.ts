import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { resultImport } from "./result";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION } from "../core/agentRuntime/output";

function makeResultBundle() {
  return {
    schemaVersion: "2.0" as const,
    runId: "run-2026-04-01-123456",
    taskId: "003",
    runtime: { name: "codex-cli", version: "0.0.0-dev" },
    status: "completed" as const,
    summary: "Imported runtime output.",
    changedFiles: ["packages/project-arch/src/cli/commands/result.ts"],
    commandsRun: [{ command: "pnpm --filter project-arch test", exitCode: 0 }],
    evidence: {
      diffSummary: "Added result import flow.",
      changedFileCount: 1,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T12:35:00.000Z",
  };
}

describe("sdk/result", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("imports a valid result bundle", async () => {
    const inputPath = path.join(context.tempDir, "bundle.json");
    await fs.writeJson(inputPath, makeResultBundle(), { spaces: 2 });

    const result = await resultImport({ path: inputPath, cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.schemaVersion).toBe(AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION);
    expect(result.data.status).toBe("imported");
    expect(result.data.resultPath).toBe(
      ".project-arch/agent-runtime/results/run-2026-04-01-123456.json",
    );
  });

  it("returns an error for duplicate run ids", async () => {
    const inputPath = path.join(context.tempDir, "bundle.json");
    await fs.writeJson(inputPath, makeResultBundle(), { spaces: 2 });

    const first = await resultImport({ path: inputPath, cwd: context.tempDir });
    resultAssertions.assertSuccess(first);

    const duplicate = await resultImport({ path: inputPath, cwd: context.tempDir });
    resultAssertions.assertErrorContains(duplicate, "already exists");
  });

  it("returns an error for invalid bundles", async () => {
    const inputPath = path.join(context.tempDir, "bundle.json");
    await fs.writeJson(
      inputPath,
      {
        ...makeResultBundle(),
        taskId: "task-003",
      },
      { spaces: 2 },
    );

    const result = await resultImport({ path: inputPath, cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "schema validation");
  });
});
