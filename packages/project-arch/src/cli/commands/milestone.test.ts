import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerMilestoneCommand } from "./milestone";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { createTask } from "../../core/tasks/createTask";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../utils/fs";
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
      const statusCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "status");
      const activateCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "activate");
      const completeCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "complete");

      expect(newCmd).toBeDefined();
      expect(listCmd).toBeDefined();
      expect(statusCmd).toBeDefined();
      expect(activateCmd).toBeDefined();
      expect(completeCmd).toBeDefined();
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
      const statusCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "status");
      const activateCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "activate");
      const completeCmd = milestoneCommand?.commands.find((cmd) => cmd.name() === "complete");

      newCmd?.outputHelp();
      const newHelp = output.join("");
      output.length = 0;

      listCmd?.outputHelp();
      const listHelp = output.join("");
      output.length = 0;

      statusCmd?.outputHelp();
      const statusHelp = output.join("");
      output.length = 0;

      activateCmd?.outputHelp();
      const activateHelp = output.join("");
      output.length = 0;

      completeCmd?.outputHelp();
      const completeHelp = output.join("");

      expect(newHelp).toContain("pa milestone new");
      expect(newHelp).toContain("milestoneId");
      expect(listHelp).toContain("pa milestone list");
      expect(statusHelp).toContain("pa milestone status");
      expect(activateHelp).toContain("pa milestone activate");
      expect(completeHelp).toContain("pa milestone complete");
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
      consoleAssertions.assertConsoleContains(consoleSpy, "shared");
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
      expect(output).toContain(`shared/${phaseId}/milestone-1`);
      expect(output).toContain(`shared/${phaseId}/milestone-2`);

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
      expect(output).toContain(`shared/${phase1}/m1`);
      expect(output).toContain(`shared/${phase2}/m2`);

      consoleSpy.mockRestore();
    });
  });

  describe("milestone activate", () => {
    it("should block activation with readiness diagnostics when prerequisites are missing", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-activate-blocked");

      await expect(
        program.parseAsync([
          "node",
          "test",
          "milestone",
          "activate",
          phaseId,
          "m-activate-blocked",
        ]),
      ).rejects.toThrow("at least one planned task");
    });

    it("should activate milestone when readiness prerequisites are satisfied", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-activate-ready");
      await createTask({
        phaseId,
        milestoneId: "m-activate-ready",
        lane: "planned",
        discoveredFromTask: null,
      });

      const fs = await import("fs-extra");
      const path = await import("path");
      const overviewPath = path.join(
        process.cwd(),
        "roadmap",
        "projects",
        "shared",
        "phases",
        phaseId,
        "milestones",
        "m-activate-ready",
        "overview.md",
      );
      await fs.writeFile(
        overviewPath,
        "## Success Criteria\n\n- [ ] Deliver milestone scope\n",
        "utf8",
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "milestone",
        "activate",
        phaseId,
        "m-activate-ready",
      ]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Activated milestone shared/");
      consoleAssertions.assertConsoleContains(consoleSpy, `${phaseId}/m-activate-ready`);
      consoleSpy.mockRestore();
    });
  });

  describe("milestone status", () => {
    it("should report dependency-blocked tasks with unresolved ids", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-status-dependencies");
      const taskAPath = await createTask({
        phaseId,
        milestoneId: "m-status-dependencies",
        lane: "planned",
        discoveredFromTask: null,
      });
      const taskBPath = await createTask({
        phaseId,
        milestoneId: "m-status-dependencies",
        lane: "discovered",
        discoveredFromTask: "001",
      });

      const taskA = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskAPath);
      const taskB = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskBPath);
      const dependencyId = String(taskA.data.id);

      await writeMarkdownWithFrontmatter(
        taskAPath,
        {
          ...(taskA.data as Record<string, unknown>),
          status: "todo",
        },
        taskA.content,
      );

      await writeMarkdownWithFrontmatter(
        taskBPath,
        {
          ...(taskB.data as Record<string, unknown>),
          status: "in_progress",
          dependsOn: [dependencyId],
        },
        taskB.content,
      );

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "milestone",
        "status",
        phaseId,
        "m-status-dependencies",
      ]);

      const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(output).toContain("blocked");
      expect(output).toContain(`unresolved dependencies: ${dependencyId}`);
      expect(output).toContain("Resolve prerequisite tasks and mark them done");
      expect(process.exitCode).toBe(1);

      process.exitCode = undefined;
      logSpy.mockRestore();
    });
  });

  describe("milestone complete", () => {
    it("should block completion when threshold is breached and checkpoint is missing", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-complete-blocked");
      await createTask({
        phaseId,
        milestoneId: "m-complete-blocked",
        lane: "planned",
        discoveredFromTask: null,
      });
      await createTask({
        phaseId,
        milestoneId: "m-complete-blocked",
        lane: "discovered",
        discoveredFromTask: "001",
      });

      await expect(
        program.parseAsync([
          "node",
          "test",
          "milestone",
          "complete",
          phaseId,
          "m-complete-blocked",
        ]),
      ).rejects.toThrow("replan-checkpoint.md");
    });

    it("should allow completion when checkpoint is present", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-complete-ready");
      await createTask({
        phaseId,
        milestoneId: "m-complete-ready",
        lane: "planned",
        discoveredFromTask: null,
      });
      await createTask({
        phaseId,
        milestoneId: "m-complete-ready",
        lane: "discovered",
        discoveredFromTask: "001",
      });

      const fs = await import("fs-extra");
      const path = await import("path");
      await fs.writeFile(
        path.join(
          process.cwd(),
          "roadmap",
          "projects",
          "shared",
          "phases",
          phaseId,
          "milestones",
          "m-complete-ready",
          "replan-checkpoint.md",
        ),
        "# Replan Checkpoint\n\nCaptured replanning actions.\n",
        "utf8",
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "milestone",
        "complete",
        phaseId,
        "m-complete-ready",
      ]);

      consoleAssertions.assertConsoleContains(consoleSpy, "Completed milestone");
      consoleAssertions.assertConsoleContains(consoleSpy, `${phaseId}/m-complete-ready`);
      consoleSpy.mockRestore();
    });

    it("should emit warning and continue when reconciliation is suggested", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-complete-reconcile-warning");
      await createTask({
        phaseId,
        milestoneId: "m-complete-reconcile-warning",
        lane: "planned",
        discoveredFromTask: null,
      });

      const fs = await import("fs-extra");
      const path = await import("path");
      const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
      await fs.ensureDir(reconcileDir);
      await fs.writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
        schemaVersion: "1.0",
        id: "reconcile-001-2026-03-12",
        type: "local-reconciliation",
        status: "reconciliation suggested",
        taskId: "001",
        date: "2026-03-12",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "milestone",
        "complete",
        phaseId,
        "m-complete-reconcile-warning",
      ]);

      const warnOutput = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(warnOutput).toContain("WARNING:");
      expect(warnOutput).toContain("reconciliation suggested");
      consoleAssertions.assertConsoleContains(logSpy, "Completed milestone");

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should allow forced completion with override reason and log path", async () => {
      const program = new Command();
      program.exitOverride();
      registerMilestoneCommand(program);

      await createMilestone(phaseId, "m-complete-reconcile-force");
      await createTask({
        phaseId,
        milestoneId: "m-complete-reconcile-force",
        lane: "planned",
        discoveredFromTask: null,
      });

      const fs = await import("fs-extra");
      const path = await import("path");
      const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
      await fs.ensureDir(reconcileDir);
      await fs.writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
        schemaVersion: "1.0",
        id: "reconcile-001-2026-03-12",
        type: "local-reconciliation",
        status: "reconciliation required",
        taskId: "001",
        date: "2026-03-12",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "milestone",
        "complete",
        phaseId,
        "m-complete-reconcile-force",
        "--force",
        "hotfix exception",
      ]);

      const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(output).toContain("Reconciliation override logged");
      expect(output).toContain("Completed milestone");

      const overridesPath = path.join(reconcileDir, "overrides.json");
      expect(await fs.pathExists(overridesPath)).toBe(true);

      logSpy.mockRestore();
    });
  });
});
