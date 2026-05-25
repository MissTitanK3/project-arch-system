import fs from "fs-extra";
import path from "path";
import type { LegacyCleanupPreviewItem } from "./legacyCleanupPreview";

export type DeletionQueueItem = LegacyCleanupPreviewItem & {
  bucket: "exact-mirror" | "empty-scaffold";
};

export interface DeletionReconfirmationResult {
  deletionQueue: DeletionQueueItem[];
  skippedMissingLegacy: DeletionQueueItem[];
  reroutedManualReview: LegacyCleanupPreviewItem[];
}

export interface DeletionExecutionResult {
  deletedExactMirror: DeletionQueueItem[];
  deletedEmptyScaffold: DeletionQueueItem[];
  failed: Array<{ item: DeletionQueueItem; error: string }>;
}

export async function reconfirmDeletionCandidates(
  cwd: string,
  exactMirrorRemovals: LegacyCleanupPreviewItem[],
  emptyScaffoldingRemovals: LegacyCleanupPreviewItem[],
): Promise<DeletionReconfirmationResult> {
  const deletionQueue: DeletionQueueItem[] = [];
  const skippedMissingLegacy: DeletionQueueItem[] = [];
  const reroutedManualReview: LegacyCleanupPreviewItem[] = [];

  for (const item of exactMirrorRemovals) {
    const candidate: DeletionQueueItem = { ...item, bucket: "exact-mirror" };
    const legacyExists = await fs.pathExists(candidate.absolutePath);
    if (!legacyExists) {
      skippedMissingLegacy.push(candidate);
      continue;
    }

    if (!candidate.counterpartPath) {
      reroutedManualReview.push({
        ...candidate,
        bucket: "manual-review.pre-condition-failed",
        reason:
          "Exact-mirror deletion refused: canonical counterpart path is unavailable at runtime re-confirmation.",
      });
      continue;
    }

    const counterpartAbsolutePath = path.join(cwd, candidate.counterpartPath);
    const counterpartExists = await fs.pathExists(counterpartAbsolutePath);
    if (!counterpartExists) {
      reroutedManualReview.push({
        ...candidate,
        bucket: "manual-review.pre-condition-failed",
        reason:
          "Exact-mirror deletion refused: canonical counterpart is missing at runtime re-confirmation.",
      });
      continue;
    }

    deletionQueue.push(candidate);
  }

  for (const item of emptyScaffoldingRemovals) {
    const candidate: DeletionQueueItem = { ...item, bucket: "empty-scaffold" };
    const legacyExists = await fs.pathExists(candidate.absolutePath);
    if (!legacyExists) {
      skippedMissingLegacy.push(candidate);
      continue;
    }

    deletionQueue.push(candidate);
  }

  return {
    deletionQueue,
    skippedMissingLegacy,
    reroutedManualReview,
  };
}

export async function executeDeletionCandidates(
  deletionQueue: DeletionQueueItem[],
): Promise<DeletionExecutionResult> {
  const deletedExactMirror: DeletionQueueItem[] = [];
  const deletedEmptyScaffold: DeletionQueueItem[] = [];
  const failed: Array<{ item: DeletionQueueItem; error: string }> = [];

  for (const item of deletionQueue) {
    try {
      await fs.remove(item.absolutePath);
      if (item.bucket === "exact-mirror") {
        deletedExactMirror.push(item);
      } else {
        deletedEmptyScaffold.push(item);
      }
    } catch (error) {
      failed.push({
        item,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    deletedExactMirror,
    deletedEmptyScaffold,
    failed,
  };
}
