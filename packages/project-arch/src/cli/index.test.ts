import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import path from "path";
import { ensureDir, writeFile } from "fs-extra";
import { runCli } from "./index";
import { createTempDir, createTestProject, type TestProjectContext } from "../test/helpers";
import { ObservationStore } from "../feedback/observation-store";

describe("cli/index", () => {
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

  describe("runCli", () => {
    it("should create a program with all commands registered", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockResolvedValue({} as Command);

      await runCli(["node", "test", "--help"]);

      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("should register init command", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const initCmd = this.commands.find((cmd) => cmd.name() === "init");
        expect(initCmd).toBeDefined();
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("should register phase command", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const phaseCmd = this.commands.find((cmd) => cmd.name() === "phase");
        expect(phaseCmd).toBeDefined();
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("should register task command", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const taskCmd = this.commands.find((cmd) => cmd.name() === "task");
        expect(taskCmd).toBeDefined();
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("should register all core commands", async () => {
      const spy = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
        this: Command,
      ) {
        const commandNames = this.commands.map((cmd) => cmd.name());
        expect(commandNames).toContain("init");
        expect(commandNames).toContain("phase");
        expect(commandNames).toContain("milestone");
        expect(commandNames).toContain("task");
        expect(commandNames).toContain("decision");
        expect(commandNames).toContain("docs");
        expect(commandNames).toContain("check");
        expect(commandNames).toContain("context");
        expect(commandNames).toContain("learn");
        expect(commandNames).toContain("lint");
        expect(commandNames).toContain("report");
        expect(commandNames).toContain("next");
        expect(commandNames).toContain("policy");
        expect(commandNames).toContain("feedback");
        expect(commandNames).toContain("reconcile");
        expect(commandNames).toContain("backfill");
        expect(commandNames).toContain("explain");
        expect(commandNames).toContain("fix");
        expect(commandNames).toContain("normalize");
        expect(commandNames).toContain("agents");
        expect(commandNames).toContain("help");
        return this;
      });

      await runCli(["node", "test"]);

      spy.mockRestore();
    });

    it("captures task ambiguity friction when command exits non-zero", async () => {
      const project = await createTestProject(originalCwd);

      try {
        process.exitCode = undefined;

        await runCli([
          "node",
          "test",
          "task",
          "discover",
          "phase-1",
          "milestone-1-foundation",
          "--from",
          "abc",
        ]);

        const observationStore = new ObservationStore(path.join(process.cwd(), ".arch"));
        await observationStore.initialize();
        const today = new Date().toISOString().split("T")[0] ?? "";
        const observations = await observationStore.readObservationsByDate(today);

        expect(observations.some((obs) => obs.category === "ambiguity")).toBe(true);
      } finally {
        await project.cleanup();
      }
    }, 120_000);

    it("captures check validation friction when command reports errors", async () => {
      const project = await createTestProject(originalCwd);

      try {
        process.exitCode = undefined;

        const taskDir = path.join(
          process.cwd(),
          "roadmap",
          "phases",
          "phase-1",
          "milestones",
          "milestone-1-foundation",
          "tasks",
          "planned",
        );
        await ensureDir(taskDir);

        await writeFile(
          path.join(taskDir, "043-lane-mismatch.md"),
          `---
schemaVersion: "1.0"
id: "043"
slug: lane-mismatch
lane: discovered
title: Lane Mismatch Task
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Lane Mismatch Task

This task has a lane mismatch.
`,
          "utf8",
        );

        // pa check now reports malformed files as diagnostics (exit code 1)
        // rather than throwing an uncaught exception. The postAction hook still
        // captures the validation-gap observation via the non-zero exit code.
        await runCli(["node", "test", "check"]);
        expect(process.exitCode).toBe(1);

        const observationStore = new ObservationStore(path.join(process.cwd(), ".arch"));
        await observationStore.initialize();
        const today = new Date().toISOString().split("T")[0] ?? "";
        const observations = await observationStore.readObservationsByDate(today);

        expect(observations.some((obs) => obs.category === "validation-gap")).toBe(true);
      } finally {
        await project.cleanup();
      }
    }, 120_000);
  });
});
