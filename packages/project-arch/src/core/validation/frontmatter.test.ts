import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { lintFrontmatter } from "./frontmatter";

describe("core/validation/frontmatter", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("reports file and line diagnostics for schema and indentation issues", async () => {
    const taskPath = path.join(context.tempDir, "feedback/tasks/001-invalid.md");
    await fs.ensureDir(path.dirname(taskPath));
    await fs.writeFile(
      taskPath,
      `---
schemaVersion: "2.0"
id: "001"
slug: "invalid-task"
lane: "planned"
status: "todo"
createdAt: "2026-03-09"
updatedAt: "2026-03-09"
discoveredFromTask: null
tags:
\t- "lint"
codeTargets: []
publicDocs: []
decisions: []
completionCriteria: []
---

# Invalid Task
`,
      "utf8",
    );

    const result = await lintFrontmatter({ cwd: context.tempDir });

    expect(result.ok).toBe(false);
    expect(result.scannedFiles).toBe(1);
    expect(result.diagnostics.some((d) => d.code === "TAB_INDENTATION")).toBe(true);

    for (const issue of result.diagnostics) {
      expect(issue.path).toBe("feedback/tasks/001-invalid.md");
      expect(issue.line).toBeGreaterThan(0);
    }
  });

  it("detects missing required keys by artifact type", async () => {
    const taskPath = path.join(context.tempDir, "feedback/tasks/001-missing-title.md");
    await fs.ensureDir(path.dirname(taskPath));
    await fs.writeFile(
      taskPath,
      `---
schemaVersion: "2.0"
id: "001"
slug: "missing-title"
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

# Missing title
`,
      "utf8",
    );

    const result = await lintFrontmatter({ cwd: context.tempDir });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MISSING_REQUIRED_KEY")).toBe(true);
    expect(result.diagnostics.some((d) => d.path === "feedback/tasks/001-missing-title.md")).toBe(
      true,
    );
  });

  it("detects YAML key type violations", async () => {
    const decisionPath = path.join(context.tempDir, "roadmap/decisions/project/001-key-type.md");
    await fs.ensureDir(path.dirname(decisionPath));
    await fs.writeFile(
      decisionPath,
      `---
schemaVersion: "2.0"
type: "decision"
id: "project:001:key-type"
title: "Key Type"
status: "proposed"
scope:
  kind: "project"
drivers: []
decision:
  summary: "test"
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks: []
  codeTargets: []
  publicDocs: []
123: "non-string-key"
---

# Decision
`,
      "utf8",
    );

    const result = await lintFrontmatter({ cwd: context.tempDir });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "KEY_TYPE")).toBe(true);
  });

  it("applies --fix for all safe auto-fixable frontmatter issues", async () => {
    const taskPath = path.join(context.tempDir, "feedback/tasks/002-fixable.md");
    await fs.ensureDir(path.dirname(taskPath));
    await fs.writeFile(
      taskPath,
      `---
schemaVersion: 2.0   
id: 002
slug: "fixable-task"   
title: "Fixable Task"
lane: planned
status: todo
createdAt: 2026-03-09
updatedAt: 2026-03-09
discoveredFromTask: null
tags:
\t- "lint"   
codeTargets: []
publicDocs: []
decisions: []
completionCriteria: []
---

# Fixable Task
`,
      "utf8",
    );

    const result = await lintFrontmatter({ cwd: context.tempDir, fix: true });
    const updated = await fs.readFile(taskPath, "utf8");

    expect(result.fixedFiles).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(updated).toContain('  - "lint"');
    expect(updated).not.toContain("\t-");
    expect(updated).toContain('schemaVersion: "2.0"');
    expect(updated).toContain('id: "002"');
    expect(updated).toContain("lane: planned");
    expect(updated).toContain("status: todo");
    expect(updated).not.toContain("schemaVersion: 2.0   ");
  });
});
