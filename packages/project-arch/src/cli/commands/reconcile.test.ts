import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
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
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 120_000);

  describe("registerReconcileCommand", () => {
    it("should register reconcile command with task subcommand", () => {
      const program = new Command();
      registerReconcileCommand(program);

      const reconcileCmd = program.commands.find((c) => c.name() === "reconcile");
      expect(reconcileCmd).toBeDefined();
      expect(reconcileCmd?.description()).toBe("Run reconciliation workflows");

      const taskSubCmd = reconcileCmd?.commands.find((c) => c.name() === "task");
      const pruneSubCmd = reconcileCmd?.commands.find((c) => c.name() === "prune");
      const compactSubCmd = reconcileCmd?.commands.find((c) => c.name() === "compact");
      expect(taskSubCmd).toBeDefined();
      expect(pruneSubCmd).toBeDefined();
      expect(compactSubCmd).toBeDefined();
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

    it("should support pa reconcile --latest", async () => {
      const reconcileDir = path.join(context.tempDir, ".project-arch", "reconcile");
      await fs.ensureDir(reconcileDir);

      await fs.writeJson(path.join(reconcileDir, "001-2026-03-20.json"), {
        schemaVersion: "1.0",
        id: "reconcile-001-2026-03-20",
        type: "local-reconciliation",
        status: "reconciliation suggested",
        taskId: "001",
        date: "2026-03-20",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });
      await fs.writeJson(path.join(reconcileDir, "001-2026-03-22.json"), {
        schemaVersion: "1.0",
        id: "reconcile-001-2026-03-22",
        type: "local-reconciliation",
        status: "reconciliation complete",
        taskId: "001",
        date: "2026-03-22",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });

      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await program.parseAsync(["node", "test", "reconcile", "--latest"]);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      consoleSpy.mockRestore();

      expect(output).toContain("latest records: 1");
      expect(output).toContain("001-2026-03-22.json");
    });

    it("should keep files intact on pa reconcile prune dry-run", async () => {
      const reconcileDir = path.join(context.tempDir, ".project-arch", "reconcile");
      await fs.ensureDir(reconcileDir);

      await fs.writeJson(path.join(reconcileDir, "001-2026-03-20.json"), {
        schemaVersion: "1.0",
        id: "reconcile-001-2026-03-20",
        type: "local-reconciliation",
        status: "reconciliation suggested",
        taskId: "001",
        date: "2026-03-20",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });
      await fs.writeFile(path.join(reconcileDir, "001-2026-03-20.md"), "# old");
      await fs.writeJson(path.join(reconcileDir, "001-2026-03-22.json"), {
        schemaVersion: "1.0",
        id: "reconcile-001-2026-03-22",
        type: "local-reconciliation",
        status: "reconciliation complete",
        taskId: "001",
        date: "2026-03-22",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });

      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      await program.parseAsync(["node", "test", "reconcile", "prune"]);

      expect(await fs.pathExists(path.join(reconcileDir, "001-2026-03-20.json"))).toBe(true);
      expect(await fs.pathExists(path.join(reconcileDir, "001-2026-03-20.md"))).toBe(true);
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
    }, 120_000);

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

      expect(await fs.pathExists(jsonAbs)).toBe(true);
      expect(await fs.pathExists(mdAbs)).toBe(true);
    }, 120_000);

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
    }, 120_000);

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
    }, 120_000);

    it("should throw when task ID is not found", async () => {
      const program = new Command();
      program.exitOverride();
      registerReconcileCommand(program);

      await expect(
        program.parseAsync(["node", "test", "reconcile", "task", "099"]),
      ).rejects.toThrow(/not found/i);
    }, 120_000);
  });
});
