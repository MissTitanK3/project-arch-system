import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { runCli } from "./index";
import { createTempDir, type TestProjectContext } from "../test/helpers";

describe("cli/index", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTempDir();
    process.chdir(context.tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  });

  describe("runCli", () => {
    it("should create a program with all commands registered", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockResolvedValue({} as Command);

      await runCli(["node", "test", "--help"]);

      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("should register init command", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const initCmd = this.commands.find((cmd) => cmd.name() === "init");
        expect(initCmd).toBeDefined();
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("should register phase command", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const phaseCmd = this.commands.find((cmd) => cmd.name() === "phase");
        expect(phaseCmd).toBeDefined();
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("should register task command", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const taskCmd = this.commands.find((cmd) => cmd.name() === "task");
        expect(taskCmd).toBeDefined();
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("should register all core commands", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const commandNames = this.commands.map((cmd) => cmd.name());
        expect(commandNames).toContain("init");
        expect(commandNames).toContain("phase");
        expect(commandNames).toContain("milestone");
        expect(commandNames).toContain("task");
        expect(commandNames).toContain("decision");
        expect(commandNames).toContain("docs");
        expect(commandNames).toContain("check");
        expect(commandNames).toContain("report");
        expect(commandNames).toContain("help");
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });
  });
});
