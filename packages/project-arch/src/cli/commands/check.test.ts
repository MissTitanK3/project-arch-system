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
          diagnostics: [
            {
              code: "CHECK_WARNING",
              severity: "warning",
              message: "warning-a",
              path: null,
              hint: null,
            },
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "error-a",
              path: null,
              hint: null,
            },
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "error-b",
              path: null,
              hint: null,
            },
          ],
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
          diagnostics: [
            {
              code: "CHECK_WARNING",
              severity: "warning",
              message: "warning-only",
              path: null,
              hint: null,
            },
          ],
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

    it("should output structured diagnostics JSON with --json", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: ["warning-a"],
          errors: ["error-a"],
          diagnostics: [
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "error-a",
              path: "apps/example/src/index.ts",
              hint: "Declare it in arch-model/modules.json before implementation.",
            },
            {
              code: "CHECK_WARNING",
              severity: "warning",
              message: "warning-a",
              path: null,
              hint: null,
            },
          ],
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--json"]);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
        schemaVersion: string;
        status: string;
        summary: { errorCount: number; warningCount: number; diagnosticCount: number };
        diagnostics: Array<{
          code: string;
          severity: string;
          path: string | null;
          hint: string | null;
        }>;
      };
      expect(payload.schemaVersion).toBe("1.0");
      expect(payload.status).toBe("invalid");
      expect(payload.summary).toEqual({ errorCount: 1, warningCount: 1, diagnosticCount: 2 });
      expect(payload.diagnostics[0]).toMatchObject({
        code: "CHECK_ERROR",
        severity: "error",
        path: "apps/example/src/index.ts",
      });
      expect(process.exitCode).toBe(1);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should filter diagnostics by --only in text mode", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: ["[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated"],
          errors: ["[CHECK_ERROR] missing artifact"],
          diagnostics: [
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "apps/web/src/index.ts not associated",
              path: "apps/web/src/index.ts",
              hint: null,
            },
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "missing artifact",
              path: "roadmap/manifest.json",
              hint: null,
            },
          ],
        },
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--only", "UNTRACKED_IMPLEMENTATION"]);

      expect(warnSpy).toHaveBeenCalledWith(
        "WARNING: [UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated",
      );
      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith("OK");
      expect(process.exitCode).toBeUndefined();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should filter diagnostics by --severity and --paths in json mode", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: [
            "[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated",
            "[UNTRACKED_IMPLEMENTATION] packages/core/src/main.ts not associated",
          ],
          errors: ["missing artifact"],
          diagnostics: [
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "apps/web/src/index.ts not associated",
              path: "apps/web/src/index.ts",
              hint: null,
            },
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "packages/core/src/main.ts not associated",
              path: "packages/core/src/main.ts",
              hint: null,
            },
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "missing artifact",
              path: "roadmap/manifest.json",
              hint: null,
            },
          ],
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "check",
        "--json",
        "--severity",
        "warning",
        "--paths",
        "apps/**",
      ]);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
        status: string;
        summary: { errorCount: number; warningCount: number; diagnosticCount: number };
        diagnostics: Array<{ code: string; path: string | null; severity: string }>;
      };

      expect(payload.status).toBe("ok");
      expect(payload.summary).toEqual({ errorCount: 0, warningCount: 1, diagnosticCount: 1 });
      expect(payload.diagnostics).toHaveLength(1);
      expect(payload.diagnostics[0]).toMatchObject({
        code: "UNTRACKED_IMPLEMENTATION",
        severity: "warning",
        path: "apps/web/src/index.ts",
      });
      expect(process.exitCode).toBeUndefined();

      logSpy.mockRestore();
    });

    it("should return complete JSON payload for 100+ diagnostics without truncation", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      // Generate 150 diagnostics
      const diagnostics: Array<{
        code: string;
        severity: "warning";
        message: string;
        path: string;
        hint: null;
      }> = [];
      for (let i = 1; i <= 150; i++) {
        const pkgId = String(i).padStart(3, "0");
        diagnostics.push({
          code: "UNTRACKED_IMPLEMENTATION",
          severity: "warning",
          message: `packages/pkg-${pkgId}/src/index.ts not associated`,
          path: `packages/pkg-${pkgId}/src/index.ts`,
          hint: null,
        });
      }

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: diagnostics.map((d) => `[${d.code}] ${d.message}`),
          errors: [],
          diagnostics,
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--json"]);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
        status: string;
        summary: { errorCount: number; warningCount: number; diagnosticCount: number };
        diagnostics: Array<{ code: string; path: string | null; severity: string }>;
      };

      // Verify all diagnostics are present
      expect(payload.diagnostics.length).toBe(150);
      expect(payload.summary.warningCount).toBe(150);
      expect(payload.summary.diagnosticCount).toBe(150);
      expect(payload.diagnostics.every((d) => d.code === "UNTRACKED_IMPLEMENTATION")).toBe(true);

      // Verify ordered paths
      expect(payload.diagnostics[0].path).toBe("packages/pkg-001/src/index.ts");
      expect(payload.diagnostics[149].path).toBe("packages/pkg-150/src/index.ts");

      logSpy.mockRestore();
    });
  });
});
