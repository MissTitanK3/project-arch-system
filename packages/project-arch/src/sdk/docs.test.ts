import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { createDecision, linkDecision } from "../core/decisions/createDecision";
import { createTask } from "../core/tasks/createTask";
import { writeFile } from "../fs/writeFile";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../utils/fs";
import { docsCatalog, docsList } from "./docs";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

describe.sequential("sdk/docs", () => {
  let context: TestProjectContext;
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    context = await createTestProject(originalCwd);
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should list docs references as successful operation result", async () => {
    const decisionPath = await createDecision({ scope: "project", title: "Docs SDK" }, tempDir);
    const decision = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );

    await linkDecision(decision.data.id, { doc: "docs/a.md" }, tempDir);
    await linkDecision(decision.data.id, { doc: "docs/b.md" }, tempDir);

    const result = await docsList();

    resultAssertions.assertSuccess(result);
    expect(result.data.refs).toEqual(expect.arrayContaining(["docs/a.md", "docs/b.md"]));
  }, 120_000);

  it("should return empty refs in repository without doc links", async () => {
    const result = await docsList();

    resultAssertions.assertSuccess(result);
    expect(Array.isArray(result.data.refs)).toBe(true);
  }, 120_000);

  it("should return docs catalog with discovered files and linked refs", async () => {
    const taskPath = await createTask({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
      lane: "planned",
      title: "Docs Catalog Task",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const taskDoc = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
    await writeMarkdownWithFrontmatter(
      taskPath,
      { ...taskDoc.data, publicDocs: ["docs/a.md"] },
      taskDoc.content,
    );

    const decisionPath = await createDecision({ scope: "project", title: "Docs SDK" }, tempDir);
    const decision = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );

    await linkDecision(decision.data.id, { doc: "docs/missing.md" }, tempDir);
    await writeFile(path.join(tempDir, "docs", "a.md"), "# A\n");
    await writeFile(path.join(tempDir, "architecture", "guide.md"), "# Guide\n");

    const result = await docsCatalog();

    resultAssertions.assertSuccess(result);
    expect(result.data.summary.total).toBeGreaterThanOrEqual(3);
    expect(result.data.summary.referenced).toBeGreaterThanOrEqual(2);
    expect(result.data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "architecture/guide.md", discoveredOnDisk: true }),
        expect.objectContaining({ path: "docs/a.md", taskRefs: 1, exists: true }),
        expect.objectContaining({ path: "docs/missing.md", decisionRefs: 1, exists: false }),
      ]),
    );
  }, 120_000);

  it("should support linked-only docs catalog views", async () => {
    await writeFile(path.join(tempDir, "architecture", "guide.md"), "# Guide\n");

    const decisionPath = await createDecision({ scope: "project", title: "Linked Docs Only" }, tempDir);
    const decision = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );
    await linkDecision(decision.data.id, { doc: "docs/linked.md" }, tempDir);

    const result = await docsCatalog({ linkedOnly: true });

    resultAssertions.assertSuccess(result);
    expect(result.data.entries.map((entry) => entry.path)).toContain("docs/linked.md");
    expect(result.data.summary.total).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
