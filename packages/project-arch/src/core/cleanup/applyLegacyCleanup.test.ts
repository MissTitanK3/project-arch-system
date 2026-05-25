import path from "path";
import fs from "fs-extra";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import {
  reconfirmDeletionCandidates,
  executeDeletionCandidates,
  type DeletionQueueItem,
} from "./applyLegacyCleanup";

describe("core/cleanup/applyLegacyCleanup", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    process.chdir(originalCwd);
    await context.cleanup();
  }, 120_000);

  it("reconfirms candidates and reroutes exact-mirror when canonical counterpart is missing", async () => {
    const exactMirrorLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-1",
      "milestones",
      "m-1",
      "tasks",
      "planned",
      "001-sample.md",
    );
    await fs.ensureDir(path.dirname(exactMirrorLegacyPath));
    await fs.writeFile(exactMirrorLegacyPath, "# 001 Sample\n", "utf8");

    const emptyScaffoldLegacyPath = path.join(
      context.tempDir,
      "roadmap",
      "phases",
      "phase-2",
      "milestones",
      "m-2",
      "targets.md",
    );
    await fs.ensureDir(path.dirname(emptyScaffoldLegacyPath));
    await fs.writeFile(emptyScaffoldLegacyPath, "# Targets\n\n- TBD\n", "utf8");

    const reconfirmed = await reconfirmDeletionCandidates(
      context.tempDir,
      [
        {
          bucket: "exact-mirror",
          artifactKind: "task",
          normalizedKey: "task|phase-1|m-1|planned|001",
          relativePath: "roadmap/phases/phase-1/milestones/m-1/tasks/planned/001-sample.md",
          absolutePath: exactMirrorLegacyPath,
          pairingState: "paired",
          counterpartPath:
            "roadmap/projects/shared/phases/phase-1/milestones/m-1/tasks/planned/001-sample.md",
          reason: "matched",
        },
      ],
      [
        {
          bucket: "empty-scaffold",
          artifactKind: "milestone-targets",
          normalizedKey: "milestone-targets|phase-2|m-2||",
          relativePath: "roadmap/phases/phase-2/milestones/m-2/targets.md",
          absolutePath: emptyScaffoldLegacyPath,
          pairingState: "legacy-only",
          reason: "empty scaffold",
        },
      ],
    );

    expect(reconfirmed.deletionQueue).toHaveLength(1);
    expect(reconfirmed.deletionQueue[0]?.bucket).toBe("empty-scaffold");
    expect(reconfirmed.reroutedManualReview).toHaveLength(1);
    expect(reconfirmed.reroutedManualReview[0]?.bucket).toBe("manual-review.pre-condition-failed");
    expect(reconfirmed.skippedMissingLegacy).toHaveLength(0);
  });

  it("deletes only queued exact-mirror and empty-scaffold artifacts", async () => {
    const exactMirrorPath = path.join(
      context.tempDir,
      "roadmap/phases/p-a/milestones/m-a/overview.md",
    );
    const emptyScaffoldPath = path.join(
      context.tempDir,
      "roadmap/phases/p-b/milestones/m-b/targets.md",
    );
    await fs.ensureDir(path.dirname(exactMirrorPath));
    await fs.ensureDir(path.dirname(emptyScaffoldPath));
    await fs.writeFile(exactMirrorPath, "# Overview\n", "utf8");
    await fs.writeFile(emptyScaffoldPath, "# Targets\n\n- TBD\n", "utf8");

    const queue: DeletionQueueItem[] = [
      {
        bucket: "exact-mirror",
        artifactKind: "milestone-overview",
        normalizedKey: "milestone-overview|p-a|m-a||",
        relativePath: "roadmap/phases/p-a/milestones/m-a/overview.md",
        absolutePath: exactMirrorPath,
        pairingState: "paired",
        counterpartPath: "roadmap/projects/shared/phases/p-a/milestones/m-a/overview.md",
        reason: "matched",
      },
      {
        bucket: "empty-scaffold",
        artifactKind: "milestone-targets",
        normalizedKey: "milestone-targets|p-b|m-b||",
        relativePath: "roadmap/phases/p-b/milestones/m-b/targets.md",
        absolutePath: emptyScaffoldPath,
        pairingState: "legacy-only",
        reason: "empty scaffold",
      },
    ];

    const result = await executeDeletionCandidates(queue);

    expect(result.failed).toHaveLength(0);
    expect(result.deletedExactMirror).toHaveLength(1);
    expect(result.deletedEmptyScaffold).toHaveLength(1);
    expect(await fs.pathExists(exactMirrorPath)).toBe(false);
    expect(await fs.pathExists(emptyScaffoldPath)).toBe(false);
  });
});
