import path from "path";
import fs from "fs-extra";
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
  }, 120_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    await context.cleanup();
  });

  it("registers policy command with check, explain, resolved, and setup subcommands", () => {
    const program = new Command();
    registerPolicyCommand(program);

    const policyCommand = program.commands.find((cmd) => cmd.name() === "policy");
    expect(policyCommand).toBeDefined();

    const checkCommand = policyCommand?.commands.find((cmd) => cmd.name() === "check");
    const explainCommand = policyCommand?.commands.find((cmd) => cmd.name() === "explain");
    const resolvedCommand = policyCommand?.commands.find((cmd) => cmd.name() === "resolved");
    const setupCommand = policyCommand?.commands.find((cmd) => cmd.name() === "setup");

    expect(checkCommand).toBeDefined();
    expect(explainCommand).toBeDefined();
    expect(resolvedCommand).toBeDefined();
    expect(setupCommand).toBeDefined();
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

  it("policy resolved outputs effective policy JSON", async () => {
    const program = new Command();
    program.exitOverride();
    registerPolicyCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "policy", "resolved"]);

    expect(consoleSpy).toHaveBeenCalled();
    const payload = JSON.parse(String(consoleSpy.mock.calls[0][0])) as {
      profileName: string;
      source: string;
      policyPath: string;
      profile: Record<string, unknown>;
    };

    expect(payload.profileName.length).toBeGreaterThan(0);
    expect(["default", "file"]).toContain(payload.source);
    expect(payload.policyPath.endsWith("roadmap/policy.json")).toBe(true);
    expect(typeof payload.profile).toBe("object");

    consoleSpy.mockRestore();
  });

  it("policy setup creates policy when missing and reports created false on rerun", async () => {
    const policyPath = path.join(context.tempDir, "roadmap", "policy.json");
    await fs.remove(policyPath);

    const program = new Command();
    program.exitOverride();
    registerPolicyCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "policy", "setup"]);
    expect(consoleSpy).toHaveBeenCalled();
    const firstPayload = JSON.parse(String(consoleSpy.mock.calls[0][0])) as { created: boolean };
    expect(firstPayload.created).toBe(true);
    expect(await fs.pathExists(policyPath)).toBe(true);

    consoleSpy.mockClear();

    await program.parseAsync(["node", "test", "policy", "setup"]);
    const secondPayload = JSON.parse(String(consoleSpy.mock.calls[0][0])) as { created: boolean };
    expect(secondPayload.created).toBe(false);

    consoleSpy.mockRestore();
  });
});
