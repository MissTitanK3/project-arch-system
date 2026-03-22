import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerFixCommand } from "./fix";
import * as repair from "../../core/validation/frontmatterRepair";

describe("cli/commands/fix", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers fix command with frontmatter subcommand", () => {
    const program = new Command();
    registerFixCommand(program);

    const fixCommand = program.commands.find((cmd) => cmd.name() === "fix");
    expect(fixCommand).toBeDefined();
    expect(fixCommand?.commands.some((cmd) => cmd.name() === "frontmatter")).toBe(true);
  });

  it("prints dry-run diff by default", async () => {
    const program = new Command();
    program.exitOverride();
    registerFixCommand(program);

    vi.spyOn(repair, "repairFrontmatter").mockResolvedValue({
      ok: true,
      scannedFiles: 1,
      changedFiles: 1,
      appliedFiles: 0,
      manualFiles: 0,
      fileResults: [
        {
          path: "feedback/tasks/001-test.md",
          changed: true,
          applied: false,
          requiresManualIntervention: false,
          diagnostics: [],
          diff: '--- feedback/tasks/001-test.md\n+++ feedback/tasks/001-test.md\n-id: 001\n+id: "001"',
          suggestion: null,
        },
      ],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "fix", "frontmatter"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("--- feedback/tasks/001-test.md");
    expect(output).toContain("Dry-run: 1 file(s) would be updated by pa fix frontmatter");
    expect(process.exitCode).toBeUndefined();
  });

  it("reports manual intervention and exits non-zero when unresolved issues remain", async () => {
    const program = new Command();
    program.exitOverride();
    registerFixCommand(program);

    vi.spyOn(repair, "repairFrontmatter").mockResolvedValue({
      ok: false,
      scannedFiles: 1,
      changedFiles: 0,
      appliedFiles: 0,
      manualFiles: 1,
      fileResults: [
        {
          path: "feedback/tasks/001-test.md",
          changed: false,
          applied: false,
          requiresManualIntervention: true,
          diagnostics: [
            {
              code: "MISSING_REQUIRED_KEY",
              severity: "error",
              message: "Missing required key 'title'.",
              path: "feedback/tasks/001-test.md",
              line: 4,
            },
          ],
          diff: null,
          suggestion: "Run pa explain MISSING_REQUIRED_KEY for full remediation.",
        },
      ],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "fix", "frontmatter"]);

    const output = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Manual intervention required");
    expect(output).toContain("[MISSING_REQUIRED_KEY]");
    expect(process.exitCode).toBe(1);
  });
});
