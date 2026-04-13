import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerDoctorCommand } from "./doctor";
import { lint, check } from "../../sdk";
import * as doctorHealth from "../../core/doctor/health";

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
    expect(doctorCommand?.description()).toBe(
      "Run holistic health sweep and summarise all issues by severity",
    );
    expect(doctorCommand?.commands.map((cmd) => cmd.name())).toContain("health");
  });

  it("should render doctor health JSON payload", async () => {
    const program = new Command();
    program.exitOverride();
    vi.spyOn(doctorHealth, "runDoctorHealth").mockResolvedValue({
      status: "degraded",
      checkedAt: "2026-03-22",
      repairedCount: 1,
      issues: [
        {
          code: "PAH007",
          severity: "error",
          message: "Missing decision index",
          fix: "Create decisions/index.json",
          repairable: true,
          path: "roadmap/decisions/index.json",
          repaired: false,
        },
      ],
    });

    registerDoctorCommand(program);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor", "health", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      schemaVersion: string;
      status: string;
      summary: { issueCount: number; repairedCount: number };
      issues: Array<{ code: string }>;
    };

    expect(payload.schemaVersion).toBe("2.0");
    expect(payload.status).toBe("degraded");
    expect(payload.summary.issueCount).toBe(1);
    expect(payload.summary.repairedCount).toBe(1);
    expect(payload.issues[0].code).toBe("PAH007");
  });

  it("should set non-zero exit code when doctor health status is broken", async () => {
    const program = new Command();
    program.exitOverride();
    vi.spyOn(doctorHealth, "runDoctorHealth").mockResolvedValue({
      status: "broken",
      checkedAt: "2026-03-22",
      repairedCount: 0,
      issues: [
        {
          code: "PAH001",
          severity: "error",
          message: "Missing required repository root",
          fix: "Create missing directory",
          repairable: true,
          path: "roadmap",
          repaired: false,
        },
      ],
    });

    registerDoctorCommand(program);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor", "health"]);

    expect(process.exitCode).toBe(1);
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
    expect(logged.some((entry) => entry.includes("Summary:"))).toBe(true);
    expect(logged.some((entry) => entry.includes("OK (doctor sweep passed)"))).toBe(true);
  });

  it("continues all steps and reports failure summary when step 2 fails", async () => {
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
    vi.spyOn(check, "checkRun").mockResolvedValue({
      success: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        diagnostics: [],
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(errorSpy).toHaveBeenCalledWith("ERROR: Step 2 failed (pnpm lint:md) (exit code 1).");
    // Step 3 still runs in holistic mode.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Step 2 (pnpm lint:md)"));
    const logged = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes("Summary:"))).toBe(true);
    expect(process.exitCode).toBe(1);

    logSpy.mockRestore();
  });
});
