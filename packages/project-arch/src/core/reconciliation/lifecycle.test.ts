import path from "path";
import fs from "fs-extra";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compactReconciliationArtifacts,
  listLatestReconciliationArtifacts,
  pruneReconciliationArtifacts,
  refreshCanonicalReconciliationPointers,
} from "./lifecycle";

async function seedReport(input: {
  cwd: string;
  taskId: string;
  date: string;
  runId?: string;
  status?: "no reconciliation needed" | "reconciliation suggested" | "reconciliation required";
}): Promise<void> {
  const status = input.status ?? "reconciliation suggested";
  const reconcileDir = path.join(input.cwd, ".project-arch", "reconcile");
  await fs.ensureDir(reconcileDir);

  const report = {
    schemaVersion: "2.0",
    id: `reconcile-${input.taskId}-${input.date}`,
    type: "local-reconciliation",
    status,
    taskId: input.taskId,
    runId: input.runId,
    date: input.date,
    changedFiles: [],
    affectedAreas: [],
    missingUpdates: [],
    missingTraceLinks: [],
    decisionCandidates: [],
    standardsGaps: [],
    proposedActions: [],
    feedbackCandidates: [],
  };

  await fs.writeJson(path.join(reconcileDir, `${input.taskId}-${input.date}.json`), report, {
    spaces: 2,
  });
  await fs.writeFile(path.join(reconcileDir, `${input.taskId}-${input.date}.md`), "# report\n");
}

describe("core/reconciliation/lifecycle", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "reconcile-lifecycle-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("returns only latest reconciliation record per task", async () => {
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-20" });
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-22" });
    await seedReport({ cwd: tempDir, taskId: "002", date: "2026-03-21" });

    const latest = await listLatestReconciliationArtifacts(tempDir);

    expect(latest).toHaveLength(2);
    expect(latest.map((entry) => `${entry.report.taskId}:${entry.report.date}`)).toEqual([
      "001:2026-03-22",
      "002:2026-03-21",
    ]);
  });

  it("keeps one record per task after prune apply", async () => {
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-20" });
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-22" });
    await seedReport({ cwd: tempDir, taskId: "002", date: "2026-03-21" });

    const dryRun = await pruneReconciliationArtifacts({ cwd: tempDir });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.staleRecords).toBe(1);

    const applied = await pruneReconciliationArtifacts({ cwd: tempDir, apply: true });
    expect(applied.dryRun).toBe(false);
    expect(applied.staleRecords).toBe(1);

    const reconcileDir = path.join(tempDir, ".project-arch", "reconcile");
    const jsonFiles = (await fs.readdir(reconcileDir)).filter((name) => name.endsWith(".json"));
    expect(jsonFiles.sort()).toEqual(["001-2026-03-22.json", "002-2026-03-21.json"]);
  });

  it("moves stale records into dated archive on compact apply", async () => {
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-20" });
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-22" });

    const result = await compactReconciliationArtifacts({ cwd: tempDir, apply: true });

    expect(result.dryRun).toBe(false);
    expect(result.movedRecords).toBe(1);

    const reconcileDir = path.join(tempDir, ".project-arch", "reconcile");
    const topLevelJson = (await fs.readdir(reconcileDir)).filter((name) => name.endsWith(".json"));
    expect(topLevelJson).toEqual(["001-2026-03-22.json"]);

    const archiveDir = path.join(tempDir, result.archiveDir);
    expect(await fs.pathExists(path.join(archiveDir, "001-2026-03-20.json"))).toBe(true);
    expect(await fs.pathExists(path.join(archiveDir, "001-2026-03-20.md"))).toBe(true);
  });

  it("writes canonical per-task pointers when lifecycle config enables them", async () => {
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-20", runId: "run-old" });
    await seedReport({ cwd: tempDir, taskId: "001", date: "2026-03-22", runId: "run-new" });

    const configPath = path.join(tempDir, ".project-arch", "reconcile.config.json");
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, {
      extends: "default",
      lifecycle: {
        mode: "append-only-history",
        writeCanonicalPointers: true,
      },
    });

    await refreshCanonicalReconciliationPointers(tempDir);

    const pointerPath = path.join(tempDir, ".project-arch", "reconcile", "latest", "001.json");
    expect(await fs.pathExists(pointerPath)).toBe(true);

    const pointer = await fs.readJson(pointerPath);
    expect(pointer.taskId).toBe("001");
    expect(pointer.latest.date).toBe("2026-03-22");
    expect(pointer.latest.runId).toBe("run-new");
  });
});
