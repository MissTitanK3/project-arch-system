import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { registerSurfaces } from "./registerSurfaces";

describe("registerSurfaces - Scale Regression Tests", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: true });
    tempDir = context.tempDir;

    // Seed tracked prefix for task
    const taskPath = path.join(
      tempDir,
      "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
    );
    await fs.ensureDir(path.dirname(taskPath));

    const taskContent = [
      "---",
      'schemaVersion: "1.0"',
      'id: "001"',
      'slug: "define-project-overview"',
      'title: "Define Project Overview"',
      'lane: "planned"',
      'status: "todo"',
      'createdAt: "2026-03-09"',
      'updatedAt: "2026-03-09"',
      "discoveredFromTask: null",
      "tags: []",
      "codeTargets:",
      "  - architecture",
      "publicDocs: []",
      "decisions: []",
      "completionCriteria: []",
      "---",
      "",
      "# Define Project Overview",
      "",
      "## codeTargets",
      "<!-- AUTO_PA_CT_PREFIX -->",
      "- architecture",
      "",
      "<!-- AUTO_PA_CT_SUFFIX -->",
      "",
    ].join("\n");

    await fs.writeFile(taskPath, taskContent);
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should handle large codeTargets list (200+ paths) without duplicates", async () => {
    // Create 200 untracked files
    const fileCount = 200;
    for (let i = 1; i <= fileCount; i++) {
      const moduleId = String(i).padStart(3, "0");
      const dirPath = path.join(tempDir, "packages", `module-${moduleId}`, "src");
      await fs.ensureDir(dirPath);
      await fs.writeFile(path.join(dirPath, "index.ts"), `// module-${moduleId}`);
    }

    // Register all paths (registerSurfaces retrieves untracked from check diagnostics which has a 50-item limit)
    const result = await registerSurfaces({
      phase: "phase-1",
      milestone: "milestone-1-setup",
      taskId: "001",
      fromCheck: true,
      include: ["packages/**"],
      exclude: [],
      dryRun: false,
      cwd: tempDir,
    });

    // Verify behavior for large untracked set (limited by check diagnostic truncation)
    expect(result.addedPaths.length).toBeGreaterThan(0);
    expect(result.addedPaths.length).toBeLessThanOrEqual(50);

    // Verify no duplicates in added paths
    const uniquePaths = new Set(result.addedPaths);
    expect(uniquePaths.size).toBe(result.addedPaths.length);

    // Verify task was updated with paths
    const taskPath = path.join(
      tempDir,
      "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
    );
    const updatedContent = await fs.readFile(taskPath, "utf8");
    expect(updatedContent).toContain("module-");

    // Debug: verify paths were actually added to the task
    const updatedLines = updatedContent.split("\n");
    const targetLines = updatedLines.filter((line) => line.includes("module-"));
    expect(targetLines.length).toBeGreaterThan(0);

    // Verify the registration was logged with correct metadata
    expect(result.taskPath).toContain("001-define-project-overview.md");
    expect(result.skippedPaths.length).toBe(0);
  }, 120_000);
});
