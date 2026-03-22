import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerHelpCommand } from "./help";

describe("cli/commands/help", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("registerHelpCommand", () => {
    it("should register help command with topics subcommand", () => {
      const program = new Command();
      registerHelpCommand(program);

      const helpCommand = program.commands.find((cmd) => cmd.name() === "help");
      expect(helpCommand).toBeDefined();
      expect(helpCommand?.description()).toContain("help");
    });

    it("should accept optional topic argument", () => {
      const program = new Command();
      registerHelpCommand(program);

      const helpCommand = program.commands.find((cmd) => cmd.name() === "help");
      // Help command takes an optional [topic] argument, not a subcommand
      expect(helpCommand?.description()).toContain("help");
    });

    it("should show list of topics when no topic argument provided", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Available Commands");
      expect(output).toContain("Help Topics");
      expect(output).toContain("commands");
      expect(output).toContain("workflows");
      expect(output).toContain("lanes");
      expect(output).toContain("decisions");
      expect(output).toContain("architecture");
      expect(output).toContain("standards");
      expect(output).toContain("operations");
    });

    it('should show list of topics when topic argument is "topics"', async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "topics"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Available Commands");
      expect(output).toContain("Help Topics");
      expect(output).toContain("commands");
      expect(output).toContain("workflows");
      expect(output).toContain("operations");
    });

    it("should show commands topic content when requested", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "commands"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Available Commands");
      expect(output).toContain("pa init");
      expect(output).toContain("pa task");
      expect(output).toContain("pa decision");
    });

    it("should show workflows topic content when requested", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "workflows"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Common Workflows");
      expect(output).toContain("Feature Development");
      expect(output).toContain("pa lint frontmatter --fix");
      expect(output).toContain("pnpm lint:md");
      expect(output).toContain("pa check");
      expect(output).toContain("pa doctor");
    });

    it("should show lanes topic content when requested", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "lanes"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Task Lanes");
      expect(output).toContain("Planned");
      expect(output).toContain("Discovered");
      expect(output).toContain("Backlog");
    });

    it("should show decisions topic content when requested", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "decisions"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Architecture Decisions");
      expect(output).toContain("Decision Scopes");
    });

    it("should show architecture topic content when requested", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "architecture"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Architecture Management");
      expect(output).toContain("Repository Structure");
    });

    it("should show standards topic content when requested", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "standards"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Project Architecture Standards");
      expect(output).toContain("File Naming");
    });

    it("should show error and topic list for unknown topic", async () => {
      const program = new Command();
      program.exitOverride();
      registerHelpCommand(program);

      await program.parseAsync(["node", "test", "help", "unknown-topic"]);

      expect(consoleErrorSpy).toHaveBeenCalledWith("Unknown help topic: unknown-topic");
      expect(consoleErrorSpy).toHaveBeenCalledWith("");
      expect(consoleSpy).toHaveBeenCalled();

      const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
      expect(output).toContain("Available Commands");
      expect(output).toContain("Help Topics");
      expect(process.exitCode).toBe(1);

      // Reset exit code for other tests
      process.exitCode = 0;
    });
  });
});
