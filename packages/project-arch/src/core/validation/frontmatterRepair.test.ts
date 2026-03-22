import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { lintFrontmatter } from "./frontmatter";
import { normalizeFrontmatter, repairFrontmatter } from "./frontmatterRepair";

describe("core/validation/frontmatterRepair", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("repairFrontmatter fixes tabs, trailing whitespace, and risky plain scalars", async () => {
    const taskPath = path.join(context.tempDir, "feedback/tasks/002-fixable.md");
    await fs.ensureDir(path.dirname(taskPath));
    await fs.writeFile(
      taskPath,
      `---
schemaVersion: 1.0   
id: 002
slug: fixable-task   
title: Fixable Task
lane: planned
status: todo
createdAt: 2026-03-09
updatedAt: 2026-03-09
discoveredFromTask: null
tags:
\t- lint   
codeTargets: []
publicDocs: []
decisions: []
completionCriteria: []
---

# Fixable Task
`,
      "utf8",
    );

    const preview = await repairFrontmatter({ cwd: context.tempDir, write: false });
    expect(preview.changedFiles).toBe(1);
    expect(preview.appliedFiles).toBe(0);
    expect(preview.manualFiles).toBe(0);
    expect(preview.fileResults[0]?.diff).toContain('+schemaVersion: "1.0"');

    const applied = await repairFrontmatter({ cwd: context.tempDir, write: true });
    expect(applied.appliedFiles).toBe(1);

    const linted = await lintFrontmatter({ cwd: context.tempDir });
    expect(linted.ok).toBe(true);
    expect(linted.diagnostics).toHaveLength(0);
  });

  it("normalizeFrontmatter is idempotent and rewrites canonical key ordering", async () => {
    const taskPath = path.join(context.tempDir, "feedback/tasks/003-normalize.md");
    await fs.ensureDir(path.dirname(taskPath));
    await fs.writeFile(
      taskPath,
      `---
slug: normalize-me
title: Normalize Me
schemaVersion: "1.0"
status: in-progress
lane: planned
id: "003"
updatedAt: "2026-03-09"
createdAt: "2026-03-09"
discoveredFromTask: null
codeTargets: []
tags: []
publicDocs: []
decisions: []
completionCriteria: []
---

# Normalize Me
`,
      "utf8",
    );

    const first = await normalizeFrontmatter({ cwd: context.tempDir, write: true });
    expect(first.changedFiles).toBe(1);
    expect(first.manualFiles).toBe(0);

    const contentAfterFirstRun = await fs.readFile(taskPath, "utf8");
    expect(contentAfterFirstRun).toMatch(
      /schemaVersion:\s['"]1\.0['"]\nid:\s['"]003['"]\nslug: normalize-me/,
    );
    expect(contentAfterFirstRun).toContain("status: in_progress");

    const second = await normalizeFrontmatter({ cwd: context.tempDir, write: true });
    expect(second.changedFiles).toBe(0);
    expect(second.manualFiles).toBe(0);
  });

  it("normalizeFrontmatter reports files that still require manual intervention", async () => {
    const taskPath = path.join(context.tempDir, "feedback/tasks/004-manual.md");
    await fs.ensureDir(path.dirname(taskPath));
    await fs.writeFile(
      taskPath,
      `---
schemaVersion: "1.0"
id: "004"
slug: manual-fix
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

# Manual
`,
      "utf8",
    );

    const result = await normalizeFrontmatter({ cwd: context.tempDir, write: false });
    expect(result.manualFiles).toBe(1);
    expect(result.fileResults[0]?.requiresManualIntervention).toBe(true);
    expect(result.fileResults[0]?.diagnostics.some((d) => d.code === "MISSING_REQUIRED_KEY")).toBe(
      true,
    );
    expect(result.fileResults[0]?.suggestion).toContain("Run pa explain");
  });
});
