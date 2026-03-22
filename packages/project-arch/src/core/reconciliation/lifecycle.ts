import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import {
  ReconciliationReport,
  reconciliationReportSchema,
} from "../../schemas/reconciliationReport";
import { ReconciliationLifecycleMode } from "../../schemas/reconcileConfig";
import { loadReconcileConfig } from "./triggerDetection";
import { currentDateISO } from "../../utils/date";
import { assertWithinRoot } from "../../utils/assertWithinRoot";
import {
  assertRealpathWithinRoot,
  filterGlobPathsBySymlinkPolicy,
} from "../../utils/symlinkPolicy";

const RECONCILE_DIR = ".project-arch/reconcile";
const RECONCILE_LATEST_DIR = ".project-arch/reconcile/latest";

export interface LocalReconciliationArtifact {
  report: ReconciliationReport;
  jsonPath: string;
  markdownPath: string | null;
  relativeJsonPath: string;
  relativeMarkdownPath: string | null;
}

export interface ReconciliationLifecycleSettings {
  mode: ReconciliationLifecycleMode;
  writeCanonicalPointers: boolean;
}

export interface ReconciliationTaskDuplicate {
  taskId: string;
  files: string[];
}

export interface ReconciliationPruneResult {
  dryRun: boolean;
  kept: number;
  staleRecords: number;
  removedFiles: string[];
}

export interface ReconciliationCompactResult {
  dryRun: boolean;
  archiveDate: string;
  archiveDir: string;
  movedRecords: number;
  movedFiles: Array<{ from: string; to: string }>;
}

function reconcileDir(cwd: string): string {
  return path.join(cwd, RECONCILE_DIR);
}

function newestByDateAndPath(
  a: LocalReconciliationArtifact,
  b: LocalReconciliationArtifact,
): LocalReconciliationArtifact {
  if (a.report.date > b.report.date) {
    return a;
  }
  if (a.report.date < b.report.date) {
    return b;
  }
  return a.relativeJsonPath > b.relativeJsonPath ? a : b;
}

export async function loadReconciliationLifecycleSettings(
  cwd = process.cwd(),
): Promise<ReconciliationLifecycleSettings> {
  const config = await loadReconcileConfig(cwd);
  return {
    mode: config?.lifecycle.mode ?? "append-only-history",
    writeCanonicalPointers: config?.lifecycle.writeCanonicalPointers ?? false,
  };
}

export async function listLocalReconciliationArtifacts(
  cwd = process.cwd(),
): Promise<LocalReconciliationArtifact[]> {
  const files = await fg(`${RECONCILE_DIR}/*.json`, {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  const safeFiles = await filterGlobPathsBySymlinkPolicy(files, cwd, {
    pathsAreAbsolute: true,
  });

  const artifacts: LocalReconciliationArtifact[] = [];

  for (const filePath of safeFiles.sort()) {
    try {
      const payload = await fs.readJson(filePath);
      const parsed = reconciliationReportSchema.safeParse(payload);
      if (!parsed.success || parsed.data.type !== "local-reconciliation") {
        continue;
      }

      const basename = path.basename(filePath, ".json");
      const markdownPath = path.join(path.dirname(filePath), `${basename}.md`);
      const hasMarkdown = await fs.pathExists(markdownPath);

      artifacts.push({
        report: parsed.data,
        jsonPath: filePath,
        markdownPath: hasMarkdown ? markdownPath : null,
        relativeJsonPath: path.relative(cwd, filePath),
        relativeMarkdownPath: hasMarkdown ? path.relative(cwd, markdownPath) : null,
      });
    } catch {
      continue;
    }
  }

  return artifacts;
}

export function selectLatestArtifactsByTask(
  artifacts: LocalReconciliationArtifact[],
): Map<string, LocalReconciliationArtifact> {
  const latestByTask = new Map<string, LocalReconciliationArtifact>();

  for (const artifact of artifacts) {
    const current = latestByTask.get(artifact.report.taskId);
    if (!current) {
      latestByTask.set(artifact.report.taskId, artifact);
      continue;
    }

    latestByTask.set(artifact.report.taskId, newestByDateAndPath(current, artifact));
  }

  return latestByTask;
}

export async function listLatestReconciliationArtifacts(
  cwd = process.cwd(),
): Promise<LocalReconciliationArtifact[]> {
  const artifacts = await listLocalReconciliationArtifacts(cwd);
  const latest = selectLatestArtifactsByTask(artifacts);
  return [...latest.values()].sort((a, b) => a.report.taskId.localeCompare(b.report.taskId));
}

export async function findDuplicateReconciliationOverrides(
  cwd = process.cwd(),
): Promise<ReconciliationTaskDuplicate[]> {
  const artifacts = await listLocalReconciliationArtifacts(cwd);
  const byTask = new Map<string, LocalReconciliationArtifact[]>();

  for (const artifact of artifacts) {
    const bucket = byTask.get(artifact.report.taskId);
    if (bucket) {
      bucket.push(artifact);
    } else {
      byTask.set(artifact.report.taskId, [artifact]);
    }
  }

  const duplicates: ReconciliationTaskDuplicate[] = [];

  for (const [taskId, bucket] of byTask.entries()) {
    if (bucket.length <= 1) {
      continue;
    }
    duplicates.push({
      taskId,
      files: bucket.map((entry) => entry.relativeJsonPath).sort((a, b) => a.localeCompare(b)),
    });
  }

  return duplicates.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export async function refreshCanonicalReconciliationPointers(cwd = process.cwd()): Promise<void> {
  const settings = await loadReconciliationLifecycleSettings(cwd);
  if (!settings.writeCanonicalPointers) {
    return;
  }

  const latest = await listLatestReconciliationArtifacts(cwd);
  const latestDir = path.join(cwd, RECONCILE_LATEST_DIR);
  await fs.ensureDir(latestDir);

  const existingPointers = await fg(`${RECONCILE_LATEST_DIR}/*.json`, {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  const safeExistingPointers = await filterGlobPathsBySymlinkPolicy(existingPointers, cwd, {
    pathsAreAbsolute: true,
  });
  for (const existingPath of safeExistingPointers) {
    assertWithinRoot(existingPath, cwd, "canonical pointer");
    await assertRealpathWithinRoot(existingPath, cwd, "canonical pointer");
    await fs.remove(existingPath);
  }

  for (const artifact of latest) {
    const pointerPath = path.join(latestDir, `${artifact.report.taskId}.json`);
    await fs.writeJson(
      pointerPath,
      {
        schemaVersion: "1.0",
        taskId: artifact.report.taskId,
        generatedAt: currentDateISO(),
        latest: {
          id: artifact.report.id,
          date: artifact.report.date,
          status: artifact.report.status,
          jsonPath: artifact.relativeJsonPath,
          markdownPath: artifact.relativeMarkdownPath,
        },
      },
      { spaces: 2 },
    );
  }
}

export async function pruneReconciliationArtifacts(input: {
  cwd?: string;
  apply?: boolean;
}): Promise<ReconciliationPruneResult> {
  const cwd = input.cwd ?? process.cwd();
  const dryRun = input.apply !== true;

  const artifacts = await listLocalReconciliationArtifacts(cwd);
  const latestByTask = selectLatestArtifactsByTask(artifacts);

  const stale = artifacts.filter((artifact) => {
    const latest = latestByTask.get(artifact.report.taskId);
    return latest ? latest.jsonPath !== artifact.jsonPath : false;
  });

  const removedFiles: string[] = [];

  for (const artifact of stale) {
    removedFiles.push(artifact.relativeJsonPath);
    if (artifact.relativeMarkdownPath) {
      removedFiles.push(artifact.relativeMarkdownPath);
    }

    if (!dryRun) {
      assertWithinRoot(artifact.jsonPath, cwd, "stale reconciliation record");
      await assertRealpathWithinRoot(artifact.jsonPath, cwd, "stale reconciliation record");
      await fs.remove(artifact.jsonPath);
      if (artifact.markdownPath) {
        assertWithinRoot(artifact.markdownPath, cwd, "stale reconciliation markdown");
        await assertRealpathWithinRoot(artifact.markdownPath, cwd, "stale reconciliation markdown");
        await fs.remove(artifact.markdownPath);
      }
    }
  }

  if (!dryRun) {
    await refreshCanonicalReconciliationPointers(cwd);
  }

  return {
    dryRun,
    kept: latestByTask.size,
    staleRecords: stale.length,
    removedFiles: removedFiles.sort((a, b) => a.localeCompare(b)),
  };
}

export async function compactReconciliationArtifacts(input: {
  cwd?: string;
  apply?: boolean;
}): Promise<ReconciliationCompactResult> {
  const cwd = input.cwd ?? process.cwd();
  const dryRun = input.apply !== true;
  const archiveDate = currentDateISO();
  const archiveDir = path.join(cwd, RECONCILE_DIR, "archive", archiveDate);

  const artifacts = await listLocalReconciliationArtifacts(cwd);
  const latestByTask = selectLatestArtifactsByTask(artifacts);

  const stale = artifacts.filter((artifact) => {
    const latest = latestByTask.get(artifact.report.taskId);
    return latest ? latest.jsonPath !== artifact.jsonPath : false;
  });

  const movedFiles: Array<{ from: string; to: string }> = [];

  for (const artifact of stale) {
    const jsonDest = path.join(archiveDir, path.basename(artifact.jsonPath));
    movedFiles.push({
      from: artifact.relativeJsonPath,
      to: path.relative(cwd, jsonDest),
    });

    if (!dryRun) {
      assertWithinRoot(artifact.jsonPath, cwd, "reconciliation record to compact");
      await assertRealpathWithinRoot(artifact.jsonPath, cwd, "reconciliation record to compact");
      await assertRealpathWithinRoot(jsonDest, cwd, "reconciliation archive destination");
      await fs.ensureDir(archiveDir);
      await fs.move(artifact.jsonPath, jsonDest, { overwrite: true });
    }

    if (artifact.markdownPath) {
      const mdDest = path.join(archiveDir, path.basename(artifact.markdownPath));
      movedFiles.push({
        from: artifact.relativeMarkdownPath ?? path.relative(cwd, artifact.markdownPath),
        to: path.relative(cwd, mdDest),
      });
      if (!dryRun) {
        await assertRealpathWithinRoot(
          artifact.markdownPath,
          cwd,
          "reconciliation markdown to compact",
        );
        await assertRealpathWithinRoot(mdDest, cwd, "reconciliation archive markdown destination");
        await fs.ensureDir(archiveDir);
        await fs.move(artifact.markdownPath, mdDest, { overwrite: true });
      }
    }
  }

  if (!dryRun) {
    await fs.ensureDir(reconcileDir(cwd));
    await refreshCanonicalReconciliationPointers(cwd);
  }

  return {
    dryRun,
    archiveDate,
    archiveDir: path.relative(cwd, archiveDir),
    movedRecords: stale.length,
    movedFiles: movedFiles.sort((a, b) => a.from.localeCompare(b.from)),
  };
}
