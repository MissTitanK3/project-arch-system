import path from "path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { createTempDir, createTestProject, resultAssertions } from "../test/helpers";
import { nextResolve } from "./next";

describe("sdk/next", () => {
  const originalCwd = process.cwd();

  it("returns needs_init for an uninitialized repository", async () => {
    const context = await createTempDir();
    try {
      const result = await nextResolve({ cwd: context.tempDir });
      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBe("needs_init");
      expect(result.data.recommendedCommand).toBe("pa init");
    } finally {
      await context.cleanup();
    }
  });

  it("returns needs_verification for initialized repo without reconciliation evidence", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const result = await nextResolve({ cwd: context.tempDir });
      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBe("needs_verification");
      expect(result.data.recommendedCommand).toBe("pa report");
    } finally {
      await context.cleanup();
    }
  });

  it("returns healthy_noop when evidence exists and checks are clean", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const reconcileDir = path.join(context.tempDir, ".project-arch", "reconcile");
      await fs.ensureDir(reconcileDir);
      await fs.writeJson(path.join(reconcileDir, "001-2026-03-22.json"), {
        schemaVersion: "1.0",
        id: "001-2026-03-22",
        type: "local-reconciliation",
        status: "reconciliation complete",
        taskId: "001",
        date: "2026-03-22",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      });

      const result = await nextResolve({ cwd: context.tempDir });
      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBe("healthy_noop");
      expect(result.data.recommendedCommand).toBe("none");
    } finally {
      await context.cleanup();
    }
  });
});
