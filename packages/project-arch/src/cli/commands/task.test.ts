import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerTaskCommand } from "./task";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { createTestProject, consoleAssertions, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/task", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  const phaseId = "phase-99";
  const milestoneId = "milestone-99-test";

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
    await createPhase(phaseId);
    await createMilestone(phaseId, milestoneId);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  });

  describe("registerTaskCommand", () => {
    it("should register task command with subcommands", () => {
      const program = new Command();
      registerTaskCommand(program);

      const taskCommand = program.commands.find((cmd) => cmd.name() === "task");
      expect(taskCommand).toBeDefined();

      const newCmd = taskCommand?.commands.find((cmd) => cmd.name() === "new");
      const discoverCmd = taskCommand?.commands.find((cmd) => cmd.name() === "discover");
      const ideaCmd = taskCommand?.commands.find((cmd) => cmd.name() === "idea");
      const statusCmd = taskCommand?.commands.find((cmd) => cmd.name() === "status");
      const lanesCmd = taskCommand?.commands.find((cmd) => cmd.name() === "lanes");

      expect(newCmd).toBeDefined();
      expect(discoverCmd).toBeDefined();
      expect(ideaCmd).toBeDefined();
      expect(statusCmd).toBeDefined();
      expect(lanesCmd).toBeDefined();
    });

    it("should execute enhanced help callbacks for subcommands", () => {
      const program = new Command();
      registerTaskCommand(program);

      const taskCommand = program.commands.find((cmd) => cmd.name() === "task");
      expect(taskCommand).toBeDefined();

      const subcommands = ["new", "discover", "idea", "status", "lanes"];
      for (const name of subcommands) {
        const subcommand = taskCommand?.commands.find((cmd) => cmd.name() === name);
        expect(subcommand).toBeDefined();
        const output = subcommand?.outputHelp();
        expect(output).toBeUndefined();
      }
    });
  });

  describe("task new", () => {
    it("should create new planned task", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);

      consoleAssertions.assertConsoleContains(consoleSpy, "roadmap/phases");
      consoleAssertions.assertConsoleContains(consoleSpy, phaseId);
      consoleAssertions.assertConsoleContains(consoleSpy, milestoneId);
      consoleAssertions.assertConsoleContains(consoleSpy, "001"); // First task ID

      consoleSpy.mockRestore();
    });

    it("should create multiple planned tasks with incrementing IDs", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Create first task
      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);
      consoleAssertions.assertConsoleContains(consoleSpy, "001");

      consoleSpy.mockClear();

      // Create second task
      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);
      consoleAssertions.assertConsoleContains(consoleSpy, "002");

      consoleSpy.mockRestore();
    });
  });

  describe("task discover", () => {
    it("should create discovered task linked to existing planned task", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      // Create a planned task first using the CLI
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);
      consoleSpy.mockClear();

      await program.parseAsync([
        "node",
        "test",
        "task",
        "discover",
        phaseId,
        milestoneId,
        "--from",
        "001",
      ]);

      consoleAssertions.assertConsoleContains(consoleSpy, "roadmap/phases");
      consoleAssertions.assertConsoleContains(consoleSpy, "101"); // First discovered task ID

      consoleSpy.mockRestore();
    });

    it("should validate --from parameter is 3-digit format", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "task",
        "discover",
        phaseId,
        milestoneId,
        "--from",
        "1", // Invalid: not 3 digits
      ]);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--from must be a 3-digit task id"),
      );
      expect(process.exitCode).toBe(1);

      // Reset exit code
      process.exitCode = 0;

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("should validate --from parameter format strictly", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "task",
        "discover",
        phaseId,
        milestoneId,
        "--from",
        "abc", // Invalid: not numeric
      ]);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--from must be a 3-digit task id"),
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      process.exitCode = 0;
    });

    it("should show help hint on validation error", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "task",
        "discover",
        phaseId,
        milestoneId,
        "--from",
        "99",
      ]);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Hint: Try 'pa task discover --help'"),
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      process.exitCode = 0;
    });
  });

  describe("task idea", () => {
    it("should create backlog idea task", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "task", "idea", phaseId, milestoneId]);

      consoleAssertions.assertConsoleContains(consoleSpy, "roadmap/phases");
      consoleAssertions.assertConsoleContains(consoleSpy, "901"); // First backlog task ID

      consoleSpy.mockRestore();
    });

    it("should create multiple backlog ideas with incrementing IDs", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Create first idea
      await program.parseAsync(["node", "test", "task", "idea", phaseId, milestoneId]);
      consoleAssertions.assertConsoleContains(consoleSpy, "901");

      consoleSpy.mockClear();

      // Create second idea
      await program.parseAsync(["node", "test", "task", "idea", phaseId, milestoneId]);
      consoleAssertions.assertConsoleContains(consoleSpy, "902");

      consoleSpy.mockRestore();
    });
  });

  describe("task status", () => {
    it("should get status of existing task", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      // Create a task first using CLI
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);
      consoleSpy.mockClear();

      await program.parseAsync(["node", "test", "task", "status", phaseId, milestoneId, "001"]);

      // Should output task status (default is "todo")
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(["todo", "in-progress", "blocked", "done"]).toContain(output.trim());

      consoleSpy.mockRestore();
    });
  });

  describe("task lanes", () => {
    it("should display lane usage for milestone", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "task", "lanes", phaseId, milestoneId]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");

      // Should show lane information
      expect(output).toContain("Task Lane Usage");
      expect(output).toContain(phaseId);
      expect(output).toContain(milestoneId);
      expect(output).toContain("planned");
      expect(output).toContain("discovered");
      expect(output).toContain("backlog");
      expect(output).toContain("001-099"); // Planned range
      expect(output).toContain("101-199"); // Discovered range
      expect(output).toContain("901-999"); // Backlog range

      consoleSpy.mockRestore();
    });

    it("should show used IDs and next available ID", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      // Create some tasks using CLI
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);
      await program.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);
      consoleSpy.mockClear();

      await program.parseAsync(["node", "test", "task", "lanes", phaseId, milestoneId]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");

      // Should show used IDs
      expect(output).toContain("Used:");
      expect(output).toContain("IDs:");
      expect(output).toContain("Next:");
      expect(output).toContain("001");
      expect(output).toContain("002");
      expect(output).toContain("003"); // Next available

      consoleSpy.mockRestore();
    });

    it("should show empty lanes correctly", async () => {
      const program = new Command();
      program.exitOverride();
      registerTaskCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "task", "lanes", phaseId, milestoneId]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");

      // Should show "(none)" for empty lanes
      expect(output).toContain("(none)");

      consoleSpy.mockRestore();
    });
  });
});
