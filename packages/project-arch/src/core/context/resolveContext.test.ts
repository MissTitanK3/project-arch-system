import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempDir, createTestProject, type TestProjectContext } from "../../test/helpers";
import { loadPhaseManifest, savePhaseManifest } from "../../graph/manifests";
import { resolveContext } from "./resolveContext";

describe.sequential("core/context/resolveContext", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should resolve active phase, milestone, and task context", async () => {
    const resolved = await resolveContext(tempDir);

    expect(resolved.version).toBe("1.0");
    expect(resolved.projectRoot).toBe(tempDir);
    expect(resolved.active.phase.id).toBe("phase-1");
    expect(resolved.active.milestone.id).toBe("milestone-1-setup");
    expect(resolved.active.task.id).toContain("001-define-project-overview");
    expect(resolved.active.task.path).toContain(
      "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
    );
    expect(resolved.recommended?.action.command).toBeDefined();
  }, 120_000);

  it("should fail when active milestone is not set", async () => {
    const manifest = await loadPhaseManifest(tempDir);
    await savePhaseManifest({ ...manifest, activeMilestone: null }, tempDir);

    await expect(resolveContext(tempDir)).rejects.toThrow(/no active milestone/i);
  });

  it("should fail when repository is not initialized", async () => {
    const emptyContext = await createTempDir();
    try {
      await expect(resolveContext(emptyContext.tempDir)).rejects.toThrow(/roadmap not found/i);
    } finally {
      await emptyContext.cleanup();
    }
  });

  it("should include a recommended task when another actionable task exists", async () => {
    const resolved = await resolveContext(tempDir);
    expect(resolved.recommended?.task?.id).toContain("002-define-project-goals");
  });
});
