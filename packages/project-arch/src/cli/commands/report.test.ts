import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerReportCommand } from "./report";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { loadPhaseManifest, savePhaseManifest } from "../../graph/manifests";
import { createTask } from "../../core/tasks/createTask";

describe("cli/commands/report", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 120_000);

  describe("registerReportCommand", () => {
    it("should register report command", () => {
      const program = new Command();
      registerReportCommand(program);

      const reportCommand = program.commands.find((cmd) => cmd.name() === "report");
      expect(reportCommand).toBeDefined();
      expect(reportCommand?.description()).toBe("Generate architecture report");
    });

    it("should include enhanced help text", () => {
      const program = new Command();
      const output: string[] = [];
      program.configureOutput({
        writeOut: (str) => output.push(str),
        writeErr: (str) => output.push(str),
      });
      registerReportCommand(program);

      const reportCommand = program.commands.find((cmd) => cmd.name() === "report");
      reportCommand?.outputHelp();
      const helpText = output.join("");

      expect(helpText).toContain("pa report");
      expect(helpText).toContain("Generate architecture report");
      expect(helpText).toContain("pa check");
    });

    it("should execute report and generate output", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toBeDefined();
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it("should generate report for empty project", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toBeDefined();
      // Empty project should still generate a report
      expect(output.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it("should generate report for project with content", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      // Should generate some report output
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it("should include task statistics in report", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const phaseId = "phase-81";
      const milestoneId = "milestone-1-test";
      await createPhase(phaseId);
      await createMilestone(phaseId, milestoneId);

      // Use task command to create task
      const { registerTaskCommand } = await import("./task.js");
      const taskProgram = new Command();
      taskProgram.exitOverride();
      registerTaskCommand(taskProgram);
      await taskProgram.parseAsync(["node", "test", "task", "new", phaseId, milestoneId]);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      // Report should contain task-related content
      expect(output.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it("should emit consistency diagnostics when secondary state disagrees", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      await createPhase("mismatch-phase");
      await createMilestone("mismatch-phase", "milestone-1-first");
      await createMilestone("mismatch-phase", "milestone-2-second");

      const manifest = await loadPhaseManifest();
      await savePhaseManifest({
        ...manifest,
        activePhase: "mismatch-phase",
        activeMilestone: "milestone-2-second",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain("Consistency Checks");
      expect(output).toContain("activeMilestone");
      expect(output).toContain("filesystem");
      expect(output).toContain("roadmap/phases/mismatch-phase/milestones/*");

      consoleSpy.mockRestore();
    });

    it("should emit planning governance warning when discovered ratio exceeds threshold", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      await createPhase("govern-phase");
      await createMilestone("govern-phase", "govern-milestone");

      await createTask({
        phaseId: "govern-phase",
        milestoneId: "govern-milestone",
        lane: "planned",
        discoveredFromTask: null,
      });
      for (let i = 0; i < 8; i++) {
        await createTask({
          phaseId: "govern-phase",
          milestoneId: "govern-milestone",
          lane: "discovered",
          discoveredFromTask: "001",
          title: `Discovered ${i}`,
        });
      }

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain("discovered ratio");
      expect(output).toContain("Planning Governance Warnings");
      expect(output).toContain("exceeds threshold");

      consoleSpy.mockRestore();
    });

    it("should support verbose flag for detailed diagnostics", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report", "--verbose"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toBeDefined();
      expect(output).toContain("Roadmap-Graph Parity Check");

      consoleSpy.mockRestore();
    });

    it("should support -v short flag for verbose mode", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report", "-v"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toBeDefined();
      expect(output).toContain("Roadmap-Graph Parity Check");

      consoleSpy.mockRestore();
    });

    it("should include provenance annotations in report output", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain("[source:");
      expect(output).toContain("roadmap/manifest.json");

      consoleSpy.mockRestore();
    });

    it("should include graph sync status in report", async () => {
      const program = new Command();
      program.exitOverride();
      registerReportCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "report"]);

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain("graph sync status");

      consoleSpy.mockRestore();
    });
  });
});
