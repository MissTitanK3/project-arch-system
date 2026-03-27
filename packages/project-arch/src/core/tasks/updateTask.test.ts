import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createTask } from "./createTask";
import { updateTaskStatus } from "./updateTask";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../utils/fs";
import fs from "fs-extra";
import * as graphManifests from "../../graph/manifests";

describe("updateTaskStatus", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  }, 30000);

  afterEach(async () => {
    await context.cleanup();
  }, 30000);

  it("updates task status and updatedAt", async () => {
    const taskFile = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const before = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    expect(before.data.status).toBe("todo");

    await updateTaskStatus(taskFile, "in_progress");

    const after = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    expect(after.data.status).toBe("in_progress");
    expect(after.data.updatedAt).toBeDefined();
    expect(after.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("throws if task file has invalid frontmatter schema", async () => {
    const invalidTaskPath = path.join(
      tempDir,
      "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-invalid.md",
    );

    await fs.ensureDir(path.dirname(invalidTaskPath));
    await fs.writeFile(invalidTaskPath, `---\nid: "001"\n---\n\n# Broken Task\n`, "utf8");

    await expect(updateTaskStatus(invalidTaskPath, "done")).rejects.toThrow();
  });

  it("rolls back task markdown when graph sync fails during status update", async () => {
    const taskFile = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const before = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    expect(before.data.status).toBe("todo");

    const graphSpy = vi
      .spyOn(graphManifests, "rebuildArchitectureGraph")
      .mockRejectedValue(new Error("injected graph failure"));

    try {
      await expect(updateTaskStatus(taskFile, "done", tempDir)).rejects.toThrow(
        /\.arch\/graph|rollback succeeded/i,
      );
    } finally {
      graphSpy.mockRestore();
    }

    const after = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    expect(after.data.status).toBe("todo");
  });

  it("blocks marking task done when dependencies are unresolved", async () => {
    const taskAPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const taskBPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });

    const taskA = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskAPath);
    const taskB = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskBPath);
    const dependencyId = String(taskA.data.id);
    await writeMarkdownWithFrontmatter(
      taskBPath,
      {
        ...(taskB.data as Record<string, unknown>),
        dependsOn: [dependencyId],
      },
      taskB.content,
    );

    await expect(updateTaskStatus(taskBPath, "done", tempDir)).rejects.toThrow(
      `Unresolved dependencies: ${dependencyId}`,
    );

    const taskAAfter = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskAPath);
    const taskBAfter = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskBPath);
    expect(taskAAfter.data.status).toBe("todo");
    expect(taskBAfter.data.status).toBe("todo");
  });

  it("allows marking task done after dependencies are done", async () => {
    const taskAPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const taskBPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });

    const taskA = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskAPath);
    const taskB = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskBPath);
    const dependencyId = String(taskA.data.id);
    await writeMarkdownWithFrontmatter(
      taskBPath,
      {
        ...(taskB.data as Record<string, unknown>),
        dependsOn: [dependencyId],
      },
      taskB.content,
    );

    await updateTaskStatus(taskAPath, "done", tempDir);
    await updateTaskStatus(taskBPath, "done", tempDir);

    const taskBAfter = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskBPath);
    expect(taskBAfter.data.status).toBe("done");
  });
});
