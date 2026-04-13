import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { learn as learnSdk } from "../../sdk";
import { registerLearnCommand } from "./learn";

describe("cli/commands/learn", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await context.cleanup();
  });

  it("registers learn command", () => {
    const program = new Command();
    registerLearnCommand(program);

    const learnCommand = program.commands.find((cmd) => cmd.name() === "learn");
    expect(learnCommand).toBeDefined();
    expect(learnCommand?.description()).toBe(
      "Interpret path-scoped drift and suggest governed follow-up work",
    );
  });

  it("prints a human-readable learn report", async () => {
    const program = new Command();
    program.exitOverride();
    registerLearnCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "learn", "--path", "apps/web"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Scope"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Findings"));
  });

  it("prints json learn output", async () => {
    const program = new Command();
    program.exitOverride();
    registerLearnCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "learn", "--path", "apps/web", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"schemaVersion": "2.0"'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"analyzedPaths"'));
  });

  it("uses the sdk learn surface", async () => {
    const program = new Command();
    program.exitOverride();
    registerLearnCommand(program);

    const learnSpy = vi.spyOn(learnSdk, "learnPath").mockResolvedValue({
      success: true,
      data: {
        text: "Scope\n- apps/web",
        report: {
          schemaVersion: "2.0",
          timestamp: "2026-03-26T00:00:00.000Z",
          analyzedPaths: ["apps/web"],
          findings: [],
          summary: { totalGaps: 0, byCategory: {}, cleanPaths: 1 },
          suggestedCommands: [],
        },
      },
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "learn", "--path", "apps/web"]);

    expect(learnSpy).toHaveBeenCalledWith({ paths: ["apps/web"] });
    expect(consoleSpy).toHaveBeenCalledWith("Scope\n- apps/web");
  });
});
