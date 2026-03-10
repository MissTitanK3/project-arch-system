import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { createTestProject, createTempDir, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, linkDecision } from "../decisions/createDecision";
import { listDocsReferences } from "./listDocs";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter, writeFile } from "../../fs";

describe.sequential("core/docs/listDocs", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  it("should return sorted unique public docs from tasks and decisions", async () => {
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
    const nextFrontmatter = {
      ...parsedTask.data,
      publicDocs: ["docs/a.md", "docs/common.md"],
    };
    await writeMarkdownWithFrontmatter(taskPath, nextFrontmatter, parsedTask.content);

    const decisionPath = await createDecision(
      { scope: "project", title: "Docs Decision" },
      tempDir,
    );
    const parsedDecision = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );

    await linkDecision(parsedDecision.data.id, { doc: "docs/common.md" }, tempDir);
    await linkDecision(parsedDecision.data.id, { doc: "docs/b.md" }, tempDir);

    const refs = await listDocsReferences(tempDir);

    expect(refs).toEqual(["docs/a.md", "docs/b.md", "docs/common.md"]);
  }, 60_000);

  it("should return empty array when roadmap content is absent", async () => {
    const emptyContext = await createTempDir();

    try {
      const refs = await listDocsReferences(emptyContext.tempDir);
      expect(refs).toEqual([]);
    } finally {
      await emptyContext.cleanup();
    }
  });

  it("should skip invalid decision documents without failing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const invalidDecisionPath = path.join(tempDir, "roadmap", "decisions", "invalid.md");
    await writeFile(
      invalidDecisionPath,
      `---\nid: broken\ntitle: Broken\n---\n\nInvalid decision schema\n`,
    );

    const refs = await listDocsReferences(tempDir);

    expect(Array.isArray(refs)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
