import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { initializeProject } from "../core/init/initializeProject";
import { createPhase } from "../core/phases/createPhase";
import { createMilestone } from "../core/milestones/createMilestone";
import { createTask } from "../core/tasks/createTask";
import { createDecision, linkDecision } from "../core/decisions/createDecision";
import { buildGraph } from "./buildGraph";
import { traceTask } from "./traceTask";
import { readMarkdownWithFrontmatter, writeFile } from "../fs";

describe.sequential("graph/traceTask", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "trace-task-test-"));
    await initializeProject({ template: "nextjs-turbo", pm: "pnpm" }, tempDir);
  }, 45_000);

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should return task trace details including linked decisions", async () => {
    const phaseId = "trace-phase";
    const milestoneId = "trace-milestone";

    await createPhase(phaseId, tempDir);
    await createMilestone(phaseId, milestoneId, tempDir);

    const taskPath = await createTask({
      phaseId,
      milestoneId,
      lane: "planned",
      title: "Traceable Task",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    const taskId = path.basename(taskPath).split("-")[0];
    const taskRef = `${phaseId}/${milestoneId}/${taskId}`;

    const taskDoc = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
    taskDoc.data.codeTargets = ["packages/ui/src/index.ts"];
    await writeFile(
      taskPath,
      `---\n${Object.entries(taskDoc.data)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n---\n\n${taskDoc.content}`,
    );

    const decisionPath = await createDecision(
      {
        scope: "milestone",
        phase: phaseId,
        milestone: milestoneId,
        title: "Traceable Decision",
      },
      tempDir,
    );
    const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );

    await linkDecision(
      decisionDoc.data.id,
      {
        task: taskRef,
        code: "packages/ui/src/index.ts",
      },
      tempDir,
    );

    await buildGraph(tempDir);

    const trace = await traceTask(taskRef, tempDir);

    expect(trace).toHaveProperty("graph");
    expect(trace).toHaveProperty("task");
    expect(trace).toHaveProperty("decisions");
    expect(trace).toHaveProperty("modules");

    expect(trace.decisions).toContain(decisionDoc.data.id);
    expect(Array.isArray(trace.modules)).toBe(true);
    expect(trace.modules).toContain("packages/ui");
  }, 15_000);

  it("should throw when .arch graph is missing", async () => {
    await rm(path.join(tempDir, ".arch"), { recursive: true, force: true });

    await expect(traceTask("phase/milestone/001", tempDir)).rejects.toThrow(
      ".arch/graph.json not found",
    );
  });

  it("should throw when task is not found in graph", async () => {
    await buildGraph(tempDir);

    await expect(traceTask("missing/phase/999", tempDir)).rejects.toThrow(
      "not found in .arch graph",
    );
  }, 15_000);
});
