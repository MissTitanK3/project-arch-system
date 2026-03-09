import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerPolicyCommand } from "./policy";
import { createTestProject, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/policy", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  let originalExitCode: string | number | null | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    context = await createTestProject(originalCwd);
  }, 45_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    await context.cleanup();
  });

  it("registers policy command with check and explain subcommands", () => {
    const program = new Command();
    registerPolicyCommand(program);

    const policyCommand = program.commands.find((cmd) => cmd.name() === "policy");
    expect(policyCommand).toBeDefined();

    const checkCommand = policyCommand?.commands.find((cmd) => cmd.name() === "check");
    const explainCommand = policyCommand?.commands.find((cmd) => cmd.name() === "explain");

    expect(checkCommand).toBeDefined();
    expect(explainCommand).toBeDefined();
  });

  it("policy check outputs deterministic JSON payload", async () => {
    const program = new Command();
    program.exitOverride();
    registerPolicyCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "policy", "check"]);

    expect(consoleSpy).toHaveBeenCalled();
    const payload = JSON.parse(String(consoleSpy.mock.calls[0][0])) as {
      ok: boolean;
      conflicts: Array<Record<string, unknown>>;
    };

    expect(typeof payload.ok).toBe("boolean");
    expect(Array.isArray(payload.conflicts)).toBe(true);

    consoleSpy.mockRestore();
  });

  it("policy explain outputs human-readable analysis", async () => {
    const program = new Command();
    program.exitOverride();
    registerPolicyCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "policy", "explain"]);

    expect(consoleSpy).toHaveBeenCalled();
    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });
});
