import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerDoctorCommand } from "./doctor";
import { lint, check } from "../../sdk";

describe("cli/commands/doctor", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("should register doctor command", () => {
    const program = new Command();
    registerDoctorCommand(program);

    const doctorCommand = program.commands.find((cmd) => cmd.name() === "doctor");
    expect(doctorCommand).toBeDefined();
    expect(doctorCommand?.description()).toBe("Run canonical preflight validation pipeline");
  });

  it("should run canonical doctor pipeline in order", async () => {
    const program = new Command();
    program.exitOverride();
    const markdownLintStep = vi.fn().mockReturnValue({ ok: true });
    registerDoctorCommand(program, { runMarkdownLintStep: markdownLintStep });

    const lintRunSpy = vi.spyOn(lint, "lintFrontmatterRun").mockResolvedValue({
      success: true,
      data: {
        ok: true,
        scannedFiles: 5,
        fixedFiles: 0,
        diagnostics: [],
      },
    });
    const checkRunSpy = vi.spyOn(check, "checkRun").mockResolvedValue({
      success: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        diagnostics: [],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(lintRunSpy).toHaveBeenCalled();
    expect(markdownLintStep).toHaveBeenCalled();
    expect(checkRunSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.map((call) => String(call[0]));
    const step1 = logged.findIndex((entry) => entry.includes("Step 1/3"));
    const step2 = logged.findIndex((entry) => entry.includes("Step 2/3"));
    const step3 = logged.findIndex((entry) => entry.includes("Step 3/3"));
    expect(step1).toBeGreaterThanOrEqual(0);
    expect(step2).toBeGreaterThan(step1);
    expect(step3).toBeGreaterThan(step2);
  });

  it("should stop on step 2 failure with actionable attribution", async () => {
    const program = new Command();
    program.exitOverride();
    const markdownLintStep = vi.fn().mockReturnValue({ ok: false, reason: "exit code 1" });
    registerDoctorCommand(program, { runMarkdownLintStep: markdownLintStep });

    vi.spyOn(lint, "lintFrontmatterRun").mockResolvedValue({
      success: true,
      data: {
        ok: true,
        scannedFiles: 5,
        fixedFiles: 0,
        diagnostics: [],
      },
    });
    const checkRunSpy = vi.spyOn(check, "checkRun").mockResolvedValue({
      success: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        diagnostics: [],
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(errorSpy).toHaveBeenCalledWith("ERROR: Step 2 failed (pnpm lint:md) (exit code 1).");
    expect(checkRunSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
