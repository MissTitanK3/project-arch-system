import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import { Command } from "commander";
import { registerRoadmapCommand } from "./roadmap";
import { createTestProject, consoleAssertions, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../../core/phases/createPhase";
import { createMilestone } from "../../core/milestones/createMilestone";
import { createTask } from "../../core/tasks/createTask";
import * as manifests from "../../core/manifests";
import { runCheck } from "../../core/checks/runCheck";

describe("cli/commands/roadmap", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  const phaseId = "phase-99";
  const milestoneId = "milestone-99-cleanup";

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
    await createPhase(phaseId);
    await createMilestone(phaseId, milestoneId);
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
    process.exitCode = undefined;
  }, 120_000);

  it("registers roadmap cleanup legacy command", () => {
    const program = new Command();
    registerRoadmapCommand(program);

    const roadmapCommand = program.commands.find((cmd) => cmd.name() === "roadmap");
    expect(roadmapCommand).toBeDefined();
    const cleanupCommand = roadmapCommand?.commands.find((cmd) => cmd.name() === "cleanup");
    expect(cleanupCommand).toBeDefined();
    expect(cleanupCommand?.commands.find((cmd) => cmd.name() === "legacy")).toBeDefined();
  });

  it("dry-run groups cleanup results without mutating files", async () => {
    const canonicalTaskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
      compatibilityLegacyWrite: true,
    });

    const exactMirrorLegacyPath = canonicalTaskPath
      .replace(/\/roadmap\/projects\/[^/]+\/phases\//, "/roadmap/phases/")
      .replace(/\\/g, "/");

    const emptyScaffoldPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-empty",
      "milestones",
      "m-empty",
      "targets.md",
    );
    await fs.ensureDir(path.dirname(emptyScaffoldPath));
    await fs.writeFile(emptyScaffoldPath, "# Milestone Targets\n\n- TBD\n", "utf8");

    const preservedLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-keep",
      "milestones",
      "m-keep",
      "tasks",
      "backlog",
      "001-history.md",
    );
    await fs.ensureDir(path.dirname(preservedLegacyPath));
    await fs.writeFile(
      preservedLegacyPath,
      [
        "---",
        "schemaVersion: '2.0'",
        "id: '001'",
        "slug: history",
        "title: History",
        "lane: backlog",
        "status: todo",
        "createdAt: '2026-05-25'",
        "updatedAt: '2026-05-25'",
        "discoveredFromTask: null",
        "tags: []",
        "codeTargets: []",
        "publicDocs: []",
        "decisions: []",
        "completionCriteria: []",
        "---",
        "",
        "# 001 History",
        "",
        "## Objective",
        "",
        "Capture prior cleanup notes for manual follow-up.",
        "",
      ].join("\n"),
      "utf8",
    );

    const beforeExactMirror = await fs.readFile(exactMirrorLegacyPath, "utf8");
    const beforePreserved = await fs.readFile(preservedLegacyPath, "utf8");
    const reconcileDir = path.join(context.tempDir, ".project-arch", "reconcile");
    const reconcileExistsBefore = await fs.pathExists(reconcileDir);

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--dry-run"]);

    consoleAssertions.assertConsoleContains(consoleSpy, "mode: dry-run");
    consoleAssertions.assertConsoleContains(consoleSpy, "runtime compatibility: hybrid");
    consoleAssertions.assertConsoleContains(consoleSpy, "exact-mirror removals: 1");
    consoleAssertions.assertConsoleContains(consoleSpy, "empty-scaffolding removals: 1");
    consoleAssertions.assertConsoleContains(consoleSpy, "preserved legacy content: 1");
    consoleAssertions.assertConsoleContains(consoleSpy, "manual-review required: 0");
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "[dry-run] would write 1 preservation records",
    );

    expect(await fs.pathExists(exactMirrorLegacyPath)).toBe(true);
    expect(await fs.pathExists(emptyScaffoldPath)).toBe(true);
    expect(await fs.pathExists(preservedLegacyPath)).toBe(true);
    expect(await fs.readFile(exactMirrorLegacyPath, "utf8")).toBe(beforeExactMirror);
    expect(await fs.readFile(preservedLegacyPath, "utf8")).toBe(beforePreserved);
    expect(await fs.pathExists(reconcileDir)).toBe(reconcileExistsBefore);

    consoleSpy.mockRestore();
  }, 120_000);

  it("apply mode deletes exact-mirror artifacts and writes preservation records", async () => {
    const canonicalTaskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
      compatibilityLegacyWrite: true,
    });

    const exactMirrorLegacyPath = canonicalTaskPath
      .replace(/\/roadmap\/projects\/[^/]+\/phases\//, "/roadmap/phases/")
      .replace(/\\/g, "/");

    const preservedLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-keep",
      "milestones",
      "m-keep",
      "tasks",
      "backlog",
      "001-history.md",
    );
    await fs.ensureDir(path.dirname(preservedLegacyPath));
    await fs.writeFile(
      preservedLegacyPath,
      [
        "---",
        "schemaVersion: '2.0'",
        "id: '001'",
        "slug: history",
        "title: History",
        "lane: backlog",
        "status: todo",
        "createdAt: '2026-05-25'",
        "updatedAt: '2026-05-25'",
        "discoveredFromTask: null",
        "tags: []",
        "codeTargets: []",
        "publicDocs: []",
        "decisions: []",
        "completionCriteria: []",
        "---",
        "",
        "# 001 History",
        "",
        "## Objective",
        "",
        "Capture prior cleanup notes for manual follow-up.",
        "",
      ].join("\n"),
      "utf8",
    );

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]);

    const reconcileRecordsPath = path.join(
      context.tempDir,
      ".project-arch",
      "reconcile",
      "cleanup-preservation-records.json",
    );

    consoleAssertions.assertConsoleContains(consoleSpy, "mode: dry-run");
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "wrote 1 records to .project-arch/reconcile/cleanup-preservation-records.json",
    );
    consoleAssertions.assertConsoleContains(consoleSpy, "apply deletion outcomes:");
    consoleAssertions.assertConsoleContains(consoleSpy, "- deleted exact-mirror: 1");
    consoleAssertions.assertConsoleContains(consoleSpy, "- deleted empty-scaffold: 0");

    expect(await fs.pathExists(exactMirrorLegacyPath)).toBe(false);
    expect(await fs.pathExists(preservedLegacyPath)).toBe(true);

    const records = await fs.readJSON(reconcileRecordsPath);
    expect(records).toBeInstanceOf(Array);
    expect(records.length).toBe(1);
    expect(records[0]).toHaveProperty("bucket", "preserved.has-content-legacy-only");
    expect(records[0]).toHaveProperty("normalizedKey");
    expect(records[0]).toHaveProperty("relativePath");
    expect(records[0]).toHaveProperty("absolutePath");
    expect(records[0]).toHaveProperty("artifactKind");
    expect(records[0]).toHaveProperty("pairingState");
    expect(records[0]).toHaveProperty("routingSource");
    expect(records[0]).toHaveProperty("timestamp");

    consoleSpy.mockRestore();
  }, 120_000);

  it("apply mode deletes empty-scaffold artifacts only when eligible", async () => {
    const emptyScaffoldPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-empty",
      "milestones",
      "m-empty",
      "targets.md",
    );
    await fs.ensureDir(path.dirname(emptyScaffoldPath));
    await fs.writeFile(emptyScaffoldPath, "# Milestone Targets\n\n- TBD\n", "utf8");

    const preservedLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-keep",
      "milestones",
      "m-keep",
      "tasks",
      "backlog",
      "001-history.md",
    );
    await fs.ensureDir(path.dirname(preservedLegacyPath));
    await fs.writeFile(
      preservedLegacyPath,
      [
        "---",
        "schemaVersion: '2.0'",
        "id: '001'",
        "slug: history",
        "title: History",
        "lane: backlog",
        "status: todo",
        "createdAt: '2026-05-25'",
        "updatedAt: '2026-05-25'",
        "discoveredFromTask: null",
        "tags: []",
        "codeTargets: []",
        "publicDocs: []",
        "decisions: []",
        "completionCriteria: []",
        "---",
        "",
        "# 001 History",
        "",
        "## Objective",
        "",
        "Capture prior cleanup notes for manual follow-up.",
        "",
      ].join("\n"),
      "utf8",
    );

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]);

    consoleAssertions.assertConsoleContains(consoleSpy, "apply deletion outcomes:");
    consoleAssertions.assertConsoleContains(consoleSpy, "- deleted exact-mirror: 0");
    consoleAssertions.assertConsoleContains(consoleSpy, "- deleted empty-scaffold: 1");

    expect(await fs.pathExists(emptyScaffoldPath)).toBe(false);
    expect(await fs.pathExists(preservedLegacyPath)).toBe(true);

    consoleSpy.mockRestore();
  }, 120_000);

  it("refuses all deletions when runtime re-confirmation fails", async () => {
    const canonicalTaskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
      compatibilityLegacyWrite: true,
    });

    const exactMirrorLegacyPath = canonicalTaskPath
      .replace(/\/roadmap\/projects\/[^/]+\/phases\//, "/roadmap/phases/")
      .replace(/\\/g, "/");

    const originalPathExists = fs.pathExists.bind(fs);
    const pathExistsSpy = vi.spyOn(fs, "pathExists").mockImplementation(async (targetPath) => {
      const normalized = String(targetPath).replace(/\\/g, "/");
      if (normalized === canonicalTaskPath.replace(/\\/g, "/")) {
        return false;
      }
      return originalPathExists(targetPath);
    });

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);
    const graphRebuildSpy = vi
      .spyOn(manifests, "rebuildArchitectureGraph")
      .mockResolvedValue(undefined);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${String(code)}`);
    }) as never);

    await expect(
      program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]),
    ).rejects.toThrow("process.exit:1");

    expect(await fs.pathExists(exactMirrorLegacyPath)).toBe(true);
    const reconcileRecordsPath = path.join(
      context.tempDir,
      ".project-arch",
      "reconcile",
      "cleanup-preservation-records.json",
    );
    const records = await fs.readJSON(reconcileRecordsPath);
    expect(records).toHaveLength(1);
    expect(records[0]).toHaveProperty("bucket", "manual-review.pre-condition-failed");
    expect(records[0]).toHaveProperty("routingSource", "classification-pre-condition-failed");

    consoleAssertions.assertConsoleContains(
      consoleErrorSpy,
      "ERROR: Runtime re-confirmation failed for one or more deletion candidates. Refusing all deletions.",
    );
    expect(graphRebuildSpy).not.toHaveBeenCalled();

    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    pathExistsSpy.mockRestore();
    graphRebuildSpy.mockRestore();
  }, 120_000);

  it("refuses all deletions when preservation gate record writing fails", async () => {
    const canonicalTaskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
      compatibilityLegacyWrite: true,
    });

    const exactMirrorLegacyPath = canonicalTaskPath
      .replace(/\/roadmap\/projects\/[^/]+\/phases\//, "/roadmap/phases/")
      .replace(/\\/g, "/");

    const recordsPathAsDir = path.join(
      context.tempDir,
      ".project-arch",
      "reconcile",
      "cleanup-preservation-records.json",
    );
    await fs.ensureDir(recordsPathAsDir);

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${String(code)}`);
    }) as never);

    await expect(
      program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]),
    ).rejects.toThrow("process.exit:1");

    expect(await fs.pathExists(exactMirrorLegacyPath)).toBe(true);
    consoleAssertions.assertConsoleContains(
      consoleErrorSpy,
      "ERROR: Failed to write preservation records. Refusing all deletions.",
    );

    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  }, 120_000);

  it("refreshes graph state after apply mode deletes artifacts", async () => {
    const canonicalTaskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
      compatibilityLegacyWrite: true,
    });

    const exactMirrorLegacyPath = canonicalTaskPath
      .replace(/\/roadmap\/projects\/[^/]+\/phases\//, "/roadmap/phases/")
      .replace(/\\/g, "/");

    const graphRebuildSpy = vi
      .spyOn(manifests, "rebuildArchitectureGraph")
      .mockResolvedValue(undefined);

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]);

    expect(graphRebuildSpy).toHaveBeenCalledOnce();
    expect(graphRebuildSpy).toHaveBeenCalledWith(context.tempDir);
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "graph state refreshed after 1 deletion(s)",
    );
    expect(await fs.pathExists(exactMirrorLegacyPath)).toBe(false);

    consoleSpy.mockRestore();
    graphRebuildSpy.mockRestore();
  }, 120_000);

  it("skips graph refresh when apply mode produces no deletions", async () => {
    const preservedLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-keep",
      "milestones",
      "m-keep",
      "tasks",
      "backlog",
      "001-history.md",
    );
    await fs.ensureDir(path.dirname(preservedLegacyPath));
    await fs.writeFile(
      preservedLegacyPath,
      [
        "# 001 History",
        "",
        "## Objective",
        "",
        "Capture prior cleanup notes for manual follow-up.",
        "",
      ].join("\n"),
      "utf8",
    );

    const graphRebuildSpy = vi
      .spyOn(manifests, "rebuildArchitectureGraph")
      .mockResolvedValue(undefined);

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]);

    expect(graphRebuildSpy).not.toHaveBeenCalled();
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "no deletions occurred; graph state unchanged",
    );

    consoleSpy.mockRestore();
    graphRebuildSpy.mockRestore();
  }, 120_000);

  it("covers already-clean dry-run and apply compatibility posture", async () => {
    await fs.remove(path.join(context.tempDir, "roadmap", "phases"));

    const graphRebuildSpy = vi
      .spyOn(manifests, "rebuildArchitectureGraph")
      .mockResolvedValue(undefined);

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--dry-run"]);
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "runtime compatibility: project-scoped-only",
    );
    consoleAssertions.assertConsoleContains(consoleSpy, "legacy root present: no");
    consoleAssertions.assertConsoleContains(consoleSpy, "exact-mirror removals: 0");
    consoleAssertions.assertConsoleContains(consoleSpy, "empty-scaffolding removals: 0");

    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]);
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "no deletions occurred; graph state unchanged",
    );
    expect(graphRebuildSpy).not.toHaveBeenCalled();

    const checkResult = await runCheck(context.tempDir);
    expect(checkResult.compatibility?.mode).toBe("project-scoped-only");
    expect(checkResult.compatibility?.legacyRootExists).toBe(false);

    consoleSpy.mockRestore();
    graphRebuildSpy.mockRestore();
  }, 120_000);

  it("covers mixed-content apply outcomes and post-cleanup diagnostics", async () => {
    const canonicalTaskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      discoveredFromTask: null,
      cwd: context.tempDir,
      compatibilityLegacyWrite: true,
    });

    const exactMirrorLegacyPath = canonicalTaskPath
      .replace(/\/roadmap\/projects\/[^/]+\/phases\//, "/roadmap/phases/")
      .replace(/\\/g, "/");

    const emptyScaffoldPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-empty",
      "milestones",
      "m-empty",
      "targets.md",
    );
    await fs.ensureDir(path.dirname(emptyScaffoldPath));
    await fs.writeFile(emptyScaffoldPath, "# Milestone Targets\n\n- TBD\n", "utf8");

    const preservedLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-keep",
      "milestones",
      "m-keep",
      "tasks",
      "backlog",
      "001-history.md",
    );
    await fs.ensureDir(path.dirname(preservedLegacyPath));
    await fs.writeFile(
      preservedLegacyPath,
      [
        "---",
        "schemaVersion: '2.0'",
        "id: '001'",
        "slug: history",
        "title: History",
        "lane: backlog",
        "status: todo",
        "createdAt: '2026-05-25'",
        "updatedAt: '2026-05-25'",
        "discoveredFromTask: null",
        "tags: []",
        "codeTargets: []",
        "publicDocs: []",
        "decisions: []",
        "completionCriteria: []",
        "---",
        "",
        "# 001 History",
        "",
        "## Objective",
        "",
        "Capture prior cleanup notes for manual follow-up.",
        "",
      ].join("\n"),
      "utf8",
    );

    const graphRebuildSpy = vi
      .spyOn(manifests, "rebuildArchitectureGraph")
      .mockResolvedValue(undefined);

    const program = new Command();
    program.exitOverride();
    registerRoadmapCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "roadmap", "cleanup", "legacy", "--apply"]);

    consoleAssertions.assertConsoleContains(consoleSpy, "- deleted exact-mirror: 1");
    consoleAssertions.assertConsoleContains(consoleSpy, "- deleted empty-scaffold: 1");
    consoleAssertions.assertConsoleContains(
      consoleSpy,
      "graph state refreshed after 2 deletion(s)",
    );
    expect(graphRebuildSpy).toHaveBeenCalledOnce();
    expect(await fs.pathExists(exactMirrorLegacyPath)).toBe(false);
    expect(await fs.pathExists(emptyScaffoldPath)).toBe(false);
    expect(await fs.pathExists(preservedLegacyPath)).toBe(true);

    const checkResult = await runCheck(context.tempDir);
    expect(checkResult.compatibility?.mode).toBe("hybrid");
    expect(checkResult.compatibility?.legacyRootExists).toBe(true);

    consoleSpy.mockRestore();
    graphRebuildSpy.mockRestore();
  }, 120_000);
});
