import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResultImportError, importAgentResult, readAgentResultBundle } from "./resultImport";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION } from "./output";
import { agentResultPath } from "./paths";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { agentResultBundleSchema } from "../../schemas/agentResultBundle";

function makeResultBundle() {
  return {
    schemaVersion: "2.0" as const,
    runId: "run-2026-04-01-123456",
    taskId: "003",
    runtime: {
      name: "codex-cli",
      version: "0.0.0-dev",
    },
    status: "completed" as const,
    summary: "Implemented result import runtime and CLI flow.",
    changedFiles: [
      "packages/project-arch/src/cli/commands/result.ts",
      "packages/project-arch/src/sdk/result.ts",
    ],
    commandsRun: [
      {
        command: "pnpm --filter project-arch test",
        exitCode: 0,
      },
    ],
    evidence: {
      diffSummary: "Added result import command support.",
      changedFileCount: 2,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [],
    completedAt: "2026-04-01T12:35:00.000Z",
  };
}

describe("core/agentRuntime/resultImport", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("reads and validates a result bundle from disk", async () => {
    const bundlePath = path.join(context.tempDir, "bundle.json");
    await fs.writeJson(bundlePath, makeResultBundle(), { spaces: 2 });

    const bundle = await readAgentResultBundle(bundlePath);
    expect(agentResultBundleSchema.parse(bundle)).toEqual(bundle);
  });

  it("imports a valid bundle into the run-scoped results directory", async () => {
    const bundlePath = path.join(context.tempDir, "bundle.json");
    await fs.writeJson(bundlePath, makeResultBundle(), { spaces: 2 });

    const result = await importAgentResult({ path: bundlePath, cwd: context.tempDir });

    expect(result).toEqual({
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: "run-2026-04-01-123456",
      taskId: "003",
      status: "imported",
      resultPath: ".project-arch/agent-runtime/results/run-2026-04-01-123456.json",
    });
    expect(await fs.pathExists(agentResultPath("run-2026-04-01-123456", context.tempDir))).toBe(
      true,
    );
  });

  it("stores the accepted bundle without altering the payload", async () => {
    const bundlePath = path.join(context.tempDir, "bundle.json");
    const bundle = makeResultBundle();
    await fs.writeJson(bundlePath, bundle, { spaces: 2 });

    await importAgentResult({ path: bundlePath, cwd: context.tempDir });

    const stored = await fs.readJson(agentResultPath(bundle.runId, context.tempDir));
    expect(stored).toEqual(bundle);
  });

  it("rejects duplicate run ids without overwriting the stored artifact", async () => {
    const bundlePath = path.join(context.tempDir, "bundle.json");
    const bundle = makeResultBundle();
    await fs.writeJson(bundlePath, bundle, { spaces: 2 });
    await importAgentResult({ path: bundlePath, cwd: context.tempDir });

    await expect(importAgentResult({ path: bundlePath, cwd: context.tempDir })).rejects.toThrow(
      ResultImportError,
    );

    const stored = await fs.readJson(agentResultPath(bundle.runId, context.tempDir));
    expect(stored).toEqual(bundle);
  });

  it("rejects invalid schema payloads", async () => {
    const bundlePath = path.join(context.tempDir, "invalid.json");
    await fs.writeJson(
      bundlePath,
      {
        ...makeResultBundle(),
        taskId: "task-003",
      },
      { spaces: 2 },
    );

    await expect(readAgentResultBundle(bundlePath)).rejects.toThrow(ResultImportError);
    await expect(importAgentResult({ path: bundlePath, cwd: context.tempDir })).rejects.toThrow(
      "schema validation",
    );
  });

  it("rejects non-json input files", async () => {
    const bundlePath = path.join(context.tempDir, "invalid.json");
    await fs.writeFile(bundlePath, "not json", "utf8");

    await expect(readAgentResultBundle(bundlePath)).rejects.toThrow(ResultImportError);
  });
});
