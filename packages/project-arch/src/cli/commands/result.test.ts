import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerResultCommand } from "./result";
import { result as resultSdk } from "../../sdk";

describe("cli/commands/result", () => {
  let originalExitCode: number | string | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers the result namespace with an import subcommand", () => {
    const program = new Command();
    registerResultCommand(program);

    const resultCommand = program.commands.find((cmd) => cmd.name() === "result");
    expect(resultCommand).toBeDefined();
    expect(resultCommand?.commands.map((cmd) => cmd.name())).toContain("import");
  });

  it("prints stable JSON output for result import --json", async () => {
    const program = new Command();
    program.exitOverride();
    registerResultCommand(program);

    vi.spyOn(resultSdk, "resultImport").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-123456",
        taskId: "003",
        status: "imported",
        resultPath: ".project-arch/agent-runtime/results/run-2026-04-01-123456.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "result", "import", "bundle.json", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      runId: string;
      taskId: string;
      status: string;
    };

    expect(payload.runId).toBe("run-2026-04-01-123456");
    expect(payload.taskId).toBe("003");
    expect(payload.status).toBe("imported");
  });

  it("prints concise human output by default", async () => {
    const program = new Command();
    program.exitOverride();
    registerResultCommand(program);

    vi.spyOn(resultSdk, "resultImport").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-123456",
        taskId: "003",
        status: "imported",
        resultPath: ".project-arch/agent-runtime/results/run-2026-04-01-123456.json",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "result", "import", "bundle.json"]);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      "Imported result bundle run-2026-04-01-123456 for task 003",
      "result: .project-arch/agent-runtime/results/run-2026-04-01-123456.json",
    ]);
  });

  it("prints errors and exits non-zero when import fails", async () => {
    const program = new Command();
    program.exitOverride();
    registerResultCommand(program);

    vi.spyOn(resultSdk, "resultImport").mockResolvedValue({
      success: false,
      errors: ["Result bundle failed schema validation."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "result", "import", "bundle.json"]);

    expect(errorSpy).toHaveBeenCalledWith("ERROR: Result bundle failed schema validation.");
    expect(process.exitCode).toBe(1);
  });
});
