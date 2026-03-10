import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lintFrontmatterRun } from "./lint";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";

describe("sdk/lint", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns structured lint results", async () => {
    const filePath = path.join(context.tempDir, "feedback/tasks/003-sdk-lint.md");
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(
      filePath,
      `---
schemaVersion: "1.0"
id: "003"
slug: "sdk-lint"
title: "SDK Lint"
lane: "planned"
status: "todo"
createdAt: "2026-03-09"
updatedAt: "2026-03-09"
discoveredFromTask: null
tags: []
codeTargets: []
publicDocs: []
decisions: []
completionCriteria: []
---

# SDK lint
`,
      "utf8",
    );

    const result = await lintFrontmatterRun({ cwd: context.tempDir });

    resultAssertions.assertSuccess(result);
    expect(result.data.ok).toBe(true);
    expect(result.data.scannedFiles).toBe(1);
    expect(result.data.fixedFiles).toBe(0);
    expect(Array.isArray(result.data.diagnostics)).toBe(true);
  });
});
