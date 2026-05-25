import path from "path";
import fg from "fast-glob";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";
import { resolveRuntimeCompatibilityContract } from "../runtime/compatibility";

type ArtifactKind = "phase-overview" | "milestone-overview" | "milestone-targets" | "task";
type PairingState = "paired" | "canonical-only" | "legacy-only";
type ClassificationBucket =
  | "exact-mirror"
  | "empty-scaffold"
  | "preserved.non-matching-paired"
  | "preserved.has-content-legacy-only"
  | "manual-review.pre-condition-failed"
  | "manual-review.classification-conflict";

interface CleanupInventoryEntry {
  surface: "canonical" | "legacy";
  artifactKind: ArtifactKind;
  phaseId: string;
  milestoneId: string | null;
  taskLane: string | null;
  taskId: string | null;
  taskSlug: string | null;
  projectId: string | null;
  normalizedKey: string;
  relativePath: string;
  absolutePath: string;
  exists: boolean;
}

interface CleanupGroup {
  normalizedKey: string;
  canonicalEntries: CleanupInventoryEntry[];
  legacyEntries: CleanupInventoryEntry[];
  pairingState: PairingState;
}

export interface LegacyCleanupPreviewItem {
  bucket: ClassificationBucket;
  artifactKind: ArtifactKind | "unknown";
  normalizedKey: string;
  relativePath: string;
  absolutePath: string;
  pairingState: PairingState;
  counterpartPath?: string;
  reason: string;
}

export interface LegacyCleanupPreviewResult {
  mode: "dry-run";
  compatibility: Awaited<ReturnType<typeof resolveRuntimeCompatibilityContract>>;
  exactMirrorRemovals: LegacyCleanupPreviewItem[];
  emptyScaffoldingRemovals: LegacyCleanupPreviewItem[];
  preservedLegacyContent: LegacyCleanupPreviewItem[];
  manualReviewRequired: LegacyCleanupPreviewItem[];
  canonicalOnlyCount: number;
  recordItems: LegacyCleanupPreviewItem[];
}

const SCAN_PATTERNS = [
  "roadmap/projects/*/phases/*/overview.md",
  "roadmap/projects/*/phases/*/milestones/*/overview.md",
  "roadmap/projects/*/phases/*/milestones/*/targets.md",
  "roadmap/projects/*/phases/*/milestones/*/tasks/*/*.md",
  "roadmap/phases/*/overview.md",
  "roadmap/phases/*/milestones/*/overview.md",
  "roadmap/phases/*/milestones/*/targets.md",
  "roadmap/phases/*/milestones/*/tasks/*/*.md",
] as const;

const PLACEHOLDER_VALUES = new Set(["tbd", "todo", "n/a", "(none)", "(empty)", "(placeholder)"]);

function buildNormalizedKey(entry: {
  artifactKind: ArtifactKind;
  phaseId: string;
  milestoneId: string | null;
  taskLane: string | null;
  taskId: string | null;
}): string {
  return [
    entry.artifactKind,
    entry.phaseId,
    entry.milestoneId ?? "",
    entry.taskLane ?? "",
    entry.taskId ?? "",
  ].join("|");
}

function parseInventoryEntry(relativePath: string, cwd: string): CleanupInventoryEntry | null {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  let match = normalizedPath.match(/^roadmap\/projects\/([^/]+)\/phases\/([^/]+)\/overview\.md$/);
  if (match) {
    const [, projectId, phaseId] = match;
    return {
      surface: "canonical",
      artifactKind: "phase-overview",
      phaseId,
      milestoneId: null,
      taskLane: null,
      taskId: null,
      taskSlug: null,
      projectId,
      normalizedKey: buildNormalizedKey({
        artifactKind: "phase-overview",
        phaseId,
        milestoneId: null,
        taskLane: null,
        taskId: null,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(
    /^roadmap\/projects\/([^/]+)\/phases\/([^/]+)\/milestones\/([^/]+)\/overview\.md$/,
  );
  if (match) {
    const [, projectId, phaseId, milestoneId] = match;
    return {
      surface: "canonical",
      artifactKind: "milestone-overview",
      phaseId,
      milestoneId,
      taskLane: null,
      taskId: null,
      taskSlug: null,
      projectId,
      normalizedKey: buildNormalizedKey({
        artifactKind: "milestone-overview",
        phaseId,
        milestoneId,
        taskLane: null,
        taskId: null,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(
    /^roadmap\/projects\/([^/]+)\/phases\/([^/]+)\/milestones\/([^/]+)\/targets\.md$/,
  );
  if (match) {
    const [, projectId, phaseId, milestoneId] = match;
    return {
      surface: "canonical",
      artifactKind: "milestone-targets",
      phaseId,
      milestoneId,
      taskLane: null,
      taskId: null,
      taskSlug: null,
      projectId,
      normalizedKey: buildNormalizedKey({
        artifactKind: "milestone-targets",
        phaseId,
        milestoneId,
        taskLane: null,
        taskId: null,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(
    /^roadmap\/projects\/([^/]+)\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/([^/]+)\/(\d+)-(.+)\.md$/,
  );
  if (match) {
    const [, projectId, phaseId, milestoneId, taskLane, taskId, taskSlug] = match;
    return {
      surface: "canonical",
      artifactKind: "task",
      phaseId,
      milestoneId,
      taskLane,
      taskId,
      taskSlug,
      projectId,
      normalizedKey: buildNormalizedKey({
        artifactKind: "task",
        phaseId,
        milestoneId,
        taskLane,
        taskId,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(/^roadmap\/phases\/([^/]+)\/overview\.md$/);
  if (match) {
    const [, phaseId] = match;
    return {
      surface: "legacy",
      artifactKind: "phase-overview",
      phaseId,
      milestoneId: null,
      taskLane: null,
      taskId: null,
      taskSlug: null,
      projectId: null,
      normalizedKey: buildNormalizedKey({
        artifactKind: "phase-overview",
        phaseId,
        milestoneId: null,
        taskLane: null,
        taskId: null,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(/^roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/overview\.md$/);
  if (match) {
    const [, phaseId, milestoneId] = match;
    return {
      surface: "legacy",
      artifactKind: "milestone-overview",
      phaseId,
      milestoneId,
      taskLane: null,
      taskId: null,
      taskSlug: null,
      projectId: null,
      normalizedKey: buildNormalizedKey({
        artifactKind: "milestone-overview",
        phaseId,
        milestoneId,
        taskLane: null,
        taskId: null,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(/^roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/targets\.md$/);
  if (match) {
    const [, phaseId, milestoneId] = match;
    return {
      surface: "legacy",
      artifactKind: "milestone-targets",
      phaseId,
      milestoneId,
      taskLane: null,
      taskId: null,
      taskSlug: null,
      projectId: null,
      normalizedKey: buildNormalizedKey({
        artifactKind: "milestone-targets",
        phaseId,
        milestoneId,
        taskLane: null,
        taskId: null,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  match = normalizedPath.match(
    /^roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/([^/]+)\/(\d+)-(.+)\.md$/,
  );
  if (match) {
    const [, phaseId, milestoneId, taskLane, taskId, taskSlug] = match;
    return {
      surface: "legacy",
      artifactKind: "task",
      phaseId,
      milestoneId,
      taskLane,
      taskId,
      taskSlug,
      projectId: null,
      normalizedKey: buildNormalizedKey({
        artifactKind: "task",
        phaseId,
        milestoneId,
        taskLane,
        taskId,
      }),
      relativePath: normalizedPath,
      absolutePath: path.join(cwd, normalizedPath),
      exists: true,
    };
  }

  return null;
}

function groupInventory(entries: CleanupInventoryEntry[]): CleanupGroup[] {
  const groups = new Map<string, CleanupGroup>();

  for (const entry of entries) {
    const existing = groups.get(entry.normalizedKey) ?? {
      normalizedKey: entry.normalizedKey,
      canonicalEntries: [],
      legacyEntries: [],
      pairingState: "canonical-only" as PairingState,
    };

    if (entry.surface === "canonical") {
      existing.canonicalEntries.push(entry);
    } else {
      existing.legacyEntries.push(entry);
    }

    existing.canonicalEntries.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
    existing.legacyEntries.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
    existing.pairingState =
      existing.canonicalEntries.length > 0 && existing.legacyEntries.length > 0
        ? "paired"
        : existing.canonicalEntries.length > 0
          ? "canonical-only"
          : "legacy-only";
    groups.set(entry.normalizedKey, existing);
  }

  return [...groups.values()].sort((left, right) =>
    left.normalizedKey.localeCompare(right.normalizedKey),
  );
}

function normalizeBody(content: string): string {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

function normalizeFrontmatterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFrontmatterValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeFrontmatterValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (value === undefined) {
    return null;
  }

  return value;
}

async function filesAreExactMirrors(
  legacyEntry: CleanupInventoryEntry,
  canonicalEntry: CleanupInventoryEntry,
): Promise<boolean> {
  const legacy = await readMarkdownWithFrontmatter<Record<string, unknown>>(
    legacyEntry.absolutePath,
  );
  const canonical = await readMarkdownWithFrontmatter<Record<string, unknown>>(
    canonicalEntry.absolutePath,
  );

  return (
    JSON.stringify(normalizeFrontmatterValue(legacy.data)) ===
      JSON.stringify(normalizeFrontmatterValue(canonical.data)) &&
    normalizeBody(legacy.content) === normalizeBody(canonical.content)
  );
}

function isPlaceholderText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized);
}

function isPlaceholderLine(line: string): boolean {
  const normalized = line.trim();
  if (normalized.length === 0) {
    return true;
  }

  const listContent = normalized.replace(/^[-*+]\s+/, "").trim();
  if (listContent.length === 0) {
    return true;
  }

  return isPlaceholderText(listContent);
}

function hasProgressOrImplementationContent(body: string): boolean {
  const lines = body.split("\n");
  let activeSection: string | null = null;
  let sectionLines: string[] = [];

  const flush = (): boolean => {
    if (!activeSection) {
      return false;
    }

    if (activeSection !== "progress record" && activeSection !== "implementation record") {
      return false;
    }

    return sectionLines.some((line) => !isPlaceholderLine(line) && !/^#+\s+/.test(line.trim()));
  };

  for (const line of lines) {
    const heading = line.trim().match(/^##\s+(.+)$/);
    if (heading) {
      if (flush()) {
        return true;
      }
      activeSection = heading[1]!.trim().toLowerCase();
      sectionLines = [];
      continue;
    }

    sectionLines.push(line);
  }

  return flush();
}

function containsHardBlockContent(body: string): boolean {
  if (/\[[^\]]+\]\([^)]+\)/.test(body) || /https?:\/\//i.test(body)) {
    return true;
  }

  if (/\b\d{4}-\d{2}-\d{2}\b/.test(body) || /\bv?\d+\.\d+(?:\.\d+)?\b/.test(body)) {
    return true;
  }

  if (/(^|\n)\s*(owner|team|assignee)\s*:/i.test(body) || /@[A-Za-z0-9_-]+/.test(body)) {
    return true;
  }

  if (/\bdecision\b/i.test(body) || /\brationale\b/i.test(body)) {
    return true;
  }

  return hasProgressOrImplementationContent(body);
}

async function isEmptyScaffold(entry: CleanupInventoryEntry): Promise<boolean> {
  const { content } = await readMarkdownWithFrontmatter<Record<string, unknown>>(
    entry.absolutePath,
  );
  const normalizedBody = normalizeBody(content);

  if (containsHardBlockContent(normalizedBody)) {
    return false;
  }

  const remainingLines = normalizedBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^#+\s+/.test(line))
    .filter((line) => !isPlaceholderLine(line));

  return remainingLines.length === 0;
}

async function scanInventory(cwd: string): Promise<{
  entries: CleanupInventoryEntry[];
  manualReview: LegacyCleanupPreviewItem[];
}> {
  const matches = await fg([...SCAN_PATTERNS], {
    cwd,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
  });
  const safeMatches = await filterGlobPathsBySymlinkPolicy(matches, cwd);

  const entries: CleanupInventoryEntry[] = [];
  const manualReview: LegacyCleanupPreviewItem[] = [];

  for (const relativePath of safeMatches.sort((left, right) => left.localeCompare(right))) {
    const parsed = parseInventoryEntry(relativePath, cwd);
    if (!parsed) {
      manualReview.push({
        bucket: "manual-review.pre-condition-failed",
        artifactKind: "unknown",
        normalizedKey: relativePath,
        relativePath,
        absolutePath: path.join(cwd, relativePath),
        pairingState: "legacy-only",
        reason: "Artifact path did not match the approved cleanup inventory contract.",
      });
      continue;
    }

    entries.push(parsed);
  }

  return { entries, manualReview };
}

export async function runLegacyCleanupPreview(
  cwd = process.cwd(),
): Promise<LegacyCleanupPreviewResult> {
  const compatibility = await resolveRuntimeCompatibilityContract("reporting", cwd);
  const { entries, manualReview } = await scanInventory(cwd);
  const groups = groupInventory(entries);

  const exactMirrorRemovals: LegacyCleanupPreviewItem[] = [];
  const emptyScaffoldingRemovals: LegacyCleanupPreviewItem[] = [];
  const preservedLegacyContent: LegacyCleanupPreviewItem[] = [];
  const manualReviewRequired = [...manualReview];
  let canonicalOnlyCount = 0;

  for (const group of groups) {
    if (group.pairingState === "canonical-only") {
      canonicalOnlyCount += group.canonicalEntries.length;
      continue;
    }

    if (group.pairingState === "paired") {
      for (const legacyEntry of group.legacyEntries) {
        try {
          let matchedCanonical: CleanupInventoryEntry | undefined;
          for (const canonicalEntry of group.canonicalEntries) {
            const matched = await filesAreExactMirrors(legacyEntry, canonicalEntry);
            if (matched) {
              matchedCanonical = canonicalEntry;
              break;
            }
          }

          if (matchedCanonical) {
            exactMirrorRemovals.push({
              bucket: "exact-mirror",
              artifactKind: legacyEntry.artifactKind,
              normalizedKey: legacyEntry.normalizedKey,
              relativePath: legacyEntry.relativePath,
              absolutePath: legacyEntry.absolutePath,
              pairingState: group.pairingState,
              counterpartPath: matchedCanonical.relativePath,
              reason: "Legacy artifact is an exact mirror of its canonical counterpart.",
            });
          } else {
            preservedLegacyContent.push({
              bucket: "preserved.non-matching-paired",
              artifactKind: legacyEntry.artifactKind,
              normalizedKey: legacyEntry.normalizedKey,
              relativePath: legacyEntry.relativePath,
              absolutePath: legacyEntry.absolutePath,
              pairingState: group.pairingState,
              counterpartPath: group.canonicalEntries[0]?.relativePath,
              reason:
                "Paired legacy artifact differs from all canonical counterparts and must be preserved.",
            });
          }
        } catch (error) {
          manualReviewRequired.push({
            bucket: "manual-review.pre-condition-failed",
            artifactKind: legacyEntry.artifactKind,
            normalizedKey: legacyEntry.normalizedKey,
            relativePath: legacyEntry.relativePath,
            absolutePath: legacyEntry.absolutePath,
            pairingState: group.pairingState,
            counterpartPath: group.canonicalEntries[0]?.relativePath,
            reason:
              error instanceof Error
                ? `Exact-mirror evaluation failed: ${error.message}`
                : "Exact-mirror evaluation failed.",
          });
        }
      }
      continue;
    }

    for (const legacyEntry of group.legacyEntries) {
      try {
        const emptyScaffold = await isEmptyScaffold(legacyEntry);
        if (emptyScaffold) {
          emptyScaffoldingRemovals.push({
            bucket: "empty-scaffold",
            artifactKind: legacyEntry.artifactKind,
            normalizedKey: legacyEntry.normalizedKey,
            relativePath: legacyEntry.relativePath,
            absolutePath: legacyEntry.absolutePath,
            pairingState: group.pairingState,
            reason:
              "Legacy-only artifact contains no meaningful planning content and qualifies as empty scaffolding.",
          });
        } else {
          preservedLegacyContent.push({
            bucket: "preserved.has-content-legacy-only",
            artifactKind: legacyEntry.artifactKind,
            normalizedKey: legacyEntry.normalizedKey,
            relativePath: legacyEntry.relativePath,
            absolutePath: legacyEntry.absolutePath,
            pairingState: group.pairingState,
            reason:
              "Legacy-only artifact contains meaningful planning content and must be preserved.",
          });
        }
      } catch (error) {
        manualReviewRequired.push({
          bucket: "manual-review.pre-condition-failed",
          artifactKind: legacyEntry.artifactKind,
          normalizedKey: legacyEntry.normalizedKey,
          relativePath: legacyEntry.relativePath,
          absolutePath: legacyEntry.absolutePath,
          pairingState: group.pairingState,
          reason:
            error instanceof Error
              ? `Empty-scaffold evaluation failed: ${error.message}`
              : "Empty-scaffold evaluation failed.",
        });
      }
    }
  }

  return {
    mode: "dry-run",
    compatibility,
    exactMirrorRemovals,
    emptyScaffoldingRemovals,
    preservedLegacyContent,
    manualReviewRequired,
    canonicalOnlyCount,
    recordItems: [...preservedLegacyContent, ...manualReviewRequired],
  };
}
