import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { Command } from "commander";
import { registerExplainCommand } from "./explain";
import { getDiagnosticExplanation } from "../../core/diagnostics/explanations.js";

describe("cli/commands/explain", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("should register explain command", () => {
    const program = new Command();
    registerExplainCommand(program);

    const explainCommand = program.commands.find((cmd) => cmd.name() === "explain");
    expect(explainCommand).toBeDefined();
    expect(explainCommand?.description()).toBe(
      "Print a detailed explanation and remediation hint for a diagnostic code",
    );
  });

  it("should print description and remediation for a known code", async () => {
    const program = new Command();
    program.exitOverride();
    registerExplainCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "explain", "MALFORMED_TASK_FILE"]);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("[MALFORMED_TASK_FILE]");
    expect(output).toContain("Description:");
    expect(output).toContain("Remediation:");
    expect(process.exitCode).toBeUndefined();

    logSpy.mockRestore();
  });

  it("should accept a lowercase code and normalise it", async () => {
    const program = new Command();
    program.exitOverride();
    registerExplainCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "explain", "tab_indentation"]);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("[TAB_INDENTATION]");
    expect(output).toContain("Description:");
    expect(output).toContain("Remediation:");

    logSpy.mockRestore();
  });

  it("should print an error and list known codes for an unknown code", async () => {
    const program = new Command();
    program.exitOverride();
    registerExplainCommand(program);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "explain", "TOTALLY_UNKNOWN_CODE"]);

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Unknown diagnostic code: TOTALLY_UNKNOWN_CODE");
    expect(output).toContain("Known codes:");
    expect(output).toContain("MALFORMED_TASK_FILE");
    expect(process.exitCode).toBe(1);

    errorSpy.mockRestore();
  });

  it("should cover all documented diagnostic codes from check and lint", async () => {
    // Smoke-test a representative sample of codes from across the codebase.
    const importantCodes = [
      "DUPLICATE_TASK_ID",
      "MISSING_TASK_CODE_TARGET",
      "MISSING_TASK_PUBLIC_DOC",
      "TASK_UNDECLARED_MODULE",
      "TASK_NON_MODULE_CODE_TARGET",
      "TASK_UNDECLARED_DOMAIN",
      "MISSING_DECISION_CODE_TARGET",
      "INVALID_DECISION_TASK_LINK",
      "MISSING_LINKED_TASK",
      "MISSING_SUPERSEDED_DECISION",
      "PROJECT_DECISION_INDEX_MISSING_ENTRY",
      "PHASE_DECISION_INDEX_MISSING_ENTRY",
      "MILESTONE_DECISION_INDEX_MISSING_ENTRY",
      "MISSING_LANE_DIRECTORY",
      "MISSING_GRAPH_ARTIFACT",
      "GRAPH_PARITY_MISMATCH",
      "INVALID_CONCEPT_MAP_SCHEMA",
      "INVALID_RECONCILE_CONFIG_SCHEMA",
      "MALFORMED_TASK_FILE",
      "FRONTMATTER_MISSING",
      "TAB_INDENTATION",
      "TRAILING_WHITESPACE",
      "MISSING_REQUIRED_KEY",
      "SCALAR_SAFETY",
      "YAML_PARSE_ERROR",
      "YAML_PARSE_WARNING",
      "SCHEMA_TYPE",
      "KEY_TYPE",
      "UNTRACKED_IMPLEMENTATION",
      "OUTSTANDING_TOOLING_FEEDBACK",
      "CHECK_ERROR",
      "CHECK_WARNING",
      "PAH001",
      "PAH002",
      "PAH003",
      "PAH004",
      "PAH005",
      "PAH006",
      "PAH007",
      "PAH008",
      "PAH009",
      "PAH010",
      "PAH011",
      "PAH012",
      "PAC_TARGET_UNCOVERED",
      "PAC_TASK_MISSING_OBJECTIVE_TRACE",
      "PAV_CONTRACT_MISSING",
      "PAV_CONTRACT_INVALID_SCHEMA",
      "PAS_SKILL_INVALID_MANIFEST",
      "PAS_SKILL_MISSING_MANIFEST",
      "PAS_SKILL_DUPLICATE_SOURCE_ID",
      "PAS_SKILL_OVERRIDE_REQUIRED",
      "PAS_SKILL_MISSING_SYSTEM_FILE",
      "PAS_SKILL_MISSING_CHECKLIST_FILE",
    ];

    for (const code of importantCodes) {
      const explanation = getDiagnosticExplanation(code);
      expect(explanation, `Missing explanation for code: ${code}`).toBeDefined();
      expect(explanation?.description.length, `Empty description for ${code}`).toBeGreaterThan(0);
      expect(explanation?.remediation.length, `Empty remediation for ${code}`).toBeGreaterThan(0);
    }
  });
});
