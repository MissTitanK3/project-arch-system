import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { createDecision, linkDecision } from "../core/decisions/createDecision";
import { readMarkdownWithFrontmatter } from "../fs";
import { docsList } from "./docs";
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
    expect(result.data.refs).toEqual(["docs/a.md", "docs/b.md"]);
  }, 120_000);

  it("should return empty refs in repository without doc links", async () => {
    const result = await docsList();

    resultAssertions.assertSuccess(result);
    expect(Array.isArray(result.data.refs)).toBe(true);
  }, 120_000);
});
