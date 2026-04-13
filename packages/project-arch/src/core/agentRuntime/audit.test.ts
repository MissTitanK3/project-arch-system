import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { appendAgentAuditEvent, auditLogPath, readAgentAuditHistory } from "./audit";

describe("core/agentRuntime/audit", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("stores runtime audit history under .project-arch/agent-runtime/logs/execution.jsonl", async () => {
    await appendAgentAuditEvent(
      {
        command: "validate",
        status: "success",
        runId: "run-2026-04-01-170000",
        taskId: "001",
      },
      context.tempDir,
    );

    const targetPath = auditLogPath(context.tempDir);
    expect(await fs.pathExists(targetPath)).toBe(true);
    expect(path.relative(context.tempDir, targetPath).replace(/\\/g, "/")).toBe(
      ".project-arch/agent-runtime/logs/execution.jsonl",
    );
    expect(await fs.pathExists(path.join(context.tempDir, ".project-arch/feedback"))).toBe(false);
  });

  it("reads and filters audit history by run id and limit", async () => {
    await appendAgentAuditEvent(
      {
        command: "prepare",
        status: "success",
        runId: "run-2026-04-01-170001",
        taskId: "001",
      },
      context.tempDir,
    );
    await appendAgentAuditEvent(
      {
        command: "validate",
        status: "success",
        runId: "run-2026-04-01-170001",
        taskId: "001",
      },
      context.tempDir,
    );
    await appendAgentAuditEvent(
      {
        command: "reconcile",
        status: "success",
        runId: "run-2026-04-01-170002",
        taskId: "002",
      },
      context.tempDir,
    );

    const all = await readAgentAuditHistory({ cwd: context.tempDir });
    expect(all.total).toBe(3);

    const filtered = await readAgentAuditHistory({
      cwd: context.tempDir,
      runId: "run-2026-04-01-170001",
      limit: 1,
    });
    expect(filtered.total).toBe(2);
    expect(filtered.events).toHaveLength(1);
    expect(filtered.events[0]?.command).toBe("validate");
  });
});
