import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import path from "path";
import fs, { readdir } from "fs-extra";
import { registerInitCommand } from "./init";
import { createTempDir, fileAssertions, type TestProjectContext } from "../../test/helpers";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
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
      expect(helpText).toContain("--with-workflows");
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
        "--pm",
        "pnpm",
        "--with-ai",
      ]);

      await fileAssertions.assertFileExists(context.tempDir, "roadmap");
      await fileAssertions.assertFileExists(context.tempDir, "architecture");
      await fileAssertions.assertFileExists(context.tempDir, "arch-domains");
      await fileAssertions.assertFileExists(context.tempDir, "arch-model");
    });

    it("should not create legacy apps directory", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init"]);

      expect(await fs.pathExists(path.join(context.tempDir, "apps"))).toBe(false);
    });

    it("should execute init with workflow materialization enabled", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--with-workflows"]);

      await fileAssertions.assertFileExists(context.tempDir, ".github/workflows/before-coding.md");
      await fileAssertions.assertFileExists(context.tempDir, ".github/workflows/after-coding.md");
      await fileAssertions.assertFileExists(context.tempDir, ".github/workflows/complete-task.md");
      await fileAssertions.assertFileExists(context.tempDir, ".github/workflows/new-module.md");
      await fileAssertions.assertFileExists(context.tempDir, ".github/workflows/diagnose.md");
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

    it("should pass --force through to workflow regeneration and overwrite generated workflow files", async () => {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);

      await program.parseAsync(["node", "test", "init", "--with-workflows"]);

      const workflowPath = path.join(context.tempDir, ".github", "workflows", "before-coding.md");
      await fs.writeFile(workflowPath, "# Custom Before Coding Workflow\n", "utf8");

      await program.parseAsync(["node", "test", "init", "--with-workflows", "--force"]);

      const workflowContent = await fs.readFile(workflowPath, "utf8");
      expect(workflowContent).toContain("# Before Coding Workflow");
      expect(workflowContent).not.toContain("# Custom Before Coding Workflow");
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

    it("generates task 005 with slug define-system-boundaries", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task005 = files.find((f) => f.startsWith("005-"));
      expect(task005).toBe("005-define-system-boundaries.md");
    });

    it("generates task 006 with slug define-module-model", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task006 = files.find((f) => f.startsWith("006-"));
      expect(task006).toBe("006-define-module-model.md");
    });

    it("generates task 007 with slug define-runtime-architecture", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task007 = files.find((f) => f.startsWith("007-"));
      expect(task007).toBe("007-define-runtime-architecture.md");
    });

    it("generates task 008 with slug finalize-architecture-foundation", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const files = await readdir(dir);
      const task008 = files.find((f) => f.startsWith("008-"));
      expect(task008).toBe("008-finalize-architecture-foundation.md");
    });

    it("tasks 005, 006, and 007 include discover and greenfield tags", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      for (const slug of [
        "005-define-system-boundaries",
        "006-define-module-model",
        "007-define-runtime-architecture",
      ]) {
        const filePath = path.join(dir, `${slug}.md`);
        const result = await readMarkdownWithFrontmatter<{ tags?: string[] }>(filePath);
        expect(result.data.tags, `${slug} should have tags`).toBeDefined();
        expect(result.data.tags, `${slug} should contain discover`).toContain("discover");
        expect(result.data.tags, `${slug} should contain greenfield`).toContain("greenfield");
      }
    });

    it("task 008 dependsOn includes tasks 001 through 007", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const filePath = path.join(dir, "008-finalize-architecture-foundation.md");
      const result = await readMarkdownWithFrontmatter<{ dependsOn?: string[] }>(filePath);
      expect(result.data.dependsOn, "task 008 should have dependsOn").toBeDefined();
      const dependsOn = result.data.dependsOn ?? [];
      for (const id of ["001", "002", "003", "004", "005", "006", "007"]) {
        expect(dependsOn, `task 008 dependsOn should include ${id}`).toContain(id);
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

    it("bootstrap tasks reference canonical taxonomy paths", async () => {
      const dir = bootstrapDir(bootstrapContext.tempDir);
      const checks: Array<[string, string[]]> = [
        [
          "001-define-project-overview.md",
          ["architecture/product-framing/prompt.md", "architecture/product-framing/project-overview.md"],
        ],
        [
          "008-finalize-architecture-foundation.md",
          [
            "architecture/product-framing/prompt.md",
            "systems/system-boundaries.md",
            "governance/module-model.md",
            "runtime/runtime-architecture.md",
          ],
        ],
        [
          "005-define-system-boundaries.md",
          ["architecture/systems/system-boundaries.md", "architecture/product-framing/prompt.md"],
        ],
        [
          "006-define-module-model.md",
          ["architecture/governance/module-model.md", "Read architecture/product-framing docs"],
        ],
        [
          "007-define-runtime-architecture.md",
          ["architecture/runtime/runtime-architecture.md", "architecture/product-framing/user-journey.md"],
        ],
      ];

      for (const [fileName, expectedSnippets] of checks) {
        const content = await fs.readFile(path.join(dir, fileName), "utf8");
        for (const snippet of expectedSnippets) {
          expect(content, `${fileName} should contain ${snippet}`).toContain(snippet);
        }
      }
    });
  });

  describe("root sandbox init scripts", () => {
    it("defines tier-specific sandbox init commands in package.json", async () => {
      const repoRoot = path.resolve(originalCwd, "..", "..");
      const packageJsonPath = path.join(repoRoot, "package.json");
      const helperScriptPath = path.join(repoRoot, "scripts", "sandbox-init.mjs");
      const packageJson = await fs.readJson(packageJsonPath);
      const helperScript = await fs.readFile(helperScriptPath, "utf8");

      expect(await fs.pathExists(helperScriptPath)).toBe(true);
      expect(packageJson.scripts["sandbox:init"]).toBe("node scripts/sandbox-init.mjs default");
      expect(packageJson.scripts["sandbox:init:default"]).toBe(
        "node scripts/sandbox-init.mjs default",
      );
      expect(packageJson.scripts["sandbox:init:full"]).toBe("node scripts/sandbox-init.mjs full");
      expect(packageJson.scripts["sandbox:init:tier-a"]).toBe(
        "node scripts/sandbox-init.mjs tier-a",
      );
      expect(packageJson.scripts["sandbox:init:tier-b"]).toBe(
        "node scripts/sandbox-init.mjs tier-b",
      );
      expect(packageJson.scripts["sandbox:init:tier-c"]).toBe(
        "node scripts/sandbox-init.mjs tier-c",
      );
      expect(packageJson.scripts["sandbox:init:tier-d"]).toBe(
        "node scripts/sandbox-init.mjs tier-d",
      );
      expect(packageJson.scripts["sandbox:smoke"]).toBe("node scripts/sandbox-init.mjs smoke");
      expect(helperScript).toContain('const currentLink = path.join(sandboxRoot, "current");');
      expect(helperScript).toContain("const profileLink = path.join(sandboxRoot, profile);");
      expect(helperScript).toContain("fs.symlinkSync(sandboxDir, currentLink);");
      expect(helperScript).toContain("fs.symlinkSync(sandboxDir, profileLink);");
    });
  });
});
