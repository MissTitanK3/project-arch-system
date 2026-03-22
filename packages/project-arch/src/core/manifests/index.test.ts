import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { writeJsonDeterministic } from "../../utils/fs";
import {
  defaultMilestoneManifest,
  loadDecisionIndex,
  loadMilestoneManifest,
  milestoneManifestPath,
  projectDecisionIndexDir,
} from "./index";

describe.sequential("core/manifests/index", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("throws for decision index with invalid schema version", async () => {
    const indexDir = projectDecisionIndexDir(tempDir);
    await writeJsonDeterministic(path.join(indexDir, "index.json"), {
      schemaVersion: "2.0",
      decisions: [],
    });

    await expect(loadDecisionIndex(indexDir)).rejects.toThrow("Invalid decision index");
  }, 120_000);

  it("throws for decision index with non-string decision IDs", async () => {
    const indexDir = projectDecisionIndexDir(tempDir);
    await writeJsonDeterministic(path.join(indexDir, "index.json"), {
      schemaVersion: "1.0",
      decisions: ["project:20260307:valid", 42],
    });

    await expect(loadDecisionIndex(indexDir)).rejects.toThrow("Invalid decision id entry");
  }, 120_000);

  it("returns milestone manifest path for phase and milestone", async () => {
    const manifestPath = await milestoneManifestPath("phase-a", "milestone-a", tempDir);

    expect(
      manifestPath.endsWith(path.join("phase-a", "milestones", "milestone-a", "manifest.json")),
    ).toBe(true);
  });

  it("creates default milestone manifest payload", () => {
    const manifest = defaultMilestoneManifest("phase-b", "milestone-b");

    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.phaseId).toBe("phase-b");
    expect(manifest.id).toBe("milestone-b");
    expect(typeof manifest.createdAt).toBe("string");
    expect(typeof manifest.updatedAt).toBe("string");
  });

  it("throws when milestone manifest file is missing", async () => {
    const missingPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-z",
      "milestones",
      "milestone-z",
      "manifest.json",
    );

    await expect(loadMilestoneManifest("phase-z", "milestone-z", tempDir)).rejects.toThrow(
      `Missing milestone manifest: ${missingPath}`,
    );
  }, 120_000);

  it("throws when milestone manifest has invalid schema", async () => {
    const manifestPath = path.join(
      tempDir,
      "roadmap",
      "phases",
      "phase-invalid",
      "milestones",
      "milestone-invalid",
      "manifest.json",
    );

    await writeJsonDeterministic(manifestPath, {
      schemaVersion: "1.0",
      id: "milestone-invalid",
    });

    await expect(
      loadMilestoneManifest("phase-invalid", "milestone-invalid", tempDir),
    ).rejects.toThrow();
  }, 120_000);
});
