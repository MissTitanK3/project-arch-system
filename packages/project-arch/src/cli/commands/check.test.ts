import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerCheckCommand } from "./check";
import { check as checkSdk } from "../../sdk";
import { createTestProject, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/check", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  let originalExitCode: string | number | null | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    context = await createTestProject(originalCwd);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    await context.cleanup();
  });

  describe("registerCheckCommand", () => {
    it("should register check command", () => {
      const program = new Command();
      registerCheckCommand(program);

      const checkCommand = program.commands.find((cmd) => cmd.name() === "check");
      expect(checkCommand).toBeDefined();
      expect(checkCommand?.description()).toBe("Validate architecture consistency");
    });

    it("should execute check and report OK for valid project", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check"]);

      expect(consoleSpy).toHaveBeenCalledWith("OK");
      expect(process.exitCode).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it("should handle warnings without failing", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check"]);

      //With a freshly initialized project, we should get OK
      expect(logSpy).toHaveBeenCalledWith("OK");

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should print warnings and errors and set exit code when check fails", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: ["warning-a"],
          errors: ["error-a", "error-b"],
        },
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check"]);

      expect(warnSpy).toHaveBeenCalledWith("WARNING: warning-a");
      expect(errorSpy).toHaveBeenCalledWith("ERROR: error-a");
      expect(errorSpy).toHaveBeenCalledWith("ERROR: error-b");
      expect(logSpy).not.toHaveBeenCalledWith("OK");
      expect(process.exitCode).toBe(1);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should print warnings and OK when validation succeeds with warnings", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: true,
          warnings: ["warning-only"],
          errors: [],
        },
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check"]);

      expect(warnSpy).toHaveBeenCalledWith("WARNING: warning-only");
      expect(logSpy).toHaveBeenCalledWith("OK");
      expect(process.exitCode).toBeUndefined();

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should include enhanced help metadata in check help", async () => {
      const program = new Command();
      const output: string[] = [];
      program.exitOverride().configureOutput({
        writeOut: (str) => {
          output.push(str);
        },
      });
      registerCheckCommand(program);

      await expect(program.parseAsync(["node", "test", "check", "--help"])).rejects.toMatchObject({
        code: "commander.helpDisplayed",
      });

      const helpText = output.join("");
      expect(helpText).toContain("Usage:");
      expect(helpText).toContain("check [options]");
      expect(helpText).toContain("Validate architecture consistency");
      expect(helpText).toContain("Run validation");
      expect(helpText).toContain("See also:");
    });
  });
});
