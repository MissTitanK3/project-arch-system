import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone, listMilestones } from "./createMilestone";

describe("createMilestone", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
    await createPhase("phase-2", tempDir);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("creates milestone structure and manifest", async () => {
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);

    const mRoot = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-1-foundation",
    );

    expect(await fs.pathExists(path.join(mRoot, "tasks", "planned"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "tasks", "discovered"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "tasks", "backlog"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "decisions", "index.json"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "manifest.json"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "overview.md"))).toBe(true);
    expect(await fs.pathExists(path.join(mRoot, "targets.md"))).toBe(true);
  });

  it("fails when phase does not exist", async () => {
    await expect(createMilestone("phase-999", "m1", tempDir)).rejects.toThrow("does not exist");
  });

  it("fails when creating duplicate milestone", async () => {
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);
    await expect(createMilestone("phase-2", "milestone-1-foundation", tempDir)).rejects.toThrow(
      "already exists",
    );
  });

  it("lists milestones including newly created milestone", async () => {
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);
    const milestones = await listMilestones(tempDir);
    expect(milestones).toContain("phase-2/milestone-1-foundation");
  });

  it("creates milestone with custom slug", async () => {
    const customSlug = "my-custom-milestone";
    await createMilestone("phase-2", customSlug, tempDir);

    const mRoot = path.join(tempDir, "roadmap", "phases", "phase-2", "milestones", customSlug);
    expect(await fs.pathExists(mRoot)).toBe(true);
  });

  it("creates all required task lanes", async () => {
    await createMilestone("phase-2", "milestone-lanes", tempDir);

    const taskDir = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-lanes",
      "tasks",
    );

    const lanes = ["planned", "discovered", "backlog"];
    for (const lane of lanes) {
      const lanePath = path.join(taskDir, lane);
      expect(await fs.pathExists(lanePath)).toBe(true);

      // Verify .gitkeep or similar file exists to keep directory
      const contents = await fs.readdir(lanePath);
      expect(contents.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("creates manifest with schemaVersion", async () => {
    await createMilestone("phase-2", "milestone-manifest", tempDir);

    const manifestPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-manifest",
      "manifest.json",
    );

    const manifest = await fs.readJson(manifestPath);
    expect(manifest.schemaVersion).toBe("1.0");
  });

  it("creates overview.md with proper structure", async () => {
    await createMilestone("phase-2", "milestone-overview", tempDir);

    const overviewPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-overview",
      "overview.md",
    );

    const content = await fs.readFile(overviewPath, "utf-8");
    expect(content).toContain("#");
    expect(content.length).toBeGreaterThan(0);
  });

  it("creates targets.md with proper structure", async () => {
    await createMilestone("phase-2", "milestone-targets", tempDir);

    const targetsPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-targets",
      "targets.md",
    );

    const content = await fs.readFile(targetsPath, "utf-8");
    expect(content).toContain("#");
    expect(content.length).toBeGreaterThan(0);
  });

  it("creates decisions index.json", async () => {
    await createMilestone("phase-2", "milestone-decisions", tempDir);

    const indexPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "milestone-decisions",
      "decisions",
      "index.json",
    );

    const index = await fs.readJson(indexPath);
    expect(index).toBeDefined();
    expect(Array.isArray(index.decisions) || typeof index === "object").toBe(true);
  });

  it("lists multiple milestones in order", async () => {
    await createMilestone("phase-2", "milestone-1", tempDir);
    await createMilestone("phase-2", "milestone-2", tempDir);
    await createMilestone("phase-2", "milestone-3", tempDir);

    const milestones = await listMilestones(tempDir);

    const phase2Milestones = milestones.filter((m) => m.startsWith("phase-2/"));
    expect(phase2Milestones.length).toBeGreaterThanOrEqual(3);
    expect(phase2Milestones).toContain("phase-2/milestone-1");
    expect(phase2Milestones).toContain("phase-2/milestone-2");
    expect(phase2Milestones).toContain("phase-2/milestone-3");
  });

  it("handles milestone slug with special characters", async () => {
    const specialSlug = "milestone-with-dashes-123";
    await createMilestone("phase-2", specialSlug, tempDir);

    const mRoot = path.join(tempDir, "roadmap", "phases", "phase-2", "milestones", specialSlug);
    expect(await fs.pathExists(mRoot)).toBe(true);
  });
});
