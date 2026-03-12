import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import {
  ReconciliationReport,
  reconciliationReportSchema,
} from "../../schemas/reconciliationReport";
import { currentDateISO } from "../../utils/date";
import { renderReconciliationReportMarkdown } from "./reportMarkdown";

export interface ToolingFeedbackExportResult {
  sourceReportPath: string;
  generatedCount: number;
  jsonPaths: string[];
  markdownPaths: string[];
}

function inferProjectArchAreas(candidate: string): string[] {
  const value = candidate.toLowerCase();
  const areas = new Set<string>();

  if (value.includes("cli") || value.includes("command")) {
    areas.add("project-arch/cli");
  }
  if (value.includes("schema")) {
    areas.add("project-arch/schemas");
  }
  if (value.includes("check") || value.includes("validation")) {
    areas.add("project-arch/validation");
  }
  if (value.includes("docs") || value.includes("template")) {
    areas.add("project-arch/docs");
  }
  if (value.includes("feedback")) {
    areas.add("project-arch/feedback");
  }

  if (areas.size === 0) {
    areas.add("project-arch/core");
  }

  return [...areas];
}

async function findReconciliationReportFile(input: string, cwd: string): Promise<string> {
  const asAbsolute = path.isAbsolute(input) ? input : path.join(cwd, input);
  if (await fs.pathExists(asAbsolute)) {
    return asAbsolute;
  }

  const directPath = path.join(cwd, ".project-arch", "reconcile", `${input}.json`);
  if (await fs.pathExists(directPath)) {
    return directPath;
  }

  const reportFiles = await fg(".project-arch/reconcile/*.json", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  for (const reportFile of reportFiles.sort()) {
    try {
      const payload = await fs.readJson(reportFile);
      const parsed = reconciliationReportSchema.safeParse(payload);
      if (!parsed.success) {
        continue;
      }

      const fileBase = path.basename(reportFile, ".json");
      if (parsed.data.id === input || fileBase === input) {
        return reportFile;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Reconciliation report not found: ${input}`);
}

function buildToolingFeedbackReport(
  source: ReconciliationReport,
  candidate: string,
  index: number,
  date: string,
): ReconciliationReport {
  return reconciliationReportSchema.parse({
    schemaVersion: "1.0",
    id: `tooling-feedback-${source.taskId}-${String(index + 1).padStart(2, "0")}`,
    type: "tooling-feedback",
    status: "reconciliation suggested",
    taskId: source.taskId,
    date,
    author: "pa feedback export",
    summary: `Tooling feedback exported from reconciliation report ${source.id}.`,
    changedFiles: source.changedFiles,
    affectedAreas: inferProjectArchAreas(candidate),
    missingUpdates: [],
    missingTraceLinks: [],
    decisionCandidates: [],
    standardsGaps: [],
    proposedActions: [candidate],
    feedbackCandidates: [candidate],
    notes:
      "Resolution path: link to an upstream project-arch issue or mark this tooling-feedback report as closed with rationale.",
  });
}

export async function exportToolingFeedbackFromReconciliation(input: {
  reconciliationId: string;
  cwd?: string;
}): Promise<ToolingFeedbackExportResult> {
  const cwd = input.cwd ?? process.cwd();
  const sourcePath = await findReconciliationReportFile(input.reconciliationId, cwd);

  const raw = await fs.readJson(sourcePath);
  const sourceReport = reconciliationReportSchema.parse(raw);

  if (sourceReport.type !== "local-reconciliation") {
    throw new Error("Feedback export source must be a local-reconciliation report");
  }

  if (sourceReport.feedbackCandidates.length === 0) {
    return {
      sourceReportPath: sourcePath,
      generatedCount: 0,
      jsonPaths: [],
      markdownPaths: [],
    };
  }

  const date = currentDateISO();
  const outputDir = path.join(cwd, ".project-arch", "feedback");
  await fs.ensureDir(outputDir);

  const jsonPaths: string[] = [];
  const markdownPaths: string[] = [];

  for (const [index, candidate] of sourceReport.feedbackCandidates.entries()) {
    const report = buildToolingFeedbackReport(sourceReport, candidate, index, date);
    const fileBase = `${report.id}-${date}`;

    const jsonPath = path.join(outputDir, `${fileBase}.json`);
    const markdownPath = path.join(outputDir, `${fileBase}.md`);

    await fs.writeJson(jsonPath, report, { spaces: 2 });
    await fs.writeFile(
      markdownPath,
      renderReconciliationReportMarkdown(report, "pa feedback export"),
      "utf8",
    );

    jsonPaths.push(jsonPath);
    markdownPaths.push(markdownPath);
  }

  return {
    sourceReportPath: sourcePath,
    generatedCount: jsonPaths.length,
    jsonPaths,
    markdownPaths,
  };
}
