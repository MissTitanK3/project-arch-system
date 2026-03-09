import path from "path";
import fs from "fs-extra";

interface ArchSnapshot {
  archPath: string;
  backupPath: string;
  existed: boolean;
}

export async function withAtomicTaskMutation(params: {
  cwd: string;
  mutateRoadmap: () => Promise<void>;
  rollbackRoadmap: () => Promise<void>;
  syncGraph: () => Promise<void>;
}): Promise<void> {
  const snapshot = await snapshotArchSurface(params.cwd);
  let failedSurface: "roadmap" | "graph" = "roadmap";

  try {
    await params.mutateRoadmap();
    failedSurface = "graph";
    await params.syncGraph();
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    const rollbackResults: string[] = [];
    let rollbackOk = true;

    try {
      await params.rollbackRoadmap();
      rollbackResults.push("roadmap:ok");
    } catch (rollbackError) {
      rollbackOk = false;
      const message =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      rollbackResults.push(`roadmap:failed(${message})`);
    }

    try {
      await restoreArchSurface(snapshot);
      rollbackResults.push("graph:ok");
    } catch (rollbackError) {
      rollbackOk = false;
      const message =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      rollbackResults.push(`graph:failed(${message})`);
    }

    const failedLabel = failedSurface === "roadmap" ? "roadmap/task-file" : ".arch/graph";
    const rollbackSummary = rollbackOk ? "rollback succeeded" : "rollback failed";
    const symptom = new Error(
      `Task mutation failed on ${failedLabel}: ${cause}. ${rollbackSummary}; ${rollbackResults.join(", ")}`,
    ) as Error & { cause?: unknown };
    symptom.cause = error;
    throw symptom;
  } finally {
    await fs.remove(snapshot.backupPath);
  }
}

async function snapshotArchSurface(cwd: string): Promise<ArchSnapshot> {
  const archPath = path.join(cwd, ".arch");
  const backupPath = path.join(cwd, ".arch.__task_txn_backup__");
  const existed = await fs.pathExists(archPath);

  await fs.remove(backupPath);
  if (existed) {
    await fs.copy(archPath, backupPath);
  }

  return { archPath, backupPath, existed };
}

async function restoreArchSurface(snapshot: ArchSnapshot): Promise<void> {
  await fs.remove(snapshot.archPath);

  if (snapshot.existed) {
    await fs.copy(snapshot.backupPath, snapshot.archPath);
  }
}
