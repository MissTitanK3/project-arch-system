import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerBackfillCommand } from "./backfill";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { createTask } from "../../core/tasks/createTask";
import { updateTaskStatus } from "../../core/tasks/updateTask";

describe("cli/commands/backfill", () => {
  const originalCwd = process.cwd();
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
    await createPhase("phase-99");
    await createMilestone("phase-99", "milestone-99-backfill");
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 120_000);

  it("registers backfill command with implemented subcommand", () => {
    const program = new Command();
    registerBackfillCommand(program);

    const backfillCmd = program.commands.find((command) => command.name() === "backfill");
    expect(backfillCmd).toBeDefined();

    const implementedCmd = backfillCmd?.commands.find(
      (command) => command.name() === "implemented",
    );
    expect(implementedCmd).toBeDefined();
  });

  it("prints candidate list for completed tasks missing reconciliation", async () => {
    const taskPath = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await updateTaskStatus(taskPath, "done", context.tempDir);

    const program = new Command();
    program.exitOverride();
    registerBackfillCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "backfill", "implemented"]);

    const output = consoleSpy.mock.calls.map((call) => String(call[0])).join("\n");

    expect(output).toContain("completed tasks:");
    expect(output).toContain("backfill candidates:");
    expect(output).toContain("Candidates (priority order):");
    expect(output).toContain("pa reconcile task 001");

    consoleSpy.mockRestore();
  });

  it("writes optional json artifact when --json is passed", async () => {
    const taskPath = await createTask({
      phaseId: "phase-99",
      milestoneId: "milestone-99-backfill",
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
    });

    await updateTaskStatus(taskPath, "done", context.tempDir);

    const program = new Command();
    program.exitOverride();
    registerBackfillCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "backfill", "implemented", "--json"]);

    const output = consoleSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("json artifact:");

    consoleSpy.mockRestore();
  });
});
