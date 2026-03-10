import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerLintCommand } from "./lint";
import { lint as lintSdk } from "../../sdk";

describe("cli/commands/lint", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers lint command with frontmatter subcommand", () => {
    const program = new Command();
    registerLintCommand(program);

    const lintCommand = program.commands.find((cmd) => cmd.name() === "lint");
    expect(lintCommand).toBeDefined();
    expect(lintCommand?.commands.some((cmd) => cmd.name() === "frontmatter")).toBe(true);
  });

  it("prints file+line diagnostics and sets exit code on errors", async () => {
    const program = new Command();
    program.exitOverride();
    registerLintCommand(program);

    vi.spyOn(lintSdk, "lintFrontmatterRun").mockResolvedValue({
      success: true,
      data: {
        ok: false,
        scannedFiles: 2,
        fixedFiles: 0,
        diagnostics: [
          {
            code: "MISSING_REQUIRED_KEY",
            severity: "error",
            message: "Missing required key 'title'.",
            path: "feedback/tasks/001-test.md",
            line: 4,
          },
        ],
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "lint", "frontmatter"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: feedback/tasks/001-test.md:4 [MISSING_REQUIRED_KEY] Missing required key 'title'.",
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith("OK");
    expect(process.exitCode).toBe(1);
  });

  it("prints OK for clean lint run", async () => {
    const program = new Command();
    program.exitOverride();
    registerLintCommand(program);

    vi.spyOn(lintSdk, "lintFrontmatterRun").mockResolvedValue({
      success: true,
      data: {
        ok: true,
        scannedFiles: 5,
        fixedFiles: 0,
        diagnostics: [],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "lint", "frontmatter"]);

    expect(logSpy).toHaveBeenCalledWith("OK");
    expect(process.exitCode).toBeUndefined();
  });
});
