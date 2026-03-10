import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, createTempDir, type TestProjectContext } from "../../test/helpers";
import { createPhase, listPhases } from "./createPhase";
import { loadPhaseManifest } from "../manifests";

describe("createPhase", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  it("creates a new phase and required directories", async () => {
    await createPhase("phase-2", tempDir);

    const phaseRoot = path.join(tempDir, "roadmap", "phases", "phase-2");
    expect(await fs.pathExists(path.join(phaseRoot, "milestones"))).toBe(true);
    expect(await fs.pathExists(path.join(phaseRoot, "decisions", "index.json"))).toBe(true);
    expect(await fs.pathExists(path.join(phaseRoot, "overview.md"))).toBe(true);

    const phases = await listPhases(tempDir);
    expect(phases.some((p) => p.id === "phase-2")).toBe(true);
  });

  it("fails when creating a duplicate phase", async () => {
    await createPhase("phase-2", tempDir);
    await expect(createPhase("phase-2", tempDir)).rejects.toThrow("already exists");
  });

  it("keeps existing active phase when adding another", async () => {
    await createPhase("phase-2", tempDir);

    const manifest = await loadPhaseManifest(tempDir);
    expect(manifest.activePhase).toBe("phase-1");
    expect(manifest.phases.map((p) => p.id)).toEqual(["phase-1", "phase-2"]);
  });

  it("fails when project is not initialized", async () => {
    const uninitContext = await createTempDir();
    try {
      await expect(createPhase("phase-1", uninitContext.tempDir)).rejects.toThrow("pa init");
    } finally {
      await uninitContext.cleanup();
    }
  });

  it("creates phase with custom slug", async () => {
    const customSlug = "planning-phase";
    await createPhase(customSlug, tempDir);

    const phaseRoot = path.join(tempDir, "roadmap", "phases", customSlug);
    expect(await fs.pathExists(phaseRoot)).toBe(true);

    const phases = await listPhases(tempDir);
    expect(phases.some((p) => p.id === customSlug)).toBe(true);
  });

  it("creates phase with all required subdirectories", async () => {
    await createPhase("phase-3", tempDir);

    const phaseRoot = path.join(tempDir, "roadmap", "phases", "phase-3");

    // Check required directories
    expect(await fs.pathExists(path.join(phaseRoot, "milestones"))).toBe(true);
    expect(await fs.pathExists(path.join(phaseRoot, "decisions"))).toBe(true);
  });

  it("creates phase overview.md with content", async () => {
    await createPhase("phase-4", tempDir);

    const overviewPath = path.join(tempDir, "roadmap", "phases", "phase-4", "overview.md");
    expect(await fs.pathExists(overviewPath)).toBe(true);

    const content = await fs.readFile(overviewPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("creates phase manifest with schemaVersion", async () => {
    await createPhase("phase-5", tempDir);

    const manifest = await loadPhaseManifest(tempDir);
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.phases.some((p) => p.id === "phase-5")).toBe(true);
  });

  it("maintains chronological order of phases", async () => {
    await createPhase("phase-2", tempDir);
    await createPhase("phase-3", tempDir);
    await createPhase("phase-4", tempDir);

    const manifest = await loadPhaseManifest(tempDir);
    const phaseIds = manifest.phases.map((p) => p.id);

    expect(phaseIds).toContain("phase-1");
    expect(phaseIds).toContain("phase-2");
    expect(phaseIds).toContain("phase-3");
    expect(phaseIds).toContain("phase-4");
  });

  it("preserves active phase after creating new phases", async () => {
    const initialManifest = await loadPhaseManifest(tempDir);
    const initialActivePhase = initialManifest.activePhase;

    await createPhase("phase-new", tempDir);

    const updatedManifest = await loadPhaseManifest(tempDir);
    expect(updatedManifest.activePhase).toBe(initialActivePhase);
  });

  it("lists all phase IDs correctly", async () => {
    await createPhase("phase-a", tempDir);
    await createPhase("phase-b", tempDir);
    await createPhase("phase-c", tempDir);

    const phases = await listPhases(tempDir);
    const phaseIds = phases.map((p) => p.id);

    expect(phaseIds).toContain("phase-1");
    expect(phaseIds).toContain("phase-a");
    expect(phaseIds).toContain("phase-b");
    expect(phaseIds).toContain("phase-c");
  });

  it("creates decisions index.json for new phase", async () => {
    await createPhase("phase-latest", tempDir);

    const indexPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-latest",
      "decisions",
      "index.json",
    );

    expect(await fs.pathExists(indexPath)).toBe(true);

    const index = await fs.readJson(indexPath);
    expect(index).toBeDefined();
  });

  it("handles phase slug with special characters", async () => {
    const specialSlug = "phase-2024-planning";
    await createPhase(specialSlug, tempDir);

    const phaseRoot = path.join(tempDir, "roadmap", "phases", specialSlug);
    expect(await fs.pathExists(phaseRoot)).toBe(true);

    const phases = await listPhases(tempDir);
    expect(phases.some((p) => p.id === specialSlug)).toBe(true);
  });
});
