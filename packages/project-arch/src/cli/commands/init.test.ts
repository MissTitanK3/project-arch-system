import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import path from "path";
import fs, { readdir } from "fs-extra";
import { registerInitCommand } from "./init";
import { createTempDir, fileAssertions, type TestProjectContext } from "../../test/helpers";
import { readMarkdownWithFrontmatter } from "../../fs";
import { initializeProject } from "../../core/init/initializeProject";

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
      expect(helpText).toContain("--force");
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
      await fileAssertions.assertFileExists(context.tempDir, ".arch/agents-of-arch/README.md");
      await fileAssertions.assertFileExists(context.tempDir, ".arch/agents-of-arch/registry.json");
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

    it("should pass --force through to re-init and overwrite managed files", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init"]);

      const policyPath = path.join(context.tempDir, "roadmap", "policy.json");
      await fs.writeFile(
        policyPath,
        `${JSON.stringify(
          {
            schemaVersion: "1.0",
            defaultProfile: "custom",
            profiles: {
              custom: {
                timing: {
                  phase: {
                    skipDoneIfCompletedContainer: false,
                  },
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      await program.parseAsync(["node", "test", "init", "--force"]);

      const policy = await fs.readJson(policyPath);
      expect(policy.defaultProfile).toBe("default");
    });
  });

  describe("bootstrap task generation (RFC-INIT-002)", () => {
    const phaseId = "phase-1";
    const milestoneId = "milestone-1-setup";
    const bootstrapDir = (tempDir: string) =>
      path.join(
        tempDir,
        "roadmap",
        "phases",
        phaseId,
        "milestones",
        milestoneId,
        "tasks",
        "planned",
      );

    let bootstrapContext: TestProjectContext;
    const originalCwd2 = process.cwd();

    beforeEach(async () => {
      bootstrapContext = await createTempDir();
      process.chdir(bootstrapContext.tempDir);
      await initializeProject({ template: "nextjs-turbo", pm: "pnpm" }, bootstrapContext.tempDir);
    });

    afterEach(async () => {
      process.chdir(originalCwd2);
      await bootstrapContext.cleanup();
    });

    it("generates task files for all 8 bootstrap tasks", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const taskFiles = files.filter((f) => f.endsWith(".md")).sort();
      expect(taskFiles).toHaveLength(8);
    });

    it("generates task 005 with slug finalize-architecture-foundation", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task005 = files.find((f) => f.startsWith("005-"));
      expect(task005).toBe("005-finalize-architecture-foundation.md");
    });

    it("generates task 006 with slug define-system-boundaries", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task006 = files.find((f) => f.startsWith("006-"));
      expect(task006).toBe("006-define-system-boundaries.md");
    });

    it("generates task 007 with slug define-module-model", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task007 = files.find((f) => f.startsWith("007-"));
      expect(task007).toBe("007-define-module-model.md");
    });

    it("generates task 008 with slug define-runtime-architecture", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task008 = files.find((f) => f.startsWith("008-"));
      expect(task008).toBe("008-define-runtime-architecture.md");
    });

    it("tasks 006, 007, and 008 include discover and greenfield tags", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      for (const slug of [
        "006-define-system-boundaries",
        "007-define-module-model",
        "008-define-runtime-architecture",
      ]) {
        const filePath = path.join(dir, `${slug}.md`);
        const result = await readMarkdownWithFrontmatter<{ tags?: string[] }>(filePath);
        expect(result.data.tags, `${slug} should have tags`).toBeDefined();
        expect(result.data.tags, `${slug} should contain discover`).toContain("discover");
        expect(result.data.tags, `${slug} should contain greenfield`).toContain("greenfield");
      }
    });

    it("task 005 dependsOn includes tasks 001 through 004 and 006 through 008", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const filePath = path.join(dir, "005-finalize-architecture-foundation.md");
      const result = await readMarkdownWithFrontmatter<{ dependsOn?: string[] }>(filePath);
      expect(result.data.dependsOn, "task 005 should have dependsOn").toBeDefined();
      const dependsOn = result.data.dependsOn ?? [];
      for (const id of ["001", "002", "003", "004", "006", "007", "008"]) {
        expect(dependsOn, `task 005 dependsOn should include ${id}`).toContain(id);
      }
    });

    it("tasks 001 through 004 do not have a dependsOn field", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      for (const id of ["001", "002", "003", "004"]) {
        const files = await readdir(dir);
        const file = files.find((f) => f.startsWith(`${id}-`));
        expect(file, `task ${id} file should exist`).toBeDefined();
        const result = await readMarkdownWithFrontmatter<{ dependsOn?: unknown }>(
          path.join(dir, file!),
        );
        const dependsOn = result.data.dependsOn;
        const isEmpty =
          dependsOn === undefined ||
          dependsOn === null ||
          (Array.isArray(dependsOn) && dependsOn.length === 0);
        expect(isEmpty, `task ${id} should not have non-empty dependsOn`).toBe(true);
      }
    });
  });
});
