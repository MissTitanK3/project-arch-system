import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerDocsCommand } from "./docs";
import { docs as docsSdk } from "../../sdk";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import path from "path";
import fs from "fs/promises";

describe("cli/commands/docs", () => {
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

  describe("registerDocsCommand", () => {
    it("should register docs command", () => {
      const program = new Command();
      registerDocsCommand(program);

      const docsCommand = program.commands.find((cmd) => cmd.name() === "docs");
      expect(docsCommand).toBeDefined();
      expect(docsCommand?.description()).toBe("Inspect architecture and linked documentation");
    });

    it("should include enhanced help text", () => {
      const program = new Command();
      const output: string[] = [];
      program.configureOutput({
        writeOut: (str) => output.push(str),
        writeErr: (str) => output.push(str),
      });
      registerDocsCommand(program);

      const docsCommand = program.commands.find((cmd) => cmd.name() === "docs");
      docsCommand?.outputHelp();
      const helpText = output.join("");

      expect(helpText).toContain("pa docs");
      expect(helpText).toContain("Inspect documentation inventory");
      expect(helpText).toContain("pa report");
      expect(helpText).toContain("--linked-only");
    });

    it("should execute docs and print inventory summary", async () => {
      const program = new Command();
      program.exitOverride();
      registerDocsCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "docs"]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("docs:"));

      consoleSpy.mockRestore();
    });

    it("should list architecture documentation files", async () => {
      const program = new Command();
      program.exitOverride();
      registerDocsCommand(program);

      // Create a custom doc file
      const archDir = path.join(process.cwd(), "architecture");
      await fs.mkdir(archDir, { recursive: true });
      await fs.writeFile(path.join(archDir, "custom.md"), "# Custom Doc");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "docs"]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("architecture/custom.md"));

      consoleSpy.mockRestore();
    });

    it("should handle empty documentation gracefully", async () => {
      const program = new Command();
      program.exitOverride();
      registerDocsCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "docs"]);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should print inventory entries returned by SDK", async () => {
      const program = new Command();
      program.exitOverride();
      registerDocsCommand(program);

      vi.spyOn(docsSdk, "docsCatalog").mockResolvedValue({
        success: true,
        data: {
          summary: {
            total: 2,
            existing: 1,
            missing: 1,
            referenced: 2,
            discoveredOnDisk: 1,
            taskLinked: 1,
            decisionLinked: 1,
          },
          entries: [
            {
              path: "architecture/README.md",
              category: "architecture",
              exists: true,
              discoveredOnDisk: true,
              taskRefs: 0,
              decisionRefs: 0,
            },
            {
              path: "docs/missing.md",
              category: "docs",
              exists: false,
              discoveredOnDisk: false,
              taskRefs: 1,
              decisionRefs: 1,
            },
          ],
        },
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "docs"]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("docs: 2 total"));
      expect(consoleSpy).toHaveBeenCalledWith(
        "architecture/README.md [architecture, exists, file]",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "docs/missing.md [docs, missing, tasks:1, decisions:1]",
      );

      consoleSpy.mockRestore();
    });

    it("should support json output", async () => {
      const program = new Command();
      program.exitOverride();
      registerDocsCommand(program);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await program.parseAsync(["node", "test", "docs", "--json"]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"schemaVersion": "2.0"'));
      consoleSpy.mockRestore();
    });

    it("should pass linked-only through to sdk docs catalog", async () => {
      const program = new Command();
      program.exitOverride();
      registerDocsCommand(program);

      const catalogSpy = vi.spyOn(docsSdk, "docsCatalog").mockResolvedValue({
        success: true,
        data: {
          summary: {
            total: 0,
            existing: 0,
            missing: 0,
            referenced: 0,
            discoveredOnDisk: 0,
            taskLinked: 0,
            decisionLinked: 0,
          },
          entries: [],
        },
      });

      await program.parseAsync(["node", "test", "docs", "--linked-only"]);

      expect(catalogSpy).toHaveBeenCalledWith({ linkedOnly: true });
    });
  });
});
