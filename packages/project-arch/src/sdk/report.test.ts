import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import fg from "fast-glob";
import { reportGenerate } from "./report";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../fs";

describe.sequential("sdk/report", () => {
  let context: TestProjectContext;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should generate a report table as successful operation", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("Metric");
    expect(result.data.text).toContain("Value");
    expect(result.data.text).toContain("active phase");
  }, 120_000);

  it("should support verbose mode option", async () => {
    const result = await reportGenerate({ verbose: true });

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("Metric");
    expect(result.data.text).toContain("Roadmap-Graph Parity Check");
  }, 120_000);

  it("should include provenance annotations", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("[source:");
    expect(result.data.text).toContain("roadmap/manifest.json");
  }, 120_000);

  it("should include graph sync status", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("graph sync status");
  }, 120_000);

  it("should include parity check summary", async () => {
    const result = await reportGenerate();

    resultAssertions.assertSuccess(result);
    expect(result.data.text).toContain("Roadmap-Graph Parity Check");
    expect(result.data.text).toContain("Status:");
    expect(result.data.text).toContain("Tasks checked:");
    expect(result.data.text).toContain("Status mismatches:");
  }, 120_000);

  it("should exclude sensitive docs from coverage while counting non-sensitive docs", async () => {
    const before = await reportGenerate();
    resultAssertions.assertSuccess(before);

    const beforeMatch = before.data.text.match(/docs coverage\s*\|\s*(\d+)\/(\d+)/i);
    expect(beforeMatch).not.toBeNull();

    const taskFiles = await fg("roadmap/phases/*/milestones/*/tasks/*/*.md", {
      cwd: process.cwd(),
      absolute: true,
      onlyFiles: true,
    });
    const taskPath = taskFiles[0];
    expect(taskPath).toBeDefined();

    const task = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
    const taskFrontmatter = task.data as {
      publicDocs?: string[];
    };

    const newDocPath = "docs/sensitive-report-exclusion-proof.md";
    await fs.ensureDir(path.join(process.cwd(), "docs"));
    await fs.writeFile(path.join(process.cwd(), newDocPath), "# proof\n", "utf8");
    await fs.writeFile(path.join(process.cwd(), ".env"), "TOKEN=secret\n", "utf8");

    const mergedDocs = [...(taskFrontmatter.publicDocs ?? []), newDocPath, ".env"];
    task.data = {
      ...task.data,
      publicDocs: [...new Set(mergedDocs)].sort((a, b) => a.localeCompare(b)),
    };
    await writeMarkdownWithFrontmatter(taskPath, task.data, task.content);

    const after = await reportGenerate();
    resultAssertions.assertSuccess(after);

    const afterMatch = after.data.text.match(/docs coverage\s*\|\s*(\d+)\/(\d+)/i);
    expect(afterMatch).not.toBeNull();

    const beforeExisting = Number(beforeMatch?.[1] ?? 0);
    const beforeTotal = Number(beforeMatch?.[2] ?? 0);
    const afterExisting = Number(afterMatch?.[1] ?? 0);
    const afterTotal = Number(afterMatch?.[2] ?? 0);

    expect(afterExisting).toBe(beforeExisting + 1);
    expect(afterTotal).toBe(beforeTotal + 1);
  }, 120_000);
});
