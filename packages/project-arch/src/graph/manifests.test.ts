import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { initializeProject } from "../core/init/initializeProject";
import { createPhase } from "../core/phases/createPhase";
import { createMilestone } from "../core/milestones/createMilestone";
import {
  appendDecisionToIndex,
  ensureDecisionIndex,
  loadDecisionIndex,
  loadPhaseManifest,
  resolvePhaseProjectId,
  savePhaseManifest,
  loadMilestoneManifest,
  saveMilestoneManifest,
  milestoneDecisionIndexDir,
  phaseDecisionIndexDir,
  projectDecisionIndexDir,
} from "./manifests";

describe.sequential("graph/manifests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "graph-manifests-test-"));
    await initializeProject({ template: "nextjs-turbo", pm: "pnpm" }, tempDir);
  }, 120_000);

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("should ensure/load/append decision index with sorted unique ids", async () => {
    const indexDir = projectDecisionIndexDir(tempDir);

    await ensureDecisionIndex(indexDir);
    await appendDecisionToIndex(indexDir, "project:20260307:zeta");
    await appendDecisionToIndex(indexDir, "project:20260307:alpha");
    await appendDecisionToIndex(indexDir, "project:20260307:alpha");

    const index = await loadDecisionIndex(indexDir);
    expect(index.schemaVersion).toBe("1.0");
    expect(index.decisions).toEqual(["project:20260307:alpha", "project:20260307:zeta"]);
  }, 120_000);

  it("should save and load phase manifest through re-exported API", async () => {
    const current = await loadPhaseManifest(tempDir);
    const next = {
      ...current,
      phases: [
        ...current.phases,
        { id: "phase-x", projectId: "storefront", createdAt: "2026-03-07" },
      ],
      activeProject: "storefront",
      activePhase: "phase-x",
    };

    await savePhaseManifest(next, tempDir);

    const reloaded = await loadPhaseManifest(tempDir);
    expect(reloaded.activeProject).toBe("storefront");
    expect(reloaded.activePhase).toBe("phase-x");
    expect(reloaded.phases.some((phase) => phase.id === "phase-x")).toBe(true);
    expect(resolvePhaseProjectId(reloaded, "phase-x")).toBe("storefront");
  }, 120_000);

  it("should save and load milestone manifest through re-exported API", async () => {
    const phaseId = "manifest-phase";
    const milestoneId = "manifest-milestone";

    await createPhase(phaseId, tempDir);
    await createMilestone(phaseId, milestoneId, tempDir);

    const manifest = await loadMilestoneManifest(phaseId, milestoneId, tempDir);
    const updated = {
      ...manifest,
      updatedAt: "2026-03-08",
    };

    await saveMilestoneManifest(updated, phaseId, milestoneId, tempDir);

    const reloaded = await loadMilestoneManifest(phaseId, milestoneId, tempDir);
    expect(reloaded.id).toBe(milestoneId);
    expect(reloaded.phaseId).toBe(phaseId);
    expect(reloaded.updatedAt).toBe("2026-03-08");
  }, 120_000);

  it("should provide phase/milestone/project decision index directories", async () => {
    const phaseId = "index-phase";
    const milestoneId = "index-milestone";

    const projectDir = projectDecisionIndexDir(tempDir);
    const phaseDir = phaseDecisionIndexDir(phaseId, tempDir);
    const milestoneDir = milestoneDecisionIndexDir(phaseId, milestoneId, tempDir);

    expect(projectDir.endsWith(path.join("roadmap", "decisions"))).toBe(true);
    expect(phaseDir.endsWith(path.join("roadmap", "phases", phaseId, "decisions"))).toBe(true);
    expect(
      milestoneDir.endsWith(
        path.join("roadmap", "phases", phaseId, "milestones", milestoneId, "decisions"),
      ),
    ).toBe(true);
  });
});
