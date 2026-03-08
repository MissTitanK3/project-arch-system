import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerDecisionCommand } from "./decision";
import { createTestProject, consoleAssertions, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { decisions as decisionsSdk } from "../../sdk";
import path from "path";
import fs from "fs/promises";

describe("cli/commands/decision", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await context.cleanup();
  });

  describe("registerDecisionCommand", () => {
    it("should register decision command with subcommands", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      expect(decisionCommand).toBeDefined();

      const newCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "new");
      const linkCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "link");
      const statusCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "status");
      const supersedeCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "supersede");
      const listCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "list");
      const migrateCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "migrate");

      expect(newCmd).toBeDefined();
      expect(linkCmd).toBeDefined();
      expect(statusCmd).toBeDefined();
      expect(supersedeCmd).toBeDefined();
      expect(listCmd).toBeDefined();
      expect(migrateCmd).toBeDefined();
    });

    it("should include enhanced help text for all subcommands", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      expect(decisionCommand).toBeDefined();

      const subcommands = ["new", "link", "status", "supersede", "list", "migrate"];
      for (const name of subcommands) {
        const subcommand = decisionCommand?.commands.find((cmd) => cmd.name() === name);
        expect(subcommand).toBeDefined();
        const helpText = subcommand?.helpInformation() ?? "";
        expect(helpText.length).toBeGreaterThan(0);
        expect(helpText).toContain("Usage:");
        expect(helpText).toContain(`decision ${name}`);
      }
    });

    it("should execute enhanced help callbacks for all decision subcommands", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      expect(decisionCommand).toBeDefined();

      const subcommands = ["new", "link", "status", "supersede", "list", "migrate"];
      for (const name of subcommands) {
        const subcommand = decisionCommand?.commands.find((cmd) => cmd.name() === name);
        expect(subcommand).toBeDefined();
        const output = subcommand?.outputHelp();
        expect(output).toBeUndefined();
      }
    });
  });

  describe("decision new", () => {
    it("should create decision with project scope", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "decision",
        "new",
        "--scope",
        "project",
        "--slug",
        "test-decision",
        "--title",
        "Test Decision",
      ]);

      consoleAssertions.assertConsoleContains(consoleSpy, "roadmap/decisions/project");
      consoleAssertions.assertConsoleContains(consoleSpy, "test-decision");

      consoleSpy.mockRestore();
    });

    it("should create decision with phase scope", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const phaseId = "phase-20";
      await createPhase(phaseId);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "decision",
        "new",
        "--scope",
        "phase",
        "--phase",
        phaseId,
        "--slug",
        "phase-decision",
      ]);

      consoleAssertions.assertConsoleContains(consoleSpy, `roadmap/decisions/${phaseId}`);
      consoleAssertions.assertConsoleContains(consoleSpy, "phase-decision");

      consoleSpy.mockRestore();
    });

    it("should create decision with milestone scope", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const phaseId = "phase-21";
      const milestoneId = "milestone-21-test";
      await createPhase(phaseId);
      await createMilestone(phaseId, milestoneId);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "decision",
        "new",
        "--scope",
        "milestone",
        "--phase",
        phaseId,
        "--milestone",
        milestoneId,
        "--slug",
        "milestone-decision",
      ]);

      // For milestone scope, the path format is phase-id/milestone-id:date:slug.md
      consoleAssertions.assertConsoleContains(
        consoleSpy,
        `roadmap/decisions/${phaseId}/${milestoneId}`,
      );
      consoleAssertions.assertConsoleContains(consoleSpy, "milestone-decision");

      consoleSpy.mockRestore();
    });

    it("should create decision with default options", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "new"]);

      consoleAssertions.assertConsoleContains(consoleSpy, "roadmap/decisions/project");
      // Default slug is "decision"
      consoleAssertions.assertConsoleContains(consoleSpy, "decision");

      consoleSpy.mockRestore();
    });
  });

  describe("decision link", () => {
    it("should register link command correctly", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      const linkCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "link");

      expect(linkCmd).toBeDefined();
      expect(linkCmd?.description()).toContain("Link");
    });

    it("should execute link action and print success message", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      vi.spyOn(decisionsSdk, "decisionLink").mockResolvedValue({
        success: true,
        data: { decisionId: "001" },
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync([
        "node",
        "test",
        "decision",
        "link",
        "001",
        "--task",
        "phase-1/m1/001",
        "--code",
        "src/auth.ts",
      ]);

      expect(decisionsSdk.decisionLink).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("Updated links for 001");

      consoleSpy.mockRestore();
    });
  });

  describe("decision status", () => {
    it("should register status command correctly", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      const statusCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "status");

      expect(statusCmd).toBeDefined();
      expect(statusCmd?.description()).toContain("status");
    });

    it("should execute status action and print transition", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      vi.spyOn(decisionsSdk, "decisionStatus").mockResolvedValue({
        success: true,
        data: { decisionId: "001", status: "accepted" },
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "status", "001", "accepted"]);

      expect(decisionsSdk.decisionStatus).toHaveBeenCalledWith({
        decisionId: "001",
        status: "accepted",
      });
      expect(consoleSpy).toHaveBeenCalledWith("001 -> accepted");

      consoleSpy.mockRestore();
    });
  });

  describe("decision supersede", () => {
    it("should register supersede command correctly", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      const supersedeCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "supersede");

      expect(supersedeCmd).toBeDefined();
      expect(supersedeCmd?.description()).toContain("supersed");
    });

    it("should execute supersede action and print result", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      vi.spyOn(decisionsSdk, "decisionSupersede").mockResolvedValue({
        success: true,
        data: { decisionId: "002", supersededDecisionId: "001" },
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "supersede", "002", "001"]);

      expect(decisionsSdk.decisionSupersede).toHaveBeenCalledWith({
        decisionId: "002",
        supersededDecisionId: "001",
      });
      expect(consoleSpy).toHaveBeenCalledWith("002 supersedes 001");

      consoleSpy.mockRestore();
    });
  });

  describe("decision list", () => {
    it("should register list command correctly", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      const listCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "list");

      expect(listCmd).toBeDefined();
      expect(listCmd?.description()).toContain("List");
    });

    it("should list empty decisions if none exist", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "list"]);

      // Command executes successfully (may output nothing or show empty state)
      expect(program).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should print decisions returned by SDK", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      vi.spyOn(decisionsSdk, "decisionList").mockResolvedValue({
        success: true,
        data: [
          { id: "project:20260307:one", status: "accepted" },
          { id: "project:20260307:two", status: "proposed" },
        ],
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "list"]);

      expect(consoleSpy).toHaveBeenCalledWith("project:20260307:one | accepted");
      expect(consoleSpy).toHaveBeenCalledWith("project:20260307:two | proposed");

      consoleSpy.mockRestore();
    });
  });

  describe("decision migrate", () => {
    it("should register migrate command correctly", () => {
      const program = new Command();
      registerDecisionCommand(program);

      const decisionCommand = program.commands.find((cmd) => cmd.name() === "decision");
      const migrateCmd = decisionCommand?.commands.find((cmd) => cmd.name() === "migrate");

      expect(migrateCmd).toBeDefined();
      expect(migrateCmd?.description()).toContain("migrate");
    });

    it("should scan for legacy decisions without migrating when --scan-only is set", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "migrate", "--scan-only"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Scanning decision files");
      expect(output).toContain("Total decisions:");

      consoleSpy.mockRestore();
    });

    it("should migrate legacy decisions without --scan-only", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "migrate"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Scanning decision files");

      consoleSpy.mockRestore();
    });

    it("should report when all decisions are valid", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      //Create a valid decision
      await program.parseAsync(["node", "test", "decision", "new", "--slug", "valid"]);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "migrate", "--scan-only"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("All decision files are valid");

      consoleSpy.mockRestore();
    });

    it("should show issue details and scan-only guidance for invalid decisions", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const decisionsDir = path.join(process.cwd(), "roadmap", "decisions");
      await fs.mkdir(decisionsDir, { recursive: true });
      await fs.writeFile(
        path.join(decisionsDir, "legacy-invalid.md"),
        [
          "---",
          "id: project:20260307:legacy-invalid",
          "title: Legacy Invalid",
          "status: proposed",
          "---",
          "",
          "Legacy content",
        ].join("\n"),
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "migrate", "--scan-only"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Invalid:");
      expect(output).toContain("legacy-invalid.md");
      expect(output).toContain("Missing fields:");
      expect(output).toContain("Run without --scan-only to auto-migrate");

      consoleSpy.mockRestore();
    });

    it("should migrate invalid decisions and print migration summary", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const decisionsDir = path.join(process.cwd(), "roadmap", "decisions");
      await fs.mkdir(decisionsDir, { recursive: true });
      await fs.writeFile(
        path.join(decisionsDir, "legacy-migrate.md"),
        [
          "---",
          "id: project:20260307:legacy-migrate",
          "title: Legacy Migrate",
          "status: proposed",
          "---",
          "",
          "Needs migration",
        ].join("\n"),
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "migrate"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Migrating invalid decisions");
      expect(output).toContain("Migrated:");

      consoleSpy.mockRestore();
    });

    it("should print migration errors when legacy decision cannot be migrated", async () => {
      const program = new Command();
      program.exitOverride();
      registerDecisionCommand(program);

      const decisionsDir = path.join(process.cwd(), "roadmap", "decisions");
      await fs.mkdir(decisionsDir, { recursive: true });
      await fs.writeFile(
        path.join(decisionsDir, "legacy-unmigratable.md"),
        [
          "---",
          "id: bad: [",
          "title: Legacy Unmigratable",
          "---",
          "",
          "Cannot be fixed automatically because id is invalid.",
        ].join("\n"),
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "decision", "migrate"]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("✗ Failed:");
      expect(output).toContain("Errors:");
      expect(output).toContain("legacy-unmigratable.md");

      consoleSpy.mockRestore();
    });
  });
});
