import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { context as contextSdk } from "../../sdk";
import { registerContextCommand } from "./context";

describe("cli/commands/context", () => {
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

  it("should register context command", () => {
    const program = new Command();
    registerContextCommand(program);

    const contextCommand = program.commands.find((cmd) => cmd.name() === "context");
    expect(contextCommand).toBeDefined();
    expect(contextCommand?.description()).toBe("Resolve active repository context");
  });

  it("should include enhanced help text", () => {
    const program = new Command();
    const output: string[] = [];
    program.configureOutput({
      writeOut: (str) => output.push(str),
      writeErr: (str) => output.push(str),
    });
    registerContextCommand(program);

    const contextCommand = program.commands.find((cmd) => cmd.name() === "context");
    contextCommand?.outputHelp();
    const helpText = output.join("");

    expect(helpText).toContain("pa context");
    expect(helpText).toContain("--json");
    expect(helpText).toContain("active phase, milestone, and task");
  });

  it("should execute context and print active repository context", async () => {
    const program = new Command();
    program.exitOverride();
    registerContextCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "context"]);

    expect(consoleSpy).toHaveBeenCalledWith("phase: phase-1");
    expect(consoleSpy).toHaveBeenCalledWith("milestone: milestone-1-setup");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("task: 001-define-project-overview"),
    );
  });

  it("should support json output", async () => {
    const program = new Command();
    program.exitOverride();
    registerContextCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "context", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("\"version\": \"1.0\""));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("\"active\""));
  });

  it("should use sdk context surface", async () => {
    const program = new Command();
    program.exitOverride();
    registerContextCommand(program);

    const resolveSpy = vi.spyOn(contextSdk, "contextResolve").mockResolvedValue({
      success: true,
      data: {
        version: "1.0",
        timestamp: "2026-03-26T00:00:00.000Z",
        projectRoot: process.cwd(),
        active: {
          phase: { id: "phase-x", path: "roadmap/phases/phase-x", title: "Phase X" },
          milestone: {
            id: "milestone-x",
            path: "roadmap/phases/phase-x/milestones/milestone-x",
            title: "Milestone X",
          },
          task: {
            id: "001-demo",
            path: "roadmap/.../001-demo.md",
            title: "Demo",
            status: "todo",
            lane: "planned",
          },
        },
        recommended: {
          action: {
            status: "needs_verification",
            command: "pa report",
            reason: "verify",
            evidence: [],
          },
        },
      },
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "context"]);

    expect(resolveSpy).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith("phase: phase-x");
  });
});
