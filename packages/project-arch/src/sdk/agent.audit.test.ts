import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { appendAgentAuditEvent } from "../core/agentRuntime/audit";
import { agentAuditHistory } from "./agent";

describe("sdk/agent audit", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns runtime-local audit history through SDK", async () => {
    await appendAgentAuditEvent(
      {
        command: "prepare",
        status: "success",
        runId: "run-2026-04-01-180000",
        taskId: "001",
      },
      context.tempDir,
    );

    const result = await agentAuditHistory({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);

    expect(result.data.status).toBe("audit-history");
    expect(result.data.logPath).toBe(".project-arch/agent-runtime/logs/execution.jsonl");
    expect(result.data.total).toBe(1);
  });

  it("supports run-id filtered audit history", async () => {
    await appendAgentAuditEvent(
      {
        command: "validate",
        status: "success",
        runId: "run-2026-04-01-180001",
        taskId: "001",
      },
      context.tempDir,
    );
    await appendAgentAuditEvent(
      {
        command: "validate",
        status: "success",
        runId: "run-2026-04-01-180002",
        taskId: "002",
      },
      context.tempDir,
    );

    const result = await agentAuditHistory({
      cwd: context.tempDir,
      runId: "run-2026-04-01-180001",
    });
    resultAssertions.assertSuccess(result);

    expect(result.data.total).toBe(1);
    expect(result.data.events[0]?.runId).toBe("run-2026-04-01-180001");
  });
});
