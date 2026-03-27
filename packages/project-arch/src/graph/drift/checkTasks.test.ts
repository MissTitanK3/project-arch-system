import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { writeFile } from "../../fs/writeFile";
import { checkTasks } from "./checkTasks";
import { TaskRecord } from "../../core/validation/tasks";
import { DecisionRecord } from "../../core/validation/decisions";

function taskRecord(codeTargets: string[]): TaskRecord {
  return {
    projectId: "shared",
    phaseId: "phase-1",
    milestoneId: "milestone-1",
    lane: "planned",
    filePath: "roadmap/projects/shared/phases/phase-1/milestones/milestone-1/tasks/planned/001-task.md",
    frontmatter: {
      schemaVersion: "1.0",
      id: "001",
      slug: "task",
      title: "Task",
      lane: "planned",
      status: "todo",
      createdAt: "2026-03-07",
      updatedAt: "2026-03-07",
      discoveredFromTask: null,
      tags: [],
      codeTargets,
      publicDocs: [],
      decisions: [],
      completionCriteria: [],
    },
  };
}

function decisionRecord(codeTargets: string[]): DecisionRecord {
  return {
    filePath: "roadmap/decisions/test.md",
    frontmatter: {
      schemaVersion: "1.0",
      type: "decision",
      id: "project:20260307:test",
      title: "Decision",
      status: "accepted",
      scope: { kind: "project" },
      drivers: [],
      decision: { summary: "summary" },
      alternatives: [],
      consequences: { positive: [], negative: [] },
      links: { tasks: [], codeTargets, publicDocs: [] },
    },
  };
}

describe("graph/drift/checkTasks", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "drift-tasks-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("should return no findings when no tracked prefixes exist", async () => {
    await writeFile(path.join(tempDir, "packages", "lib", "src", "index.ts"), "export {};\n");

    const findings = await checkTasks(tempDir, [taskRecord([])], [decisionRecord([])]);

    expect(findings).toEqual([]);
  });

  it("should report untracked implementation files", async () => {
    await writeFile(path.join(tempDir, "packages", "ui", "src", "tracked.ts"), "export {};\n");
    await writeFile(path.join(tempDir, "packages", "api", "src", "untracked.ts"), "export {};\n");

    const findings = await checkTasks(tempDir, [taskRecord(["packages/ui"])], []);

    expect(findings.some((f) => f.code === "UNTRACKED_IMPLEMENTATION")).toBe(true);
    expect(findings.some((f) => f.message.includes("packages/api/src/untracked.ts"))).toBe(true);
  });

  it("should include decision codeTargets in tracked prefixes", async () => {
    await writeFile(path.join(tempDir, "packages", "api", "src", "tracked.ts"), "export {};\n");

    const findings = await checkTasks(
      tempDir,
      [taskRecord([])],
      [decisionRecord(["packages/api"])],
    );

    expect(findings).toEqual([]);
  });

  it("should truncate warnings after 50 items", async () => {
    for (let index = 0; index < 60; index += 1) {
      await writeFile(
        path.join(tempDir, "packages", "extra", "src", `file-${index}.ts`),
        "export {};\n",
      );
    }
    await writeFile(path.join(tempDir, "packages", "ui", "src", "tracked.ts"), "export {};\n");

    const findings = await checkTasks(tempDir, [taskRecord(["packages/ui"])], []);

    const warnings = findings.filter((f) => f.code === "UNTRACKED_IMPLEMENTATION");
    expect(warnings.length).toBe(50);
    expect(findings.some((f) => f.code === "UNTRACKED_IMPLEMENTATION_TRUNCATED")).toBe(true);
  });
});
