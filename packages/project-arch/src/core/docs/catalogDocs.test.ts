import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempDir, createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, linkDecision } from "../decisions/createDecision";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../utils/fs";
import { writeFile } from "../../fs/writeFile";
import { catalogDocs } from "./catalogDocs";

describe.sequential("core/docs/catalogDocs", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should catalog discovered markdown files and linked public docs together", async () => {
    await createPhase("docs-phase", tempDir);
    await createMilestone("docs-phase", "docs-milestone", tempDir);

    const taskPath = await createTask({
      phaseId: "docs-phase",
      milestoneId: "docs-milestone",
      lane: "planned",
      title: "Docs Task",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const parsedTask = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
    await writeMarkdownWithFrontmatter(
      taskPath,
      { ...parsedTask.data, publicDocs: ["docs/a.md"] },
      parsedTask.content,
    );

    const decisionPath = await createDecision(
      { scope: "project", title: "Docs Decision" },
      tempDir,
    );
    const decisionId = path.basename(decisionPath, ".md");
    await linkDecision(decisionId, { doc: "docs/missing.md" }, tempDir);

    await writeFile(path.join(tempDir, "docs", "a.md"), "# A\n");
    await writeFile(path.join(tempDir, "architecture", "guide.md"), "# Guide\n");

    const catalog = await catalogDocs(tempDir);

    expect(catalog.summary.total).toBeGreaterThanOrEqual(3);
    expect(catalog.summary.referenced).toBeGreaterThanOrEqual(2);
    expect(catalog.summary.discoveredOnDisk).toBeGreaterThanOrEqual(2);
    expect(catalog.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "architecture/guide.md",
          category: "architecture",
          exists: true,
          discoveredOnDisk: true,
          taskRefs: 0,
          decisionRefs: 0,
        }),
        expect.objectContaining({
          path: "docs/a.md",
          category: "docs",
          exists: true,
          discoveredOnDisk: true,
          taskRefs: 1,
          decisionRefs: 0,
        }),
        expect.objectContaining({
          path: "docs/missing.md",
          category: "docs",
          exists: false,
          discoveredOnDisk: false,
          taskRefs: 0,
          decisionRefs: 1,
        }),
      ]),
    );
  }, 120_000);

  it("should return empty summary in repository without docs content", async () => {
    const emptyContext = await createTempDir();
    try {
      const catalog = await catalogDocs(emptyContext.tempDir);
      expect(catalog.entries).toEqual([]);
      expect(catalog.summary).toEqual({
        total: 0,
        existing: 0,
        missing: 0,
        referenced: 0,
        discoveredOnDisk: 0,
        taskLinked: 0,
        decisionLinked: 0,
      });
    } finally {
      await emptyContext.cleanup();
    }
  });
});
