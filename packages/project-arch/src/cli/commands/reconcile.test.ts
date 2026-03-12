import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { pathExists } from "fs-extra";
import { Command } from "commander";
import { registerReconcileCommand } from "./reconcile";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { createTask } from "../../core/tasks/createTask";

describe("cli/commands/reconcile", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  const phaseId = "phase-99";
  const milestoneId = "milestone-99-reconcile";

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
    await createPhase(phaseId);
    await createMilestone(phaseId, milestoneId);
  }, 60_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 60_000);

  describe("registerReconcileCommand", () => {
    it("should register reconcile command with task subcommand", () => {
      const program = new Command();
      registerReconcileCommand(program);

      const reconcileCmd = program.commands.find((c) => c.name() === "reconcile");
      expect(reconcileCmd).toBeDefined();
      expect(reconcileCmd?.description()).toBe("Run reconciliation workflows");

      const taskSubCmd = reconcileCmd?.commands.find((c) => c.name() === "task");
      expect(taskSubCmd).toBeDefined();
    });

    it("should display help for reconcile task subcommand", () => {
      const program = new Command();
      const output: string[] = [];
      program.configureOutput({
        writeOut: (str) => output.push(str),
        writeErr: (str) => output.push(str),
      });
      registerReconcileCommand(program);

      const reconcileCmd = program.commands.find((c) => c.name() === "reconcile");
      const taskSubCmd = reconcileCmd?.commands.find((c) => c.name() === "task");
      taskSubCmd?.outputHelp();
      const helpText = output.join("");

      expect(helpText).toContain("pa reconcile task");
      expect(helpText).toContain("pa check");
    });
  });

  describe("pa reconcile task", () => {
    it("should run reconcile for a task with no code targets and write report files", async () => {
      await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        discoveredFromTask: null,
        cwd: context.tempDir,
      });

      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "reconcile", "task", "001"]);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("status:");
      expect(output).toContain("json report:");
      expect(output).toContain("markdown report:");

      consoleSpy.mockRestore();
    }, 30_000);

    it("should write JSON and Markdown report files to .project-arch/reconcile/", async () => {
      await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        discoveredFromTask: null,
        cwd: context.tempDir,
      });

      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync(["node", "test", "reconcile", "task", "001"]);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      consoleSpy.mockRestore();

      const jsonLine = output.split("\n").find((l) => l.includes("json report:"));
      const mdLine = output.split("\n").find((l) => l.includes("markdown report:"));

      expect(jsonLine).toBeDefined();
      expect(mdLine).toBeDefined();

      const jsonRelPath = jsonLine!.split("json report:")[1]!.trim();
      const mdRelPath = mdLine!.split("markdown report:")[1]!.trim();

      const jsonAbs = path.join(context.tempDir, jsonRelPath);
      const mdAbs = path.join(context.tempDir, mdRelPath);

      expect(await pathExists(jsonAbs)).toBe(true);
      expect(await pathExists(mdAbs)).toBe(true);
    }, 30_000);

    it("should output reconciliation required status when architecture/ is in codeTargets", async () => {
      await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        discoveredFromTask: null,
        cwd: context.tempDir,
      });

      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync([
        "node",
        "test",
        "reconcile",
        "task",
        "001",
        "--files",
        "architecture/workflows/implementation-reconciliation.md",
      ]);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      consoleSpy.mockRestore();

      expect(output).toContain("reconciliation required");
    }, 30_000);

    it("should output 'no reconciliation needed' for a task with no triggers", async () => {
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        discoveredFromTask: null,
        cwd: context.tempDir,
      });

      // Patch codeTargets to a non-triggering path
      const { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } =
        await import("../../fs/index.js");
      const { data, content } =
        await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
      (data as Record<string, unknown>).codeTargets = ["apps/web/src/components/Button.tsx"];
      (data as Record<string, unknown>).evidence = ["Button renders correctly."];
      await writeMarkdownWithFrontmatter(taskPath, data as Record<string, unknown>, content);

      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync(["node", "test", "reconcile", "task", "001"]);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      consoleSpy.mockRestore();

      expect(output).toContain("no reconciliation needed");
    }, 30_000);

    it("should throw when task ID is not found", async () => {
      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      await expect(
        program.parseAsync(["node", "test", "reconcile", "task", "099"]),
      ).rejects.toThrow(/not found/i);
    }, 30_000);
  });
});
