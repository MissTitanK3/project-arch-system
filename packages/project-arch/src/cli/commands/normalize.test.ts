import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerNormalizeCommand } from "./normalize";
import * as repair from "../../core/validation/frontmatterRepair";

describe("cli/commands/normalize", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers normalize command", () => {
    const program = new Command();
    registerNormalizeCommand(program);

    const normalizeCommand = program.commands.find((cmd) => cmd.name() === "normalize");
    expect(normalizeCommand).toBeDefined();
    expect(normalizeCommand?.description()).toBe(
      "Validate and rewrite frontmatter into canonical form",
    );
  });

  it("prints dry-run diff by default", async () => {
    const program = new Command();
    program.exitOverride();
    registerNormalizeCommand(program);

    vi.spyOn(repair, "normalizeFrontmatter").mockResolvedValue({
      ok: true,
      scannedFiles: 1,
      changedFiles: 1,
      appliedFiles: 0,
      manualFiles: 0,
      fileResults: [
        {
          path: "feedback/tasks/003-normalize.md",
          changed: true,
          applied: false,
          requiresManualIntervention: false,
          diagnostics: [],
          diff: "--- feedback/tasks/003-normalize.md\n+++ feedback/tasks/003-normalize.md\n-status: in-progress\n+status: in_progress",
          suggestion: null,
        },
      ],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "normalize"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("--- feedback/tasks/003-normalize.md");
    expect(output).toContain("Dry-run: 1 file(s) would be updated by pa normalize");
  });

  it("supports --check and exits non-zero when changes would be made", async () => {
    const program = new Command();
    program.exitOverride();
    registerNormalizeCommand(program);

    vi.spyOn(repair, "normalizeFrontmatter").mockResolvedValue({
      ok: true,
      scannedFiles: 1,
      changedFiles: 1,
      appliedFiles: 0,
      manualFiles: 0,
      fileResults: [
        {
          path: "feedback/tasks/003-normalize.md",
          changed: true,
          applied: false,
          requiresManualIntervention: false,
          diagnostics: [],
          diff: "--- feedback/tasks/003-normalize.md\n+++ feedback/tasks/003-normalize.md",
          suggestion: null,
        },
      ],
    });

    await program.parseAsync(["node", "test", "normalize", "--check"]);

    expect(process.exitCode).toBe(1);
  });
});
