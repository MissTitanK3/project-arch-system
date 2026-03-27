import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import { Command } from "commander";
import { registerProjectCommand } from "./project";
import { createTestProject, consoleAssertions, type TestProjectContext } from "../../test/helpers";

describe("cli/commands/project", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  });

  it("registers project command with new subcommand", () => {
    const program = new Command();
    registerProjectCommand(program);

    const projectCommand = program.commands.find((cmd) => cmd.name() === "project");
    expect(projectCommand).toBeDefined();
    expect(projectCommand?.commands.find((cmd) => cmd.name() === "new")).toBeDefined();
  });

  it("includes enhanced help text", () => {
    const program = new Command();
    const output: string[] = [];
    program.configureOutput({
      writeOut: (str) => output.push(str),
      writeErr: (str) => output.push(str),
    });
    registerProjectCommand(program);

    const projectCommand = program.commands.find((cmd) => cmd.name() === "project");
    const newCmd = projectCommand?.commands.find((cmd) => cmd.name() === "new");
    newCmd?.outputHelp();

    const help = output.join("");
    expect(help).toContain("pa project new");
    expect(help).toContain("roadmap/projects");
  });

  it("creates a project with defaults", async () => {
    const program = new Command();
    program.exitOverride();
    registerProjectCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "project", "new", "storefront"]);

    consoleAssertions.assertConsoleContains(consoleSpy, "Created project storefront");
    expect(
      await fs.pathExists(
        path.join(context.tempDir, "roadmap", "projects", "storefront", "manifest.json"),
      ),
    ).toBe(true);

    consoleSpy.mockRestore();
  });

  it("creates a project with overrides", async () => {
    const program = new Command();
    program.exitOverride();
    registerProjectCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "project",
      "new",
      "billing",
      "--title",
      "Billing Service",
      "--type",
      "service",
      "--owned-path",
      "services/billing",
      "--shared-dependency",
      "packages/config",
      "--tag",
      "payments",
    ]);

    const manifest = await fs.readJson(
      path.join(context.tempDir, "roadmap", "projects", "billing", "manifest.json"),
    );
    expect(manifest.title).toBe("Billing Service");
    expect(manifest.type).toBe("service");
    expect(manifest.ownedPaths).toEqual(["services/billing"]);
    expect(manifest.sharedDependencies).toEqual(["packages/config"]);
    expect(manifest.tags).toEqual(["payments"]);
    consoleAssertions.assertConsoleContains(consoleSpy, "Created project billing");

    consoleSpy.mockRestore();
  });

  it("rejects invalid project ids", async () => {
    const program = new Command();
    program.exitOverride();
    registerProjectCommand(program);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "project", "new", "Bad_Project"]);

    expect(process.exitCode).toBe(1);
    consoleAssertions.assertConsoleContains(errorSpy, "project ids must be lowercase");

    errorSpy.mockRestore();
    process.exitCode = undefined;
  });
});
