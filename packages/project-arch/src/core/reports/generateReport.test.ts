import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { createTestProject, createTempDir, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, setDecisionStatus } from "../decisions/createDecision";
import { readMarkdownWithFrontmatter } from "../../fs";
import { writeFile } from "../../fs";
import { generateReport } from "./generateReport";

describe.sequential("core/reports/generateReport", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  }, 45_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should render a metrics table", async () => {
    const report = await generateReport(tempDir);

    expect(report).toContain("Metric");
    expect(report).toContain("Value");
    expect(report).toContain("active phase");
    expect(report).toContain("tasks by status");
    expect(report).toContain("decisions by status");
    expect(report).toContain("docs coverage");
  }, 15_000);

  it("should include task and decision status counts", async () => {
    await createPhase("report-phase", tempDir);
    await createMilestone("report-phase", "report-milestone", tempDir);

    await createTask({
      phaseId: "report-phase",
      milestoneId: "report-milestone",
      lane: "planned",
      title: "Report Task",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const decisionPath = await createDecision(
      {
        scope: "milestone",
        phase: "report-phase",
        milestone: "report-milestone",
        title: "Report Decision",
      },
      tempDir,
    );

    const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );
    await setDecisionStatus(decisionDoc.data.id, "accepted", tempDir);

    const report = await generateReport(tempDir);

    expect(report).toContain("todo:");
    expect(report).toContain("accepted:");
  }, 15_000);

  it("should handle empty repository-like directory", async () => {
    const emptyContext = await createTempDir();

    try {
      const report = await generateReport(emptyContext.tempDir);
      expect(report).toContain("active phase");
      expect(report).toContain("none");
      expect(report).toContain("docs coverage");
      expect(report).toContain("0/0");
    } finally {
      await emptyContext.cleanup();
    }
  });

  it("should count docs coverage with existing and missing references", async () => {
    await createPhase("docs-phase", tempDir);
    await createMilestone("docs-phase", "docs-milestone", tempDir);

    const decisionPath = await createDecision(
      {
        scope: "milestone",
        phase: "docs-phase",
        milestone: "docs-milestone",
        title: "Docs Coverage Decision",
      },
      tempDir,
    );

    const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );

    await setDecisionStatus(decisionDoc.data.id, "accepted", tempDir);

    await writeFile(path.join(tempDir, "docs", "exists.md"), "# Exists\n");

    const decisionFile = await readMarkdownWithFrontmatter<Record<string, unknown>>(
      path.join(tempDir, decisionPath),
    );
    const updatedFrontmatter = {
      ...decisionFile.data,
      links: {
        ...(decisionFile.data.links as Record<string, unknown>),
        publicDocs: ["docs/exists.md", "docs/missing.md"],
      },
    };

    await writeFile(
      path.join(tempDir, decisionPath),
      `---\n${Object.entries(updatedFrontmatter)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n---\n\n${decisionFile.content}`,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("docs coverage");
    expect(report).toContain("1/2");
  }, 15_000);

  it("should render sorted task and decision status buckets", async () => {
    await createPhase("sort-phase", tempDir);
    await createMilestone("sort-phase", "sort-milestone", tempDir);

    const taskPath = await createTask({
      phaseId: "sort-phase",
      milestoneId: "sort-milestone",
      lane: "planned",
      title: "Task For Sorting",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const taskDoc = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
    await writeFile(
      taskPath,
      `---\n${Object.entries({ ...taskDoc.data, status: "done" })
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n---\n\n${taskDoc.content}`,
    );

    const firstDecisionPath = await createDecision(
      {
        scope: "milestone",
        phase: "sort-phase",
        milestone: "sort-milestone",
        title: "Accepted Decision",
      },
      tempDir,
    );
    const firstDecisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, firstDecisionPath),
    );
    await setDecisionStatus(firstDecisionDoc.data.id, "accepted", tempDir);

    await createDecision(
      {
        scope: "milestone",
        phase: "sort-phase",
        milestone: "sort-milestone",
        title: "Proposed Decision",
      },
      tempDir,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("tasks by status");
    expect(report).toContain("done:");
    expect(report).toContain("todo:");
    expect(report).toContain("accepted:");
    expect(report).toContain("proposed:");
  }, 15_000);
});
