import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerAgentCommand } from "./agent";
import { agent as agentSdk } from "../../sdk";

describe("cli/commands/agent", () => {
  let originalExitCode: number | string | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers the agent namespace with prepare, run, and validate subcommands", () => {
    const program = new Command();
    registerAgentCommand(program);

    const agentCommand = program.commands.find((cmd) => cmd.name() === "agent");
    expect(agentCommand).toBeDefined();
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("prepare");
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("run");
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("status");
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("orchestrate");
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("validate");
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("reconcile");
    expect(agentCommand?.commands.map((cmd) => cmd.name())).toContain("audit");
  });

  it("prints stable JSON output for orchestrate --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentOrchestrate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-234500",
        taskId: "002",
        status: "orchestrated",
        orchestrationStatus: "waiting-for-result-import",
        runtime: "codex-cli",
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-01-234500.json",
        completedRoles: ["planner", "implementer"],
        nextAction: "import-result-and-retry",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "agent",
      "orchestrate",
      "002",
      "--runtime",
      "codex-cli",
      "--json",
    ]);

    expect(agentSdk.agentOrchestrate).toHaveBeenCalledWith({
      taskId: "002",
      runtime: "codex-cli",
      strict: false,
      pathsOnly: false,
      apply: false,
      createDiscovered: false,
      timeoutMs: undefined,
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: { orchestrationStatus: string; completedRoles: string[] };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.orchestrationStatus).toBe("waiting-for-result-import");
    expect(payload.data?.completedRoles).toEqual(["planner", "implementer"]);
  });

  it("prints follow-up guidance for orchestrate waiting-for-result-import", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentOrchestrate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-03-090000",
        taskId: "002",
        status: "orchestrated",
        orchestrationStatus: "waiting-for-result-import",
        runtime: "codex-cli",
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-03-090000.json",
        completedRoles: ["planner", "implementer"],
        nextAction: "import-result-and-retry",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "agent",
      "orchestrate",
      "002",
      "--runtime",
      "codex-cli",
    ]);

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines).toContain(
      "Orchestration paused for follow-up review on run run-2026-04-03-090000 (task 002)",
    );
    expect(lines).toContain("orchestration-status: waiting-for-result-import");
    expect(lines).toContain(
      "fallback: pa result import <path> -> pa agent validate <runId> -> pa agent reconcile <runId>",
    );
  });

  it("prints role failure guidance for orchestrate failures", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentOrchestrate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-03-090100",
        taskId: "002",
        status: "orchestrated",
        orchestrationStatus: "failed",
        runtime: "codex-cli",
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-03-090100.json",
        completedRoles: ["planner"],
        failedRole: "implementer",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "agent",
      "orchestrate",
      "002",
      "--runtime",
      "codex-cli",
    ]);

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines).toContain(
      "Orchestration failed for run run-2026-04-03-090100 (task 002) at role implementer",
    );
    expect(lines).toContain("failed-role: implementer");
    expect(lines).toContain(
      "fallback: pa result import <path> -> pa agent validate <runId> -> pa agent reconcile <runId>",
    );
    expect(process.exitCode).toBe(1);
  });

  it("prints stable JSON output for run --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRun").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-220000",
        taskId: "002",
        status: "launch-dispatched",
        runtime: "codex-cli",
        runHandle: "codex-cli:run-2026-04-01-220000",
        launchedAt: "2026-04-01T22:00:00.000Z",
        lifecycleBoundary: "prepare-first",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-220000.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-220000.md",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-01-220000.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "agent",
      "run",
      "002",
      "--runtime",
      "codex-cli",
      "--json",
    ]);

    expect(agentSdk.agentRun).toHaveBeenCalledWith({
      taskId: "002",
      runtime: "codex-cli",
      timeoutMs: undefined,
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: {
        status: string;
        runtime: string;
        runHandle: string;
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.status).toBe("launch-dispatched");
    expect(payload.data?.runtime).toBe("codex-cli");
    expect(payload.data?.runHandle).toBe("codex-cli:run-2026-04-01-220000");
  });

  it("prints human-readable output for launched runs", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRun").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-220001",
        taskId: "002",
        status: "launch-dispatched",
        runtime: "codex-cli",
        runHandle: "codex-cli:run-2026-04-01-220001",
        launchedAt: "2026-04-01T22:00:01.000Z",
        lifecycleBoundary: "prepare-first",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-220001.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-220001.md",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-01-220001.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "agent",
      "run",
      "002",
      "--runtime",
      "codex-cli",
      "--timeout-ms",
      "45000",
    ]);

    expect(agentSdk.agentRun).toHaveBeenCalledWith({
      taskId: "002",
      runtime: "codex-cli",
      timeoutMs: 45000,
    });
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Launched agent run run-2026-04-01-220001 for task 002 via codex-cli",
      "handle: codex-cli:run-2026-04-01-220001",
      "contract: .project-arch/agent-runtime/contracts/run-2026-04-01-220001.json",
      "prompt: .project-arch/agent-runtime/prompts/run-2026-04-01-220001.md",
      "launch: .project-arch/agent-runtime/launches/run-2026-04-01-220001.json",
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it("maps missing-input run failures to exit code 2", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRun").mockResolvedValue({
      success: false,
      errors: ["PAA001: Task 999 was not found in the project."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "run", "999", "--runtime", "codex-cli"]);

    expect(errorSpy).toHaveBeenCalledWith("ERROR: PAA001: Task 999 was not found in the project.");
    expect(process.exitCode).toBe(2);
  });

  it("prints stable JSON output for agent status --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRunStatus").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-110001",
        taskId: "002",
        status: "launch-status",
        phase: "launch-dispatched",
        lifecycleBoundary: "prepare-first",
        runRecordExists: false,
        orchestrationRecordExists: false,
        runtime: "codex-cli",
        runHandle: "codex-cli:run-2026-04-02-110001",
        launchedAt: "2026-04-02T11:00:01.000Z",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-02-110001.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "agent",
      "status",
      "run-2026-04-02-110001",
      "--json",
    ]);

    expect(agentSdk.agentRunStatus).toHaveBeenCalledWith({ runId: "run-2026-04-02-110001" });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: { status: string; phase: string; runHandle: string };
    };
    expect(payload.success).toBe(true);
    expect(payload.data?.status).toBe("launch-status");
    expect(payload.data?.phase).toBe("launch-dispatched");
    expect(payload.data?.runHandle).toBe("codex-cli:run-2026-04-02-110001");
  });

  it("prints human-readable status output", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRunStatus").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-110002",
        taskId: "002",
        status: "launch-status",
        phase: "post-launch",
        lifecycleBoundary: "prepare-first",
        runRecordExists: true,
        orchestrationRecordExists: false,
        runReviewStatus: "validation-passed-awaiting-reconcile",
        runtime: "codex-cli",
        runHandle: "codex-cli:run-2026-04-02-110002",
        launchedAt: "2026-04-02T11:00:02.000Z",
        launchRecordPath: ".project-arch/agent-runtime/launches/run-2026-04-02-110002.json",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-110002.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "status", "run-2026-04-02-110002"]);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "run: run-2026-04-02-110002",
      "phase: post-launch",
      "handle: codex-cli:run-2026-04-02-110002",
      "review-status: validation-passed-awaiting-reconcile",
      "orchestration-status: none (single-agent run or pre-orchestration state)",
      "launch-record: .project-arch/agent-runtime/launches/run-2026-04-02-110002.json",
      "boundary: launch-phase advisory; run-record is authoritative downstream",
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints orchestration state details in status when orchestration exists", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRunStatus").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-03-091000",
        taskId: "002",
        status: "launch-status",
        phase: "launch-dispatched",
        lifecycleBoundary: "prepare-first",
        runRecordExists: false,
        orchestrationRecordExists: true,
        orchestrationPath: ".project-arch/agent-runtime/orchestration/run-2026-04-03-091000.json",
        orchestrationStatus: "waiting-for-result-import",
        orchestrationCompletedRoles: ["planner", "implementer"],
        runtime: "codex-cli",
        runHandle: "codex-cli:run-2026-04-03-091000",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "status", "run-2026-04-03-091000"]);

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines).toContain("orchestration-status: waiting-for-result-import");
    expect(lines).toContain(
      "orchestration: .project-arch/agent-runtime/orchestration/run-2026-04-03-091000.json",
    );
    expect(lines).toContain("orchestration-roles: planner, implementer");
    expect(lines).toContain(
      "orchestration-note: waiting for runtime result import before validate/reconcile follow-up",
    );
  });

  it("prints pre-launch status correctly (no handle/review-status)", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRunStatus").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-02-110003",
        taskId: "run-2026-04-02-110003",
        status: "launch-status",
        phase: "pre-launch",
        lifecycleBoundary: "prepare-first",
        runRecordExists: false,
        orchestrationRecordExists: false,
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "status", "run-2026-04-02-110003"]);

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines).toContain("run: run-2026-04-02-110003");
    expect(lines).toContain("phase: pre-launch");
    // handle and review-status should NOT appear for pre-launch
    expect(lines.some((l) => l.startsWith("handle:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("review-status:"))).toBe(false);
  });

  it("sets exit code 1 on status failure (non-missing)", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentRunStatus").mockResolvedValue({
      success: false,
      errors: ["Schema parse error for run record"],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "status", "run-2026-04-02-110004"]);

    expect(errorSpy).toHaveBeenCalledWith("ERROR: Schema parse error for run record");
    expect(process.exitCode).toBe(1);
  });

  it("prints stable JSON output for agent audit --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentAuditHistory").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "audit-history",
        logPath: ".project-arch/agent-runtime/logs/execution.jsonl",
        events: [
          {
            schemaVersion: "2.0",
            eventId: "validate-run-2026-04-01-180000-1",
            occurredAt: "2026-04-01T18:00:00.000Z",
            command: "validate",
            status: "success",
            runId: "run-2026-04-01-180000",
            taskId: "001",
          },
        ],
        total: 1,
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "audit", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: {
        status: string;
        total: number;
        logPath: string;
      };
    };
    expect(payload.success).toBe(true);
    expect(payload.data?.status).toBe("audit-history");
    expect(payload.data?.total).toBe(1);
    expect(payload.data?.logPath).toBe(".project-arch/agent-runtime/logs/execution.jsonl");
  });

  it("prints human-readable audit history and passes runId/limit", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentAuditHistory").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "audit-history",
        logPath: ".project-arch/agent-runtime/logs/execution.jsonl",
        events: [
          {
            schemaVersion: "2.0",
            eventId: "prepare-run-2026-04-01-180001-1",
            occurredAt: "2026-04-01T18:01:00.000Z",
            command: "prepare",
            status: "success",
            runId: "run-2026-04-01-180001",
            taskId: "002",
          },
        ],
        total: 1,
        filteredByRunId: "run-2026-04-01-180001",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agent",
      "audit",
      "run-2026-04-01-180001",
      "--limit",
      "1",
    ]);

    expect(agentSdk.agentAuditHistory).toHaveBeenCalledWith({
      runId: "run-2026-04-01-180001",
      limit: 1,
    });
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Audit log: .project-arch/agent-runtime/logs/execution.jsonl",
      "boundary: runtime-local history; promotion is explicit",
      "events: 1/1",
      "2026-04-01T18:01:00.000Z prepare success run=run-2026-04-01-180001 task=002",
    ]);
  });

  it("prints stable JSON output for reconcile --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-140000",
        taskId: "004",
        status: "reconciled",
        reconciliationStatus: "completed",
        reportPath: ".project-arch/reconcile/004-run-2026-04-01-140000-2026-04-01.json",
        reportMarkdownPath: ".project-arch/reconcile/004-run-2026-04-01-140000-2026-04-01.md",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-140000.json",
        apply: false,
        createDiscovered: false,
        escalationDraftPaths: [],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agent",
      "reconcile",
      "run-2026-04-01-140000",
      "--json",
    ]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: {
        runId: string;
        taskId: string;
        status: string;
        reconciliationStatus: string;
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.runId).toBe("run-2026-04-01-140000");
    expect(payload.data?.taskId).toBe("004");
    expect(payload.data?.status).toBe("reconciled");
    expect(payload.data?.reconciliationStatus).toBe("completed");
  });

  it("passes apply and create-discovered options through to SDK", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-140001",
        taskId: "004",
        status: "reconciled",
        reconciliationStatus: "completed",
        reportPath: ".project-arch/reconcile/004-run-2026-04-01-140001-2026-04-01.json",
        reportMarkdownPath: ".project-arch/reconcile/004-run-2026-04-01-140001-2026-04-01.md",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-140001.json",
        apply: true,
        createDiscovered: true,
        escalationDraftPaths: [],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agent",
      "reconcile",
      "run-2026-04-01-140001",
      "--apply",
      "--create-discovered",
    ]);

    expect(agentSdk.agentReconcile).toHaveBeenCalledWith({
      runId: "run-2026-04-01-140001",
      apply: true,
      createDiscovered: true,
    });
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Reconciled run run-2026-04-01-140001 (task 004)",
      "report: .project-arch/reconcile/004-run-2026-04-01-140001-2026-04-01.json",
      "report-md: .project-arch/reconcile/004-run-2026-04-01-140001-2026-04-01.md",
      "run: .project-arch/agent-runtime/runs/run-2026-04-01-140001.json",
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints discovered draft path in human output when present", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-140002",
        taskId: "004",
        status: "reconciled",
        reconciliationStatus: "completed",
        reportPath: ".project-arch/reconcile/004-run-2026-04-01-140002-2026-04-01.json",
        reportMarkdownPath: ".project-arch/reconcile/004-run-2026-04-01-140002-2026-04-01.md",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-140002.json",
        apply: false,
        createDiscovered: true,
        discoveredDraftPath:
          ".project-arch/reconcile/discovered-004-run-2026-04-01-140002-2026-04-01.md",
        escalationDraftPaths: [],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agent",
      "reconcile",
      "run-2026-04-01-140002",
      "--create-discovered",
    ]);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Reconciled run run-2026-04-01-140002 (task 004)",
      "report: .project-arch/reconcile/004-run-2026-04-01-140002-2026-04-01.json",
      "report-md: .project-arch/reconcile/004-run-2026-04-01-140002-2026-04-01.md",
      "run: .project-arch/agent-runtime/runs/run-2026-04-01-140002.json",
      "discovered: .project-arch/reconcile/discovered-004-run-2026-04-01-140002-2026-04-01.md",
    ]);
  });

  it("prints escalation draft paths when reconcile promotes decision requests", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-140006",
        taskId: "004",
        status: "reconciled",
        reconciliationStatus: "completed",
        reportPath: ".project-arch/reconcile/004-run-2026-04-01-140006-2026-04-01.json",
        reportMarkdownPath: ".project-arch/reconcile/004-run-2026-04-01-140006-2026-04-01.md",
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-140006.json",
        apply: false,
        createDiscovered: false,
        escalationDraftPaths: [
          ".project-arch/reconcile/escalations/004-run-2026-04-01-140006-01-public-contract-change.json",
          ".project-arch/reconcile/escalations/004-run-2026-04-01-140006-01-public-contract-change.md",
        ],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "reconcile", "run-2026-04-01-140006"]);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Reconciled run run-2026-04-01-140006 (task 004)",
      "report: .project-arch/reconcile/004-run-2026-04-01-140006-2026-04-01.json",
      "report-md: .project-arch/reconcile/004-run-2026-04-01-140006-2026-04-01.md",
      "run: .project-arch/agent-runtime/runs/run-2026-04-01-140006.json",
      "escalation: .project-arch/reconcile/escalations/004-run-2026-04-01-140006-01-public-contract-change.json",
      "escalation: .project-arch/reconcile/escalations/004-run-2026-04-01-140006-01-public-contract-change.md",
    ]);
  });

  it("maps unvalidated-run reconcile failures to exit code 1", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: false,
      errors: ["Run run-2026-04-01-140003 has not passed validation and cannot be reconciled."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "reconcile", "run-2026-04-01-140003"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Run run-2026-04-01-140003 has not passed validation and cannot be reconciled.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("maps missing reconcile-input failures to exit code 2", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: false,
      errors: ["Validated run record not found for run run-2026-04-01-140004."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "reconcile", "run-2026-04-01-140004"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Validated run record not found for run run-2026-04-01-140004.",
    );
    expect(process.exitCode).toBe(2);
  });

  it("maps reconcile missing-artifact failures to exit code 2", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentReconcile").mockResolvedValue({
      success: false,
      errors: [
        "Imported result artifact is missing for run run-2026-04-01-140005: .project-arch/agent-runtime/results/run-2026-04-01-140005.json",
      ],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "reconcile", "run-2026-04-01-140005"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Imported result artifact is missing for run run-2026-04-01-140005: .project-arch/agent-runtime/results/run-2026-04-01-140005.json",
    );
    expect(process.exitCode).toBe(2);
  });

  it("prints stable JSON output for validate --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentValidate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130000",
        taskId: "001",
        ok: true,
        status: "validation-passed",
        validatedAt: "2026-04-01T13:10:00.000Z",
        violations: [],
        warnings: [],
        checksRun: ["scope", "blocked-operations", "required-evidence"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130000.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agent",
      "validate",
      "run-2026-04-01-130000",
      "--json",
    ]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: {
        runId: string;
        taskId: string;
        status: string;
        ok: boolean;
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.runId).toBe("run-2026-04-01-130000");
    expect(payload.data?.taskId).toBe("001");
    expect(payload.data?.status).toBe("validation-passed");
    expect(payload.data?.ok).toBe(true);
  });

  it("prints escalation-ready validation guidance when escalation warnings exist", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentValidate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130010",
        taskId: "001",
        ok: true,
        status: "validation-passed",
        validatedAt: "2026-04-01T13:20:00.000Z",
        violations: [],
        warnings: [
          {
            code: "PAA007",
            severity: "warning",
            message: "Escalation is required before validation can pass reconciliation review.",
          },
        ],
        checksRun: ["scope", "blocked-operations", "required-evidence"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130010.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "validate", "run-2026-04-01-130010"]);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Validation passed with escalation review required for run run-2026-04-01-130010 (task 001)",
      "run: .project-arch/agent-runtime/runs/run-2026-04-01-130010.json",
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it("passes strict and paths-only options through to SDK", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentValidate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130001",
        taskId: "001",
        ok: true,
        status: "validation-passed",
        validatedAt: "2026-04-01T13:11:00.000Z",
        violations: [],
        warnings: [],
        checksRun: ["scope"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130001.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agent",
      "validate",
      "run-2026-04-01-130001",
      "--strict",
      "--paths-only",
    ]);

    expect(agentSdk.agentValidate).toHaveBeenCalledWith({
      runId: "run-2026-04-01-130001",
      strict: true,
      pathsOnly: true,
    });
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Validation passed for run run-2026-04-01-130001 (task 001)",
      "run: .project-arch/agent-runtime/runs/run-2026-04-01-130001.json",
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it("maps validation-failed outcomes to exit code 1", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentValidate").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-130002",
        taskId: "001",
        ok: false,
        status: "validation-failed",
        validatedAt: "2026-04-01T13:12:00.000Z",
        violations: [
          {
            code: "PAA003",
            severity: "error",
            message: "Changed file is outside allowed paths.",
            path: ".github/workflows/release.yml",
          },
        ],
        warnings: [],
        checksRun: ["scope"],
        runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-01-130002.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "validate", "run-2026-04-01-130002"]);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Validation failed for run run-2026-04-01-130002 (task 001)",
      "run: .project-arch/agent-runtime/runs/run-2026-04-01-130002.json",
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("maps missing-input failures to exit code 2", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentValidate").mockResolvedValue({
      success: false,
      errors: ["Prepared contract not found for run run-2026-04-01-130003."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "validate", "run-2026-04-01-130003"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Prepared contract not found for run run-2026-04-01-130003.",
    );
    expect(process.exitCode).toBe(2);
  });

  it("maps non-missing validate errors to exit code 1", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentValidate").mockResolvedValue({
      success: false,
      errors: ["Contract/result identity mismatch for run run-2026-04-01-130004."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agent", "validate", "run-2026-04-01-130004"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Contract/result identity mismatch for run run-2026-04-01-130004.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("prints stable JSON output for prepare --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-123456",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-123456.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-123456.md",
        allowedPaths: ["packages/project-arch/src/cli/commands/agent.ts"],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "002", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      data?: {
        runId: string;
        taskId: string;
        status: string;
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.runId).toBe("run-2026-04-01-123456");
    expect(payload.data?.taskId).toBe("002");
    expect(payload.data?.status).toBe("prepared");
  });

  it("prints SDK envelope and exit code 2 for approval-required prepare --json failures", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: false,
      errors: ["Approval required: Task 101 requires explicit promotion before agent execution."],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "101", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      errors?: string[];
    };

    expect(payload.success).toBe(false);
    expect(payload.errors?.[0]).toContain("Approval required");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("passes prompt-only through and prints the prompt body by default", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-123456",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-123456.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-123456.md",
        allowedPaths: ["packages/project-arch/src/cli/commands/agent.ts"],
        prompt: "# Agent Task Prompt: Implement pa agent prepare command\n",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "002", "--prompt-only"]);

    expect(agentSdk.agentPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "002",
        promptOnly: true,
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      "# Agent Task Prompt: Implement pa agent prepare command\n",
    );
  });

  it("passes check through and prints concise human output", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-123456",
        taskId: "002",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-123456.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-123456.md",
        allowedPaths: ["packages/project-arch/src/cli/commands/agent.ts"],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "002", "--check"]);

    expect(agentSdk.agentPrepare).toHaveBeenCalledWith({
      taskId: "002",
      promptOnly: undefined,
      check: true,
    });
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Prepare check passed for task 002 (run-2026-04-01-123456)",
      "contract: .project-arch/agent-runtime/contracts/run-2026-04-01-123456.json",
      "prompt: .project-arch/agent-runtime/prompts/run-2026-04-01-123456.md",
    ]);
  });

  it("prints errors and exits non-zero when prepare fails", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: false,
      errors: ["Task 999 was not found in the project."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "999"]);

    expect(errorSpy).toHaveBeenCalledWith("ERROR: Task 999 was not found in the project.");
    expect(process.exitCode).toBe(1);
  });

  it("maps approval-required prepare failures to exit code 2", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: false,
      errors: [
        "PAA013: Approval required: Task 101 requires explicit promotion before agent execution.",
      ],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "101"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "APPROVAL REQUIRED: PAA013: Approval required: Task 101 requires explicit promotion before agent execution.",
    );
    expect(process.exitCode).toBe(2);
  });

  it("labels ineligible prepare failures as not authorized", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentCommand(program);

    vi.spyOn(agentSdk, "agentPrepare").mockResolvedValue({
      success: false,
      errors: ["Task 301 is in lane 'icebox' and is not authorized for agent execution."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agent", "prepare", "301"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "NOT AUTHORIZED: Task 301 is in lane 'icebox' and is not authorized for agent execution.",
    );
    expect(process.exitCode).toBe(1);
  });
});
