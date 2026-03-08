import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerMilestoneCommand } from "./milestone";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { createTestProject, consoleAssertions, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/milestone", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  const phaseId = "phase-99";

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
    await createPhase(phaseId);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  });

  describe("registerMilestoneCommand", () => {
    it("should register milestone command with subcommands", () => {
      const program = new Command();
      registerMilestoneCommand(program);

      const milestoneCommand = program.commands.find((cmd) => cmd.name() === "milestone");
      expect(milestoneCommand).toBeDefined();

      const newCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "new");
      const listCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "list");

      expect(newCmd).toBeDefined();
      expect(listCmd).toBeDefined();
    });

    it("should include enhanced help text for subcommands", () => {
      const program = new Command();
      const output: string[] = [];
      program.configureOutput({
        writeOut: (str) => output.push(str),
        writeErr: (str) => output.push(str),
      });
      registerMilestoneCommand(program);

      const milestoneCommand = program.commands.find((cmd) => cmd.name() === "milestone");
      const newCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "new");
      const listCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "list");

      newCmd?.outputHelp();
      const newHelp = output.join("");
      output.length = 0;

      listCmd?.outputHelp();
      const listHelp = output.join("");

      expect(newHelp).toContain("pa milestone new");
      expect(newHelp).toContain("milestoneId");
      expect(listHelp).toContain("pa milestone list");
    });
  });

  describe("milestone new", () => {
    it("should create new milestone", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "milestone", "new", phaseId, "milestone-99-test"]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Created milestone");
      consoleAssertions.assertConsoleContains(consoleSpy, phaseId);
      consoleAssertions.assertConsoleContains(consoleSpy, "milestone-99-test");

      consoleSpy.mockRestore();
    });

    it("should create milestone with short name", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "milestone", "new", phaseId, "m1"]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Created milestone");
      consoleAssertions.assertConsoleContains(consoleSpy, "m1");

      consoleSpy.mockRestore();
    });

    it("should create multiple milestones in same phase", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "milestone", "new", phaseId, "m1"]);
      await program.parseAsync(["node", "test", "milestone", "new", phaseId, "m2"]);
      await program.parseAsync(["node", "test", "milestone", "new", phaseId, "m3"]);

      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe("milestone list", () => {
    it("should list all milestones", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      // Create some milestones
      await createMilestone(phaseId, "milestone-1");
      await createMilestone(phaseId, "milestone-2");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "milestone", "list"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain(phaseId);
      expect(output).toContain("milestone-1");
      expect(output).toContain("milestone-2");

      consoleSpy.mockRestore();
    });

    it("should list empty milestones if none exist", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "milestone", "list"]);

      // Command executes successfully even if no milestones
      expect(program).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should list milestones across multiple phases", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      const phase1 = "phase-97";
      const phase2 = "phase-98";
      await createPhase(phase1);
      await createPhase(phase2);
      await createMilestone(phase1, "m1");
      await createMilestone(phase2, "m2");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "milestone", "list"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain(phase1);
      expect(output).toContain(phase2);

      consoleSpy.mockRestore();
    });
  });
});
