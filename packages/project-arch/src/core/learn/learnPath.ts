import path from "path";
import { stat } from "fs/promises";
import { runCheck } from "../checks/runCheck";
import { resolveContext } from "../context/resolveContext";
import { filterCheckResult } from "../validation/check";
import { collectDecisionRecords, type DecisionRecord } from "../validation/decisions";
import { collectTaskRecords, type TaskRecord } from "../validation/tasks";
import { pathExists } from "../../utils/fs";

export type LearnFindingCategory =
  | "scope"
  | "task-coverage"
  | "decision-coverage"
  | "docs-coverage"
  | "validation";

export interface LearnFinding {
  category: LearnFindingCategory;
  severity: "error" | "warning";
  pathScope: string;
  message: string;
  evidence: string[];
  recommendedAction: string;
}

export interface LearnSummary {
  totalGaps: number;
  byCategory: Record<string, number>;
  cleanPaths: number;
}

export interface LearnReport {
  schemaVersion: "1.0";
  timestamp: string;
  analyzedPaths: string[];
  findings: LearnFinding[];
  summary: LearnSummary;
  suggestedCommands: string[];
}

interface PathScope {
  input: string;
  relativePath: string;
  absolutePath: string;
  kind: "file" | "directory" | "missing";
}

function normalizeRepoPath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/g, "");
}

function resolveInputPath(input: string, cwd: string): PathScope {
  const absolutePath = path.resolve(cwd, input);
  const relativePath = normalizeRepoPath(path.relative(cwd, absolutePath));
  if (relativePath === "" || relativePath === ".") {
    throw new Error("learn paths must resolve to a file or directory inside the repository");
  }
  if (relativePath.startsWith("../")) {
    throw new Error(`path '${input}' is outside the repository root`);
  }

  return {
    input,
    relativePath,
    absolutePath,
    kind: "missing",
  };
}

async function detectScopeKind(scope: PathScope): Promise<PathScope> {
  if (!(await pathExists(scope.absolutePath))) {
    return scope;
  }

  const stats = await stat(scope.absolutePath);
  return {
    ...scope,
    kind: stats.isDirectory() ? "directory" : "file",
  };
}

function scopePatterns(scope: PathScope): string[] {
  if (scope.kind === "directory") {
    return [scope.relativePath, `${scope.relativePath}/**`];
  }
  return [scope.relativePath];
}

function matchesScope(candidate: string, scope: PathScope): boolean {
  const normalizedCandidate = normalizeRepoPath(candidate);
  const normalizedScope = scope.relativePath;

  if (scope.kind === "directory") {
    return (
      normalizedCandidate === normalizedScope ||
      normalizedCandidate.startsWith(`${normalizedScope}/`)
    );
  }

  return normalizedCandidate === normalizedScope;
}

function getTaskMatchEvidence(task: TaskRecord, scope: PathScope, cwd: string): string[] {
  const evidence = new Set<string>();
  const taskPath = normalizeRepoPath(path.relative(cwd, task.filePath));
  if (matchesScope(taskPath, scope)) {
    evidence.add(`task file: ${taskPath}`);
  }

  for (const target of task.frontmatter.codeTargets) {
    if (matchesScope(target, scope)) {
      evidence.add(`codeTarget: ${normalizeRepoPath(target)}`);
    }
  }

  for (const doc of task.frontmatter.publicDocs) {
    if (matchesScope(doc, scope)) {
      evidence.add(`publicDoc: ${normalizeRepoPath(doc)}`);
    }
  }

  for (const traceLink of task.frontmatter.traceLinks ?? []) {
    if (matchesScope(traceLink, scope)) {
      evidence.add(`traceLink: ${normalizeRepoPath(traceLink)}`);
    }
  }

  return [...evidence];
}

function getDecisionMatchEvidence(decision: DecisionRecord, scope: PathScope, cwd: string): string[] {
  const evidence = new Set<string>();
  const decisionPath = normalizeRepoPath(path.relative(cwd, decision.filePath));
  if (matchesScope(decisionPath, scope)) {
    evidence.add(`decision file: ${decisionPath}`);
  }

  for (const target of decision.frontmatter.links.codeTargets) {
    if (matchesScope(target, scope)) {
      evidence.add(`codeTarget: ${normalizeRepoPath(target)}`);
    }
  }

  for (const doc of decision.frontmatter.links.publicDocs) {
    if (matchesScope(doc, scope)) {
      evidence.add(`publicDoc: ${normalizeRepoPath(doc)}`);
    }
  }

  return [...evidence];
}

function isDocumentationPath(relativePath: string): boolean {
  return (
    relativePath.endsWith(".md") &&
    (relativePath.startsWith("docs/") || relativePath.startsWith("architecture/"))
  );
}

function increment(summary: Record<string, number>, category: string): void {
  summary[category] = (summary[category] ?? 0) + 1;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function buildSuggestedCommands(
  findings: LearnFinding[],
  scopes: PathScope[],
  activeContext:
    | Awaited<ReturnType<typeof resolveContext>>
    | null,
): string[] {
  const commands = new Set<string>();
  const primaryScope = scopes[0];

  if (findings.some((finding) => finding.category === "task-coverage") && activeContext) {
    commands.add(
      `pa task new ${activeContext.active.phase.id} ${activeContext.active.milestone.id}`,
    );
  }

  if (findings.some((finding) => finding.category === "decision-coverage") && activeContext) {
    commands.add(
      `pa decision new --scope milestone --phase ${activeContext.active.phase.id} --milestone ${activeContext.active.milestone.id} --title "<title>"`,
    );
  }

  if (findings.some((finding) => finding.category === "docs-coverage")) {
    commands.add("pa docs --linked-only --json");
  }

  if (findings.some((finding) => finding.category === "validation") && primaryScope) {
    if (primaryScope.kind === "file") {
      commands.add(`pa check --file ${primaryScope.relativePath}`);
    } else {
      commands.add(`pa check --paths "${primaryScope.relativePath}/**"`);
    }
  }

  return [...commands];
}

export function renderLearnReport(report: LearnReport): string {
  const lines = [
    "Scope",
    ...report.analyzedPaths.map((analyzedPath) => `- ${analyzedPath}`),
    "",
    "Findings",
  ];

  if (report.findings.length === 0) {
    lines.push("- No path-scoped gaps detected.");
  } else {
    const categories = unique(report.findings.map((finding) => finding.category));
    for (const category of categories) {
      lines.push("");
      lines.push(`${category}:`);
      for (const finding of report.findings.filter((entry) => entry.category === category)) {
        lines.push(`- [${finding.severity}] ${finding.pathScope}: ${finding.message}`);
        if (finding.evidence.length > 0) {
          for (const evidence of finding.evidence) {
            lines.push(`  evidence: ${evidence}`);
          }
        }
        lines.push(`  recommended: ${finding.recommendedAction}`);
      }
    }
  }

  lines.push("");
  lines.push("Recommended Follow-Up");
  if (report.suggestedCommands.length === 0) {
    lines.push("- No additional follow-up commands suggested.");
  } else {
    for (const command of report.suggestedCommands) {
      lines.push(`- ${command}`);
    }
  }

  lines.push("");
  lines.push("Summary");
  lines.push(`- total gaps: ${report.summary.totalGaps}`);
  lines.push(`- clean paths: ${report.summary.cleanPaths}`);
  for (const [category, count] of Object.entries(report.summary.byCategory).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(`- ${category}: ${count}`);
  }

  return lines.join("\n");
}

export async function learnPath(
  input: { paths: string[] },
  cwd = process.cwd(),
): Promise<LearnReport> {
  const providedPaths = unique(input.paths.map((value) => value.trim()).filter(Boolean));
  if (providedPaths.length === 0) {
    throw new Error("learn requires at least one --path value");
  }

  const scopes = await Promise.all(
    providedPaths.map((value) => detectScopeKind(resolveInputPath(value, cwd))),
  );
  let taskRecords: TaskRecord[] = [];
  try {
    taskRecords = await collectTaskRecords(cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("legacy-only roadmap runtimes")) {
      throw error;
    }
  }
  const decisionRecords = await collectDecisionRecords(cwd);
  const checkResult = await runCheck(cwd);

  const activeContext = await resolveContext(cwd).catch(
    () => null as Awaited<ReturnType<typeof resolveContext>> | null,
  );

  const findings: LearnFinding[] = [];

  for (const scope of scopes) {
    const linkedTasks = taskRecords
      .map((task) => ({ task, evidence: getTaskMatchEvidence(task, scope, cwd) }))
      .filter((entry) => entry.evidence.length > 0);

    const linkedDecisions = decisionRecords
      .map((decision) => ({ decision, evidence: getDecisionMatchEvidence(decision, scope, cwd) }))
      .filter((entry) => entry.evidence.length > 0);

    if (scope.kind === "missing") {
      findings.push({
        category: "scope",
        severity: "error",
        pathScope: scope.relativePath,
        message: "Analyzed path does not exist on disk.",
        evidence: [scope.relativePath],
        recommendedAction:
          "Choose an existing repository file or directory before running path-scoped learn analysis.",
      });
      continue;
    }

    if (linkedTasks.length === 0) {
      findings.push({
        category: "task-coverage",
        severity: "warning",
        pathScope: scope.relativePath,
        message: "No linked task references this path.",
        evidence: [
          "no codeTargets, publicDocs, traceLinks, or task files matched the analyzed scope",
        ],
        recommendedAction:
          activeContext === null
            ? "Create or link a governing task for this surface."
            : `Create or update a task in ${activeContext.active.milestone.id} that links this path.`,
      });
    }

    if (linkedDecisions.length === 0) {
      findings.push({
        category: "decision-coverage",
        severity: "warning",
        pathScope: scope.relativePath,
        message: "No architecture decision references this path.",
        evidence: ["no decision links.codeTargets or links.publicDocs entries matched the scope"],
        recommendedAction:
          activeContext === null
            ? "Create or link an owning architecture decision for this surface."
            : `Create or update a milestone-scoped decision for ${activeContext.active.milestone.id}.`,
      });
    }

    if (isDocumentationPath(scope.relativePath) && linkedTasks.length === 0 && linkedDecisions.length === 0) {
      findings.push({
        category: "docs-coverage",
        severity: "warning",
        pathScope: scope.relativePath,
        message: "Documentation exists on disk but is not linked from tasks or decisions.",
        evidence: [scope.relativePath],
        recommendedAction: "Link this document from the governing task or architecture decision.",
      });
    }

    const filtered = filterCheckResult(checkResult, { paths: scopePatterns(scope) });
    for (const diagnostic of filtered.diagnostics) {
      findings.push({
        category: "validation",
        severity: diagnostic.severity,
        pathScope: diagnostic.path ?? scope.relativePath,
        message: `[${diagnostic.code}] ${diagnostic.message}`,
        evidence: [diagnostic.path ?? scope.relativePath, ...(diagnostic.hint ? [diagnostic.hint] : [])],
        recommendedAction:
          scope.kind === "file"
            ? `Review ${scope.relativePath} and rerun pa check --file ${scope.relativePath}.`
            : `Review the ${scope.relativePath} surface and rerun pa check for that path scope.`,
      });
    }
  }

  const byCategory: Record<string, number> = {};
  for (const finding of findings) {
    increment(byCategory, finding.category);
  }

  const pathsWithFindings = new Set(findings.map((finding) => finding.pathScope));
  return {
    schemaVersion: "1.0",
    timestamp: new Date().toISOString(),
    analyzedPaths: scopes.map((scope) => scope.relativePath),
    findings,
    summary: {
      totalGaps: findings.length,
      byCategory,
      cleanPaths: scopes.filter((scope) => !pathsWithFindings.has(scope.relativePath)).length,
    },
    suggestedCommands: buildSuggestedCommands(findings, scopes, activeContext),
  };
}
