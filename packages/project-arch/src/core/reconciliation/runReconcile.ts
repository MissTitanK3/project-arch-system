import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import { readMarkdownWithFrontmatter } from "../../utils/fs";
import { taskSchema, TaskFrontmatter } from "../../schemas/task";
import {
  ReconciliationReport,
  reconciliationReportSchema,
} from "../../schemas/reconciliationReport";
import { detectReconciliationTriggers } from "./triggerDetection";
import { currentDateISO } from "../../utils/date";
import { renderReconciliationReportMarkdown } from "./reportMarkdown";
import {
  loadReconciliationLifecycleSettings,
  pruneReconciliationArtifacts,
  refreshCanonicalReconciliationPointers,
} from "./lifecycle";
import {
  assertRealpathWithinRoot,
  filterGlobPathsBySymlinkPolicy,
} from "../../utils/symlinkPolicy";
import { filterSensitivePaths } from "../../utils/sensitivePaths";

// ---------------------------------------------------------------------------
// Task file lookup
// ---------------------------------------------------------------------------

async function findTaskFileById(taskId: string, cwd: string): Promise<string | null> {
  // Normalise: accept "001", "001-some-slug", or "001-some-slug.md"
  const numericId = taskId.replace(/^(\d{3}).*/, "$1");

  const files = await fg(
    [
      `roadmap/projects/*/phases/*/milestones/*/tasks/**/${numericId}-*.md`,
      `roadmap/phases/*/milestones/*/tasks/**/${numericId}-*.md`,
    ],
    {
      cwd,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    },
  );
  const safeFiles = await filterGlobPathsBySymlinkPolicy(files, cwd, {
    pathsAreAbsolute: true,
  });

  const canonicalMatch = safeFiles
    .sort((left, right) => left.localeCompare(right))
    .find((filePath) => filePath.replace(/\\/g, "/").includes("/roadmap/projects/"));
  if (canonicalMatch) {
    return canonicalMatch;
  }

  return safeFiles.sort((left, right) => left.localeCompare(right))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Architecture area inference
// ---------------------------------------------------------------------------

function inferAffectedAreas(files: string[]): string[] {
  const areaSet = new Set<string>();

  for (const f of files) {
    if (/^architecture\//i.test(f) || /\/architecture\//i.test(f)) {
      const parts = f.split("/");
      const idx = parts.findIndex((p) => p.toLowerCase() === "architecture");
      areaSet.add(parts.slice(idx, idx + 2).join("/"));
    } else if (/^arch-domains\//i.test(f)) {
      areaSet.add("arch-domains");
    } else if (/^arch-model\//i.test(f)) {
      areaSet.add("arch-model");
    } else if (/\/schemas\//i.test(f)) {
      areaSet.add("schemas");
    } else if (/\/api\//i.test(f)) {
      areaSet.add("api");
    } else if (/^packages\//i.test(f)) {
      const parts = f.split("/");
      areaSet.add(`packages/${parts[1] ?? "unknown"}`);
    } else if (/^apps\//i.test(f)) {
      const parts = f.split("/");
      areaSet.add(`apps/${parts[1] ?? "unknown"}`);
    } else if (/^roadmap\//i.test(f)) {
      areaSet.add("roadmap");
    }
  }

  return [...areaSet].sort();
}

// ---------------------------------------------------------------------------
// Missing update inference
// ---------------------------------------------------------------------------

function inferMissingUpdates(frontmatter: TaskFrontmatter, affectedAreas: string[]): string[] {
  const missing: string[] = [];

  if (
    affectedAreas.some((a) => a.startsWith("arch-model")) &&
    (frontmatter.evidence ?? []).length === 0
  ) {
    missing.push("arch-model files may need updating to reflect module changes");
  }

  if (
    affectedAreas.some((a) => a.startsWith("architecture")) &&
    frontmatter.publicDocs.length === 0
  ) {
    missing.push("No publicDocs declared; architecture doc updates may be needed");
  }

  if ((frontmatter.traceLinks ?? []).length === 0) {
    missing.push("No traceLinks declared; trace links may be missing");
  }

  return missing;
}

// ---------------------------------------------------------------------------
// Output paths
// ---------------------------------------------------------------------------

function reconcileOutputDir(cwd: string): string {
  return path.join(cwd, ".project-arch", "reconcile");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunReconcileOptions {
  taskId: string;
  /** Optional run id for traceability when reconcile is triggered from agent runtime. */
  runId?: string;
  /** Additional changed files to include alongside codeTargets. */
  additionalChangedFiles?: string[];
  cwd?: string;
}

export interface RunReconcileResult {
  report: ReconciliationReport;
  jsonPath: string;
  markdownPath: string;
}

export async function runReconcile(options: RunReconcileOptions): Promise<RunReconcileResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Find and load task file
  const taskFile = await findTaskFileById(options.taskId, cwd);
  if (!taskFile) {
    throw new Error(`Task '${options.taskId}' not found in roadmap/`);
  }

  const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
  const frontmatter = taskSchema.parse(data);

  // 2. Assemble changed file signals
  const changedFiles = filterSensitivePaths([
    ...frontmatter.codeTargets,
    ...(options.additionalChangedFiles ?? []),
  ]).kept;

  // 3. Run trigger detection
  const { status, firedTriggers } = await detectReconciliationTriggers(
    {
      changedFiles,
      taskStatus: frontmatter.status,
      codeTargets: frontmatter.codeTargets,
      traceLinks: frontmatter.traceLinks ?? [],
      evidence: frontmatter.evidence ?? [],
      tags: frontmatter.tags,
    },
    cwd,
  );

  // 4. Infer affected areas and missing updates
  const affectedAreas = inferAffectedAreas(changedFiles);
  const missingUpdates = inferMissingUpdates(frontmatter, affectedAreas);
  const missingTraceLinks =
    (frontmatter.traceLinks ?? []).length === 0 ? ["Task has no traceLinks declared"] : [];

  // 5. Build report object
  const date = currentDateISO();
  const reportId = `reconcile-${frontmatter.id}-${date}`;

  const proposedActions: string[] = [];
  if (firedTriggers.some((t) => t.name === "module-boundary")) {
    proposedActions.push("Update arch-model/ files to reflect module boundary changes");
  }
  if (firedTriggers.some((t) => t.name === "architecture-surface")) {
    proposedActions.push("Review architecture/ docs and update as needed");
  }
  if (firedTriggers.some((t) => t.name === "schema-contract")) {
    proposedActions.push("Confirm schema changes are reflected in publicDocs and decisions");
  }
  if (missingTraceLinks.length > 0) {
    proposedActions.push("Add traceLinks to the task frontmatter");
  }

  const report = reconciliationReportSchema.parse({
    schemaVersion: "2.0",
    id: reportId,
    type: "local-reconciliation",
    status,
    taskId: frontmatter.id,
    runId: options.runId,
    date,
    author: "pa reconcile",
    summary: `Reconciliation pass for task ${frontmatter.id}: ${frontmatter.title}. Triggered by: ${firedTriggers.map((t) => t.name).join(", ") || "none"}.`,
    changedFiles,
    affectedAreas,
    missingUpdates,
    missingTraceLinks,
    decisionCandidates: frontmatter.decisions,
    standardsGaps: [],
    proposedActions,
    feedbackCandidates: [],
    notes: `Task status: ${frontmatter.status}. Fired triggers: ${firedTriggers.map((t) => `${t.name} (${t.level})`).join(", ") || "none"}.`,
  });

  // 6. Write outputs
  const outDir = reconcileOutputDir(cwd);
  await fs.ensureDir(outDir);

  const jsonPath = path.join(outDir, `${frontmatter.id}-${date}.json`);
  const markdownPath = path.join(outDir, `${frontmatter.id}-${date}.md`);

  await assertRealpathWithinRoot(jsonPath, cwd, "reconciliation report json");
  await assertRealpathWithinRoot(markdownPath, cwd, "reconciliation report markdown");

  await fs.writeJson(jsonPath, report, { spaces: 2 });
  await fs.writeFile(
    markdownPath,
    renderReconciliationReportMarkdown(report, "pa reconcile"),
    "utf8",
  );

  const lifecycle = await loadReconciliationLifecycleSettings(cwd);
  if (lifecycle.mode === "current-state-record") {
    await pruneReconciliationArtifacts({ cwd, apply: true });
  } else {
    await refreshCanonicalReconciliationPointers(cwd);
  }

  return { report, jsonPath, markdownPath };
}
