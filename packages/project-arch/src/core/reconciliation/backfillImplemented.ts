import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import { collectTaskRecords } from "../validation/tasks";
import {
  ReconciliationReport,
  ReconciliationStatus,
  reconciliationReportSchema,
} from "../../schemas/reconciliationReport";
import { detectReconciliationTriggers } from "./triggerDetection";
import { currentDateISO } from "../../utils/date";
import {
  assertRealpathWithinRoot,
  filterGlobPathsBySymlinkPolicy,
} from "../../utils/symlinkPolicy";

export interface BackfillCandidate {
  taskId: string;
  phaseId: string;
  milestoneId: string;
  title: string;
  status: ReconciliationStatus;
  reason: string;
  source: "existing-report" | "trigger-detection";
  hasReport: boolean;
  reportPath: string | null;
  suggestedCommand: string;
}

export interface BackfillImplementedResult {
  generatedAt: string;
  totalCompletedTasks: number;
  candidateCount: number;
  candidates: BackfillCandidate[];
  jsonPath?: string;
}

interface ReportIndexEntry {
  report: ReconciliationReport;
  path: string;
}

const STATUS_PRIORITY: Record<ReconciliationStatus, number> = {
  "reconciliation required": 0,
  "reconciliation suggested": 1,
  "no reconciliation needed": 2,
  "reconciliation complete": 3,
};

function pickMoreRecent(current: ReportIndexEntry, incoming: ReportIndexEntry): ReportIndexEntry {
  if (incoming.report.date > current.report.date) {
    return incoming;
  }
  if (incoming.report.date < current.report.date) {
    return current;
  }
  return incoming.path > current.path ? incoming : current;
}

async function loadReconciliationReportIndex(cwd: string): Promise<Map<string, ReportIndexEntry>> {
  const reportFiles = await fg(".project-arch/reconcile/*.json", {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  const safeReportFiles = await filterGlobPathsBySymlinkPolicy(reportFiles, cwd, {
    pathsAreAbsolute: true,
  });

  const reportIndex = new Map<string, ReportIndexEntry>();

  for (const reportFile of safeReportFiles.sort()) {
    try {
      const payload = await fs.readJson(reportFile);
      const parsed = reconciliationReportSchema.safeParse(payload);

      if (!parsed.success) {
        continue;
      }

      if (parsed.data.type !== "local-reconciliation") {
        continue;
      }

      const relativePath = path.relative(cwd, reportFile);
      const nextEntry: ReportIndexEntry = {
        report: parsed.data,
        path: relativePath,
      };

      const existing = reportIndex.get(parsed.data.taskId);
      if (!existing) {
        reportIndex.set(parsed.data.taskId, nextEntry);
      } else {
        reportIndex.set(parsed.data.taskId, pickMoreRecent(existing, nextEntry));
      }
    } catch {
      continue;
    }
  }

  return reportIndex;
}

function rankCandidates(candidates: BackfillCandidate[]): BackfillCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftPriority = STATUS_PRIORITY[left.status];
    const rightPriority = STATUS_PRIORITY[right.status];

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    if (left.phaseId !== right.phaseId) {
      return left.phaseId.localeCompare(right.phaseId);
    }

    if (left.milestoneId !== right.milestoneId) {
      return left.milestoneId.localeCompare(right.milestoneId);
    }

    return left.taskId.localeCompare(right.taskId);
  });
}

export interface RunBackfillImplementedOptions {
  writeJson?: boolean;
  cwd?: string;
}

export async function runBackfillImplemented(
  options: RunBackfillImplementedOptions = {},
): Promise<BackfillImplementedResult> {
  const cwd = options.cwd ?? process.cwd();
  const generatedAt = currentDateISO();

  const taskRecords = await collectTaskRecords(cwd);
  const completedTasks = taskRecords.filter((task) => task.frontmatter.status === "done");
  const reportIndex = await loadReconciliationReportIndex(cwd);

  const candidates: BackfillCandidate[] = [];

  for (const task of completedTasks) {
    const existingReport = reportIndex.get(task.frontmatter.id);

    if (existingReport && existingReport.report.status === "reconciliation complete") {
      continue;
    }

    if (existingReport) {
      candidates.push({
        taskId: task.frontmatter.id,
        phaseId: task.phaseId,
        milestoneId: task.milestoneId,
        title: task.frontmatter.title,
        status: existingReport.report.status,
        reason: `Existing reconciliation report status is '${existingReport.report.status}'.`,
        source: "existing-report",
        hasReport: true,
        reportPath: existingReport.path,
        suggestedCommand: `pa reconcile task ${task.frontmatter.id}`,
      });
      continue;
    }

    const detection = await detectReconciliationTriggers(
      {
        changedFiles: task.frontmatter.codeTargets,
        taskStatus: task.frontmatter.status,
        codeTargets: task.frontmatter.codeTargets,
        traceLinks: task.frontmatter.traceLinks ?? [],
        evidence: task.frontmatter.evidence ?? [],
        tags: task.frontmatter.tags,
      },
      cwd,
    );

    const triggerNames = detection.firedTriggers.map((trigger) => trigger.name);

    candidates.push({
      taskId: task.frontmatter.id,
      phaseId: task.phaseId,
      milestoneId: task.milestoneId,
      title: task.frontmatter.title,
      status: detection.status,
      reason:
        triggerNames.length > 0
          ? `Detected triggers: ${triggerNames.join(", ")}.`
          : "No reconciliation trigger detected.",
      source: "trigger-detection",
      hasReport: false,
      reportPath: null,
      suggestedCommand: `pa reconcile task ${task.frontmatter.id}`,
    });
  }

  const rankedCandidates = rankCandidates(candidates);

  const result: BackfillImplementedResult = {
    generatedAt,
    totalCompletedTasks: completedTasks.length,
    candidateCount: rankedCandidates.length,
    candidates: rankedCandidates,
  };

  if (options.writeJson) {
    const outputDir = path.join(cwd, ".project-arch", "reconcile");
    await fs.ensureDir(outputDir);

    const jsonPath = path.join(outputDir, `backfill-${generatedAt}.json`);
    await assertRealpathWithinRoot(jsonPath, cwd, "backfill report json");
    await fs.writeJson(
      jsonPath,
      {
        schemaVersion: "1.0",
        type: "backfill-candidates",
        ...result,
      },
      { spaces: 2 },
    );

    result.jsonPath = jsonPath;
  }

  return result;
}
