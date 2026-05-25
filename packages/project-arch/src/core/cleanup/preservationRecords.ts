import path from "path";
import fs from "fs-extra";
import { writeJsonDeterministic } from "../../utils/fs";

export interface PreservationRecord {
  bucket:
    | "preserved.non-matching-paired"
    | "preserved.has-content-legacy-only"
    | "manual-review.pre-condition-failed"
    | "manual-review.classification-conflict";
  normalizedKey: string;
  relativePath: string;
  absolutePath: string;
  artifactKind: string;
  pairingState: "paired" | "canonical-only" | "legacy-only";
  routingSource:
    | "exact-mirror-non-matching"
    | "empty-scaffold-has-content"
    | "classification-pre-condition-failed"
    | "classification-conflict";
  routingOutcome: string;
  reason: string;
  counterpartPath?: string;
  failedEvidenceStep?: string;
  contentTrigger?: string;
  failedPreCondition?: string;
  conflictDescription?: string;
  timestamp: string;
}

export interface PreservationRecordWriteResult {
  wrote: boolean;
  recordCount: number;
  recordsPath: string;
  failedRecords: Array<{ record: PreservationRecord; error: string }>;
}

const RECONCILE_SUBDIR = ".project-arch/reconcile";
const RECORDS_FILENAME = "cleanup-preservation-records.json";

export async function getReconcileDir(cwd: string): Promise<string> {
  return path.join(cwd, RECONCILE_SUBDIR);
}

export async function ensureReconcileDir(cwd: string): Promise<void> {
  const reconcileDir = await getReconcileDir(cwd);
  await fs.ensureDir(reconcileDir);
}

export async function canInitializeReconcileDir(cwd: string): Promise<boolean> {
  try {
    const reconcileDir = await getReconcileDir(cwd);
    await fs.ensureDir(reconcileDir);

    const testFile = path.join(reconcileDir, `.write-test-${Date.now()}.tmp`);
    await fs.writeFile(testFile, "test", "utf8");
    await fs.remove(testFile);
    return true;
  } catch {
    return false;
  }
}

export async function writePreservationRecords(
  records: PreservationRecord[],
  cwd: string,
): Promise<PreservationRecordWriteResult> {
  const reconcileDir = await getReconcileDir(cwd);
  const recordsPath = path.join(reconcileDir, RECORDS_FILENAME);

  const failedRecords: Array<{ record: PreservationRecord; error: string }> = [];

  try {
    await ensureReconcileDir(cwd);

    const existingRecords = (await fs.pathExists(recordsPath))
      ? await fs.readJSON(recordsPath)
      : [];

    const allRecords = [...existingRecords, ...records];
    await writeJsonDeterministic(recordsPath, allRecords);

    return {
      wrote: true,
      recordCount: records.length,
      recordsPath: path.relative(cwd, recordsPath),
      failedRecords,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    for (const record of records) {
      failedRecords.push({ record, error: errorMessage });
    }

    return {
      wrote: false,
      recordCount: 0,
      recordsPath: path.relative(cwd, recordsPath),
      failedRecords,
    };
  }
}

export function buildPreservationRecord(
  item: {
    bucket: string;
    normalizedKey: string;
    relativePath: string;
    absolutePath: string;
    artifactKind: string;
    pairingState: "paired" | "canonical-only" | "legacy-only";
    reason: string;
    counterpartPath?: string;
  },
  routingSource: PreservationRecord["routingSource"],
  routingOutcome: string,
): PreservationRecord {
  const record: PreservationRecord = {
    bucket: item.bucket as PreservationRecord["bucket"],
    normalizedKey: item.normalizedKey,
    relativePath: item.relativePath,
    absolutePath: item.absolutePath,
    artifactKind: item.artifactKind,
    pairingState: item.pairingState,
    routingSource,
    routingOutcome,
    reason: item.reason,
    timestamp: new Date().toISOString(),
  };

  if (item.counterpartPath) {
    record.counterpartPath = item.counterpartPath;
  }

  return record;
}
