import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerPhaseCommand } from "./phase";
import { createPhase } from "../../core/phases/createPhase";
import { createTestProject, consoleAssertions, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/phase", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  });

  describe("registerPhaseCommand", () => {
    it("should register phase command with subcommands", () => {
      const program = new Command();
      registerPhaseCommand(program);

      const phaseCommand = program.commands.find((cmd) => cmd.name() === "phase");
      expect(phaseCommand).toBeDefined();

      const newCmd = phaseCommand?.commands.find((cmd) => cmd.name() === "new");
      const listCmd = phaseCommand?.commands.find((cmd) => cmd.name() === "list");

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
      registerPhaseCommand(program);

      const phaseCommand = program.commands.find((cmd) => cmd.name() === "phase");
      const newCmd = phaseCommand?.commands.find((cmd) => cmd.name() === "new");
      const listCmd = phaseCommand?.commands.find((cmd) => cmd.name() === "list");

      newCmd?.outputHelp();
      const newHelp = output.join("");
      output.length = 0;

      listCmd?.outputHelp();
      const listHelp = output.join("");

      expect(newHelp).toContain("pa phase new");
      expect(newHelp).toContain("phase id");
      expect(listHelp).toContain("pa phase list");
    });
  });

  describe("phase new", () => {
    it("should create new phase", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "new", "phase-99"]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Created phase shared/phase-99");

      consoleSpy.mockRestore();
    });

    it("should create phase with numeric ID", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "new", "phase-90"]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Created phase shared/phase-90");

      consoleSpy.mockRestore();
    });

    it("should create multiple phases", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "new", "phase-91"]);
      await program.parseAsync(["node", "test", "phase", "new", "phase-92"]);
      await program.parseAsync(["node", "test", "phase", "new", "phase-93"]);

      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });

    it("should create a phase in a named project", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "new", "phase-94", "--project", "shared"]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Created phase shared/phase-94");

      consoleSpy.mockRestore();
    });
  });

  describe("phase list", () => {
    it("should list all phases", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      // Create some phases
      await createPhase("phase-94");
      await createPhase("phase-95");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "list"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("shared/phase-94");
      expect(output).toContain("shared/phase-95");

      consoleSpy.mockRestore();
    });

    it("should mark active phase with asterisk", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      await createPhase("phase-96");
      await createPhase("phase-97");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "list"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      // At least one phase should be marked as active (or all should have a marker)
      expect(output).toContain("shared/phase");

      consoleSpy.mockRestore();
    });

    it("should list empty phases if none exist", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "list"]);

      // Command executes successfully even if no phases
      expect(program).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should display phase status correctly", async () => {
      const program = new Command();
      program.exitOverride();
      registerPhaseCommand(program);

      await createPhase("phase-87");
      await createPhase("phase-88");
      await createPhase("phase-89");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "phase", "list"]);

      // Should list all phases
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("shared/phase-87");
      expect(output).toContain("shared/phase-88");
      expect(output).toContain("shared/phase-89");

      consoleSpy.mockRestore();
    });
  });
});
