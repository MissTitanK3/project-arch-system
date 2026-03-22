import path from "path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { createTempDir, createTestProject } from "../../test/helpers";
import { runDoctorHealth } from "./health";

describe("core/doctor/health", () => {
  const originalCwd = process.cwd();

  it("reports healthy status for an initialized repository", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const result = await runDoctorHealth({ cwd: context.tempDir });
      expect(result.status).toBe("healthy");
      expect(result.issues).toHaveLength(0);
    } finally {
      await context.cleanup();
    }
  });

  it("reports missing required roots in an empty workspace", async () => {
    const context = await createTempDir();
    try {
      const result = await runDoctorHealth({ cwd: context.tempDir });
      expect(result.status).toBe("broken");
      expect(result.issues.some((issue) => issue.code === "PAH001")).toBe(true);
    } finally {
      await context.cleanup();
    }
  });

  it("repairs lane, decision index, and graph artifacts when requested", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const plannedLane = path.join(
        context.tempDir,
        "roadmap",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "tasks",
        "planned",
      );
      const decisionIndex = path.join(context.tempDir, "roadmap", "decisions", "index.json");
      const graphJson = path.join(context.tempDir, ".arch", "graph.json");

      await fs.remove(plannedLane);
      await fs.remove(decisionIndex);
      await fs.remove(graphJson);

      const before = await runDoctorHealth({ cwd: context.tempDir });
      expect(before.status).toBe("broken");
      expect(before.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["PAH006", "PAH007", "PAH009"]),
      );

      const repaired = await runDoctorHealth({ cwd: context.tempDir, repair: true });
      expect(repaired.repairedCount).toBeGreaterThan(0);

      const after = await runDoctorHealth({ cwd: context.tempDir });
      expect(after.status).toBe("healthy");
      expect(after.issues).toHaveLength(0);
      expect(await fs.pathExists(plannedLane)).toBe(true);
      expect(await fs.pathExists(decisionIndex)).toBe(true);
      expect(await fs.pathExists(graphJson)).toBe(true);
    } finally {
      await context.cleanup();
    }
  });

  it("keeps malformed local config as unrepaired error", async () => {
    const context = await createTestProject(originalCwd, undefined, { setCwd: false });
    try {
      const configPath = path.join(context.tempDir, ".project-arch", "reconcile.config.json");
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeFile(configPath, "{ invalid", "utf8");

      const repaired = await runDoctorHealth({ cwd: context.tempDir, repair: true });
      expect(repaired.status).toBe("broken");
      expect(repaired.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "PAH011", repairable: false, severity: "error" }),
        ]),
      );
    } finally {
      await context.cleanup();
    }
  });
});
