import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerCheckCommand } from "./check";
import * as changedScope from "./checkChangedScope";
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

    it("should pass coverage mode to sdk check run", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      const checkSpy = vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: true,
          warnings: [],
          errors: [],
          diagnostics: [],
        },
      });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--coverage-mode", "error"]);

      expect(checkSpy).toHaveBeenCalledWith(expect.objectContaining({ coverageMode: "error" }));
      expect(consoleSpy).toHaveBeenCalledWith("OK");
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
          compatibility: {
            surface: "validation",
            mode: "hybrid",
            supported: true,
            canonicalRootExists: true,
            legacyRootExists: true,
            reason: "Validation runs in hybrid mode and prefers canonical project-scoped roadmap paths.",
          },
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
        compatibility: { mode: string; supported: boolean; surface: string };
        diagnostics: Array<{
          code: string;
          severity: string;
          path: string | null;
          hint: string | null;
        }>;
      };
      expect(payload.schemaVersion).toBe("1.0");
      expect(payload.status).toBe("invalid");
      expect(payload.compatibility.mode).toBe("project-scoped-only");
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

    it("should emit compatibility metadata in json output", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--json"]);

      const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
        compatibility: { mode: string; supported: boolean; surface: string };
      };

      expect(payload.compatibility).toMatchObject({
        surface: "validation",
        supported: true,
      });

      logSpy.mockRestore();
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

    it("should use fail-fast mode and emit only first actionable diagnostic context", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      const checkRunSpy = vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: ["[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated"],
          errors: [
            "Missing code target 'apps/missing/src/index.ts' referenced by task phase-1/milestone-1/001",
            "Decision project:20260312:test links missing task 'phase-1/milestone-1/999'",
          ],
          diagnostics: [
            {
              code: "MISSING_TASK_CODE_TARGET",
              severity: "error",
              message:
                "Missing code target 'apps/missing/src/index.ts' referenced by task phase-1/milestone-1/001",
              path: "apps/missing/src/index.ts",
              hint: "Declare it in arch-model/modules.json before implementation.",
            },
            {
              code: "MISSING_LINKED_TASK",
              severity: "error",
              message:
                "Decision project:20260312:test links missing task 'phase-1/milestone-1/999'",
              path: null,
              hint: null,
            },
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "apps/web/src/index.ts not associated",
              path: "apps/web/src/index.ts",
              hint: null,
            },
          ],
        },
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--fail-fast"]);

      expect(checkRunSpy).toHaveBeenCalledWith({
        failFast: true,
        completenessThreshold: 100,
        coverageMode: "warning",
      });
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalledWith("OK");
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const rendered = String(errorSpy.mock.calls[0]?.[0]);
      expect(rendered).toContain("[MISSING_TASK_CODE_TARGET]");
      expect(rendered).toContain("Location: apps/missing/src/index.ts");
      expect(rendered).toContain(
        "Hint: Declare it in arch-model/modules.json before implementation.",
      );
      expect(process.exitCode).toBe(1);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should pass custom completeness threshold to check sdk", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      const checkRunSpy = vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: true,
          warnings: [],
          errors: [],
          diagnostics: [],
          graphDiagnostics: {
            built: true,
            completeness: {
              score: 100,
              threshold: 85,
              sufficient: true,
              connectedDecisionNodes: 1,
              totalDecisionNodes: 1,
            },
            disconnectedNodes: {
              decisionsWithoutDomain: [],
              decisionsWithoutTaskBackReferences: [],
              domainsWithoutDecisions: [],
              taskReferencesToMissingDecisions: [],
            },
          },
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--completeness-threshold", "85"]);

      expect(checkRunSpy).toHaveBeenCalledWith({
        failFast: undefined,
        completenessThreshold: 85,
        coverageMode: "warning",
      });
      expect(logSpy).toHaveBeenCalledWith("OK");

      logSpy.mockRestore();
    });

    it("should scope diagnostics when --changed detects changed files", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(changedScope, "detectChangedPaths").mockReturnValue({
        ok: true,
        paths: ["apps/web/src/index.ts"],
      });

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: ["[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated"],
          errors: [
            "Missing code target 'packages/core/src/main.ts' referenced by task phase-1/m1/001",
          ],
          diagnostics: [
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "apps/web/src/index.ts not associated",
              path: "apps/web/src/index.ts",
              hint: null,
            },
            {
              code: "MISSING_TASK_CODE_TARGET",
              severity: "error",
              message:
                "Missing code target 'packages/core/src/main.ts' referenced by task phase-1/m1/001",
              path: "packages/core/src/main.ts",
              hint: null,
            },
          ],
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--json", "--changed"]);

      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(String(logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0])) as {
        summary: { errorCount: number; warningCount: number; diagnosticCount: number };
        diagnostics: Array<{ path: string | null; code: string; severity: string }>;
      };

      expect(payload.summary).toEqual({ errorCount: 0, warningCount: 1, diagnosticCount: 1 });
      expect(payload.diagnostics).toHaveLength(1);
      expect(payload.diagnostics[0]).toMatchObject({
        code: "UNTRACKED_IMPLEMENTATION",
        severity: "warning",
        path: "apps/web/src/index.ts",
      });
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("--changed fallback to full check"),
      );

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should fallback to full check when --changed inference is unavailable", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(changedScope, "detectChangedPaths").mockReturnValue({
        ok: false,
        paths: [],
        reason: "not a git repository",
      });

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: ["[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated"],
          errors: [
            "Missing code target 'packages/core/src/main.ts' referenced by task phase-1/m1/001",
          ],
          diagnostics: [
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "apps/web/src/index.ts not associated",
              path: "apps/web/src/index.ts",
              hint: null,
            },
            {
              code: "MISSING_TASK_CODE_TARGET",
              severity: "error",
              message:
                "Missing code target 'packages/core/src/main.ts' referenced by task phase-1/m1/001",
              path: "packages/core/src/main.ts",
              hint: null,
            },
          ],
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--json", "--changed"]);

      expect(warnSpy).toHaveBeenCalledWith(
        "WARNING: --changed fallback to full check (not a git repository).",
      );

      const payload = JSON.parse(String(logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0])) as {
        summary: { errorCount: number; warningCount: number; diagnosticCount: number };
        diagnostics: Array<{ path: string | null; code: string; severity: string }>;
      };
      expect(payload.summary).toEqual({ errorCount: 1, warningCount: 1, diagnosticCount: 2 });
      expect(payload.diagnostics).toHaveLength(2);

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should filter diagnostics to a specific file with --file", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: [],
          errors: ["error-a", "error-b"],
          diagnostics: [
            {
              code: "MALFORMED_TASK_FILE",
              severity: "error",
              message:
                "Malformed task file 'roadmap/projects/shared/phases/p1/milestones/m1/tasks/planned/001-bad.md': schema failure",
              path: "roadmap/projects/shared/phases/p1/milestones/m1/tasks/planned/001-bad.md",
              hint: null,
            },
            {
              code: "MISSING_TASK_CODE_TARGET",
              severity: "error",
              message: "Missing code target 'apps/web/src/index.ts' referenced by task p1/m1/002",
              path: "apps/web/src/index.ts",
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
        "--file",
        "roadmap/projects/shared/phases/p1/milestones/m1/tasks/planned/001-bad.md",
      ]);

      const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
        summary: { errorCount: number; diagnosticCount: number };
        diagnostics: Array<{ code: string; path: string | null }>;
      };

      // Only the matching file diagnostic should remain.
      expect(payload.diagnostics).toHaveLength(1);
      expect(payload.diagnostics[0]).toMatchObject({ code: "MALFORMED_TASK_FILE" });
      expect(payload.summary.errorCount).toBe(1);

      logSpy.mockRestore();
    });

    it("should filter diagnostics to a milestone with --milestone", async () => {
      const program = new Command();
      program.exitOverride();
      registerCheckCommand(program);

      vi.spyOn(checkSdk, "checkRun").mockResolvedValue({
        success: true,
        data: {
          ok: false,
          warnings: [],
          errors: ["error-a", "error-b"],
          diagnostics: [
            {
              code: "MALFORMED_TASK_FILE",
              severity: "error",
              message:
                "Malformed task file 'roadmap/projects/shared/phases/p1/milestones/m1/tasks/planned/001-bad.md': schema failure",
              path: "roadmap/projects/shared/phases/p1/milestones/m1/tasks/planned/001-bad.md",
              hint: null,
            },
            {
              code: "MISSING_TASK_CODE_TARGET",
              severity: "error",
              message: "Missing code target ref in other milestone",
              path: "roadmap/projects/shared/phases/p1/milestones/other-milestone/tasks/planned/002-task.md",
              hint: null,
            },
          ],
        },
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "check", "--json", "--milestone", "m1"]);

      const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
        summary: { errorCount: number; diagnosticCount: number };
        diagnostics: Array<{ code: string; path: string | null }>;
      };

      // Only diagnostics in milestones/m1 should remain.
      expect(payload.diagnostics).toHaveLength(1);
      expect(payload.diagnostics[0]).toMatchObject({ code: "MALFORMED_TASK_FILE" });
      expect(payload.summary.errorCount).toBe(1);

      logSpy.mockRestore();
    });
  });
});
