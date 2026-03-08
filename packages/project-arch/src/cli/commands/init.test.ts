import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerInitCommand } from "./init";
import { createTempDir, fileAssertions, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/init", () => {
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

  describe("registerInitCommand", () => {
    it("should register init command with default options", async () => {
      const program = new Command();
      registerInitCommand(program);

      const initCommand = program.commands.find((cmd) => cmd.name() === "init");
      expect(initCommand).toBeDefined();
      expect(initCommand?.description()).toBe("Create base repository structure");
    });

    it("should include enhanced help text", () => {
      const program = new Command();
      const output: string[] = [];
      program.configureOutput({
        writeOut: (str) => output.push(str),
        writeErr: (str) => output.push(str),
      });
      registerInitCommand(program);

      const initCommand = program.commands.find((cmd) => cmd.name() === "init");
      initCommand?.outputHelp();
      const helpText = output.join("");

      expect(helpText).toContain("pa init");
      expect(helpText).toContain("nextjs-turbo");
      expect(helpText).toContain("--with-ai");
    });

    it("should execute init with default options", async () => {
      const program = new Command();
      program.exitOverride(); // Prevent process.exit during tests
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init"]);

      // Verify core directories were created
      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
      await fileAssertions.assertFileExists(context.tempDir, "architecture");
      await fileAssertions.assertFileExists(context.tempDir, "arch-domains");
      await fileAssertions.assertFileExists(context.tempDir, "arch-model");
    });

    it("should execute init with custom template option", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--template", "nextjs-turbo"]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
    });

    it("should execute init with custom apps option", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--apps", "web,admin,mobile"]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
      await fileAssertions.assertFileExists(context.tempDir, "architecture");
    });

    it("should execute init with custom package manager", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--pm", "pnpm"]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
    });

    it("should execute init with AI features", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--with-ai"]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
      // AI directory should be created
    });

    it("should execute init with docs site disabled", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--with-docs-site", "false"]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
    });

    it("should execute init with all custom options", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync([
        "node",
        "test",
        "init",
        "--template",
        "nextjs-turbo",
        "--apps",
        "web,api",
        "--pm",
        "pnpm",
        "--with-ai",
      ]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
      await fileAssertions.assertFileExists(context.tempDir, "architecture");
      await fileAssertions.assertFileExists(context.tempDir, "arch-domains");
      await fileAssertions.assertFileExists(context.tempDir, "arch-model");
    });
  });
});
