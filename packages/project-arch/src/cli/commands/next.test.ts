import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerNextCommand } from "./next";
import { next as nextSdk } from "../../sdk";

describe("cli/commands/next", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers next command", () => {
    const program = new Command();
    registerNextCommand(program);

    const nextCommand = program.commands.find((cmd) => cmd.name() === "next");
    expect(nextCommand).toBeDefined();
    expect(nextCommand?.description()).toBe("Recommend the next deterministic workflow action");
  });

  it("prints machine-readable decision in json mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerNextCommand(program);

    vi.spyOn(nextSdk, "nextResolve").mockResolvedValue({
      success: true,
      data: {
        status: "needs_check",
        recommendedCommand: "pa check",
        reason: "Critical architecture checks are failing.",
        evidence: ["MALFORMED_TASK_FILE: broken"],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "next", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      schemaVersion: string;
      status: string;
      recommendedCommand: string;
      reason: string;
      evidence: string[];
    };

    expect(payload.schemaVersion).toBe("2.0");
    expect(payload.status).toBe("needs_check");
    expect(payload.recommendedCommand).toBe("pa check");
  });

  it("prints human-readable decision in text mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerNextCommand(program);

    vi.spyOn(nextSdk, "nextResolve").mockResolvedValue({
      success: true,
      data: {
        status: "healthy_noop",
        recommendedCommand: "none",
        reason: "Repository state is healthy; no next action required.",
        evidence: ["checks: passing"],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "next"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("status: healthy_noop");
    expect(output).toContain("next: none");
    expect(output).toContain("reason:");
    expect(output).toContain("evidence:");
  });
});
