import path from "path";
import fg from "fast-glob";
import { collectDecisionRecords } from "./decisions";
import { collectTaskRecords } from "./tasks";
import { loadDecisionIndex, loadMilestoneManifest, loadPhaseManifest } from "../manifests";
import { milestoneDir, milestoneTaskLaneDir, phaseDir, projectDocsRoot } from "../../utils/paths";
import { pathExists, readJson } from "../../utils/fs";
import { runDriftChecks } from "../../graph/drift/runChecks";
import { conceptMapSchema } from "../../schemas/conceptMap";
import { reconciliationReportSchema } from "../../schemas/reconciliationReport";
import { findReconcileConfigPath, loadReconcileConfig } from "../reconciliation/triggerDetection";

export interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: CheckDiagnostic[];
}

export type CheckDiagnosticSeverity = "error" | "warning";

export interface CheckDiagnostic {
  code: string;
  severity: CheckDiagnosticSeverity;
  message: string;
  path: string | null;
  hint: string | null;
}

export interface CheckDiagnosticsPayload {
  schemaVersion: string;
  status: "ok" | "invalid";
  summary: {
    errorCount: number;
    warningCount: number;
    diagnosticCount: number;
  };
  diagnostics: CheckDiagnostic[];
}

export interface CheckDiagnosticFilters {
  only?: string[];
  severity?: CheckDiagnosticSeverity[];
  paths?: string[];
}

export interface RunRepositoryChecksOptions {
  failFast?: boolean;
}

export const CHECK_DIAGNOSTICS_SCHEMA_VERSION = "1.0";

const STABLE_DIAGNOSTIC_CODE_MAPPINGS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /^Duplicate task id in milestone scope:/, code: "DUPLICATE_TASK_ID" },
  { pattern: /^Missing code target '.*' referenced by task /, code: "MISSING_TASK_CODE_TARGET" },
  {
    pattern: /^Missing code target '.*' referenced by decision /,
    code: "MISSING_DECISION_CODE_TARGET",
  },
  {
    pattern: /^Missing public docs path '.*' referenced by task /,
    code: "MISSING_TASK_PUBLIC_DOC",
  },
  {
    pattern: /^Missing public docs path '.*' referenced by decision /,
    code: "MISSING_DECISION_PUBLIC_DOC",
  },
  {
    pattern: /^Task .* references undeclared module '.*' via '.*'\./,
    code: "TASK_UNDECLARED_MODULE",
  },
  {
    pattern: /^Decision .* references undeclared module '.*' via '.*'\./,
    code: "DECISION_UNDECLARED_MODULE",
  },
  {
    pattern: /^Task .* references undeclared domain '.*' in tag '.*'\./,
    code: "TASK_UNDECLARED_DOMAIN",
  },
  { pattern: /^Invalid decision task link '.*' in /, code: "INVALID_DECISION_TASK_LINK" },
  { pattern: /^Decision .* links missing task '.*'/, code: "MISSING_LINKED_TASK" },
  { pattern: /^Decision .* supersedes missing decision '.*'/, code: "MISSING_SUPERSEDED_DECISION" },
  {
    pattern: /^Project decision index references missing decision '.*'/,
    code: "PROJECT_DECISION_INDEX_MISSING_ENTRY",
  },
  {
    pattern: /^Phase .* decision index references missing decision '.*'/,
    code: "PHASE_DECISION_INDEX_MISSING_ENTRY",
  },
  {
    pattern: /^Milestone .* decision index references missing decision '.*'/,
    code: "MILESTONE_DECISION_INDEX_MISSING_ENTRY",
  },
  { pattern: /^Missing lane directory '/, code: "MISSING_LANE_DIRECTORY" },
  { pattern: /^Missing graph artifact '/, code: "MISSING_GRAPH_ARTIFACT" },
  { pattern: /^Graph parity mismatch:/, code: "GRAPH_PARITY_MISMATCH" },
  {
    pattern: /^Invalid concept-map schema at arch-model\/concept-map\.json:/,
    code: "INVALID_CONCEPT_MAP_SCHEMA",
  },
  {
    pattern:
      /^Invalid reconcile config schema at \.project-arch\/(?:reconcile\.config\.json|reconcile-config\.json):/,
    code: "INVALID_RECONCILE_CONFIG_SCHEMA",
  },
];

interface GraphSummary {
  schemaVersion: string;
  nodes: {
    tasks?: number;
  };
}

interface GraphTaskNode {
  id: string;
  status: string;
}

interface MilestoneToTaskEdge {
  milestone: string;
  task: string;
}

export async function runRepositoryChecks(
  cwd = process.cwd(),
  options: RunRepositoryChecksOptions = {},
): Promise<CheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const failFast = options.failFast === true;

  const addError = (message: string): boolean => {
    errors.push(message);
    return failFast;
  };

  const toResult = (): CheckResult => ({
    ok: errors.length === 0,
    errors,
    warnings,
    diagnostics: [
      ...errors.map((message) => toDiagnostic(message, "error")),
      ...warnings.map((message) => toDiagnostic(message, "warning")),
    ],
  });

  const taskRecords = await collectTaskRecords(cwd);
  const decisionRecords = await collectDecisionRecords(cwd);
  const declaredModules = await loadDeclaredModules(cwd);
  const declaredDomains = await loadDeclaredDomains(cwd);

  const conceptMapPath = path.join(cwd, "arch-model", "concept-map.json");
  if (await pathExists(conceptMapPath)) {
    try {
      const conceptMapRaw = await readJson<unknown>(conceptMapPath);
      conceptMapSchema.parse(conceptMapRaw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (addError(`Invalid concept-map schema at arch-model/concept-map.json: ${detail}`)) {
        return toResult();
      }
    }
  }

  const reconcileConfigPath = await findReconcileConfigPath(cwd);
  if (reconcileConfigPath) {
    try {
      await loadReconcileConfig(cwd);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const relativePath = path.relative(cwd, reconcileConfigPath);
      if (addError(`Invalid reconcile config schema at ${relativePath}: ${detail}`)) {
        return toResult();
      }
    }
  }

  const seenTaskKeys = new Set<string>();
  for (const task of taskRecords) {
    const key = `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`;
    if (seenTaskKeys.has(key)) {
      if (addError(`Duplicate task id in milestone scope: ${key}`)) {
        return toResult();
      }
    } else {
      seenTaskKeys.add(key);
    }

    for (const target of task.frontmatter.codeTargets) {
      const targetPath = path.join(cwd, target);
      if (!(await pathExists(targetPath))) {
        if (addError(`Missing code target '${target}' referenced by task ${key}`)) {
          return toResult();
        }
      }
      const runtimeModule = toRuntimeModule(target);
      if (runtimeModule && !declaredModules.has(runtimeModule)) {
        if (
          addError(
            `Task ${key} references undeclared module '${runtimeModule}' via '${target}'. Declare it in arch-model/modules.json before implementation.`,
          )
        ) {
          return toResult();
        }
      }
    }

    for (const ref of task.frontmatter.publicDocs) {
      const docPath = path.join(cwd, ref);
      if (!(await pathExists(docPath))) {
        if (addError(`Missing public docs path '${ref}' referenced by task ${key}`)) {
          return toResult();
        }
      }
    }

    for (const tag of task.frontmatter.tags) {
      const domainName = parseDomainTag(tag);
      if (domainName && !declaredDomains.has(domainName)) {
        if (
          addError(
            `Task ${key} references undeclared domain '${domainName}' in tag '${tag}'. Declare it in arch-domains/domains.json before implementation.`,
          )
        ) {
          return toResult();
        }
      }
    }
  }

  const decisionIds = new Set(decisionRecords.map((d) => d.frontmatter.id));

  for (const decision of decisionRecords) {
    const id = decision.frontmatter.id;

    for (const taskRef of decision.frontmatter.links.tasks) {
      const parts = taskRef.split("/");
      if (parts.length !== 3) {
        if (addError(`Invalid decision task link '${taskRef}' in ${id}`)) {
          return toResult();
        }
        continue;
      }
      const [phaseId, milestoneId, taskId] = parts;

      const linkedTask = taskRecords.find(
        (record) =>
          record.phaseId === phaseId &&
          record.milestoneId === milestoneId &&
          record.frontmatter.id === taskId,
      );
      if (!linkedTask) {
        if (addError(`Decision ${id} links missing task '${taskRef}'`)) {
          return toResult();
        }
      }
    }

    for (const target of decision.frontmatter.links.codeTargets) {
      const targetPath = path.join(cwd, target);
      if (!(await pathExists(targetPath))) {
        if (addError(`Missing code target '${target}' referenced by decision ${id}`)) {
          return toResult();
        }
      }
      const runtimeModule = toRuntimeModule(target);
      if (runtimeModule && !declaredModules.has(runtimeModule)) {
        if (
          addError(
            `Decision ${id} references undeclared module '${runtimeModule}' via '${target}'. Declare it in arch-model/modules.json before implementation.`,
          )
        ) {
          return toResult();
        }
      }
    }

    for (const ref of decision.frontmatter.links.publicDocs) {
      const docPath = path.join(cwd, ref);
      if (!(await pathExists(docPath))) {
        if (addError(`Missing public docs path '${ref}' referenced by decision ${id}`)) {
          return toResult();
        }
      }
    }

    const supersedes = decision.frontmatter.supersedes ?? [];
    for (const supersededId of supersedes) {
      if (!decisionIds.has(supersededId)) {
        if (addError(`Decision ${id} supersedes missing decision '${supersededId}'`)) {
          return toResult();
        }
      }
    }
  }

  const manifest = await loadPhaseManifest(cwd);
  const phaseIdsFromManifest = new Set(manifest.phases.map((p) => p.id));

  const phaseDirs = await fg("roadmap/phases/*", { cwd, onlyDirectories: true });
  for (const phasePath of phaseDirs) {
    const phaseId = path.basename(phasePath);
    if (!phaseIdsFromManifest.has(phaseId)) {
      if (addError(`Phase directory '${phaseId}' is missing in roadmap/manifest.json`)) {
        return toResult();
      }
    }

    const milestones = await fg(`roadmap/phases/${phaseId}/milestones/*`, {
      cwd,
      onlyDirectories: true,
      absolute: false,
    });

    for (const milestonePath of milestones.sort()) {
      const parts = milestonePath.split("/");
      const pId = phaseId;
      const mId = parts[4];

      if (!(await pathExists(milestoneDir(pId, mId, cwd)))) {
        continue;
      }

      try {
        await loadMilestoneManifest(pId, mId, cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (addError(message)) {
          return toResult();
        }
      }

      for (const lane of ["planned", "discovered", "backlog"] as const) {
        const laneDir = milestoneTaskLaneDir(pId, mId, lane, cwd);
        if (!(await pathExists(laneDir))) {
          if (addError(`Missing lane directory '${laneDir}'`)) {
            return toResult();
          }
        }
      }
    }
  }

  const projectDecisionIndex = await loadDecisionIndex(
    path.join(projectDocsRoot(cwd), "decisions"),
  );
  for (const id of projectDecisionIndex.decisions) {
    if (!decisionIds.has(id)) {
      if (addError(`Project decision index references missing decision '${id}'`)) {
        return toResult();
      }
    }
  }

  for (const phaseId of phaseIdsFromManifest) {
    const index = await loadDecisionIndex(path.join(phaseDir(phaseId, cwd), "decisions"));
    for (const id of index.decisions) {
      if (!decisionIds.has(id)) {
        if (addError(`Phase ${phaseId} decision index references missing decision '${id}'`)) {
          return toResult();
        }
      }
    }

    const milestones = await fg(`roadmap/phases/${phaseId}/milestones/*`, {
      cwd,
      onlyDirectories: true,
    });
    for (const milestonePath of milestones.sort()) {
      const mId = path.basename(milestonePath);
      const mIndex = await loadDecisionIndex(
        path.join(milestoneDir(phaseId, mId, cwd), "decisions"),
      );
      for (const id of mIndex.decisions) {
        if (!decisionIds.has(id)) {
          if (
            addError(
              `Milestone ${phaseId}/${mId} decision index references missing decision '${id}'`,
            )
          ) {
            return toResult();
          }
        }
      }
    }
  }

  const parityErrors = await runTaskGraphParityChecks(cwd, taskRecords, { failFast });
  for (const parityError of parityErrors) {
    if (addError(parityError)) {
      return toResult();
    }
  }

  const driftFindings = await runDriftChecks({ cwd, taskRecords, decisionRecords });
  for (const finding of driftFindings) {
    const rendered = `[${finding.code}] ${finding.message}`;
    if (finding.severity === "error") {
      if (addError(rendered)) {
        return toResult();
      }
    } else {
      warnings.push(rendered);
    }
  }

  const outstandingToolingFeedback = await countOutstandingToolingFeedbackReports(cwd);
  if (outstandingToolingFeedback > 0) {
    warnings.push(
      `[OUTSTANDING_TOOLING_FEEDBACK] Outstanding tooling-feedback reports: ${outstandingToolingFeedback} in .project-arch/feedback/`,
    );
  }

  return toResult();
}

async function countOutstandingToolingFeedbackReports(cwd: string): Promise<number> {
  const feedbackReportFiles = await fg(".project-arch/feedback/*.json", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  let count = 0;
  for (const reportFile of feedbackReportFiles) {
    try {
      const payload = await readJson<unknown>(reportFile);
      const parsed = reconciliationReportSchema.safeParse(payload);
      if (!parsed.success) {
        continue;
      }

      if (parsed.data.type !== "tooling-feedback") {
        continue;
      }

      if (parsed.data.status !== "reconciliation complete") {
        count += 1;
      }
    } catch {
      continue;
    }
  }

  return count;
}

export function toCheckDiagnosticsPayload(result: CheckResult): CheckDiagnosticsPayload {
  return {
    schemaVersion: CHECK_DIAGNOSTICS_SCHEMA_VERSION,
    status: result.ok ? "ok" : "invalid",
    summary: {
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      diagnosticCount: result.diagnostics.length,
    },
    diagnostics: result.diagnostics,
  };
}

export function filterCheckResult(
  result: CheckResult,
  filters: CheckDiagnosticFilters,
): CheckResult {
  const normalizedCodes = new Set((filters.only ?? []).map((code) => code.trim().toUpperCase()));
  const normalizedSeverities = new Set(
    (filters.severity ?? []).map(
      (severity) => severity.trim().toLowerCase() as CheckDiagnosticSeverity,
    ),
  );
  const pathPatterns = (filters.paths ?? []).map((pattern) => pattern.trim()).filter(Boolean);

  const diagnostics = result.diagnostics.filter((diagnostic) => {
    if (normalizedCodes.size > 0 && !normalizedCodes.has(diagnostic.code.toUpperCase())) {
      return false;
    }

    if (normalizedSeverities.size > 0 && !normalizedSeverities.has(diagnostic.severity)) {
      return false;
    }

    if (pathPatterns.length > 0) {
      if (!diagnostic.path) {
        return false;
      }
      const normalizedPath = diagnostic.path.replace(/\\/g, "/");
      if (!pathPatterns.some((pattern) => matchGlob(normalizedPath, pattern))) {
        return false;
      }
    }

    return true;
  });

  const errors = diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map(renderDiagnosticForTextOutput);
  const warnings = diagnostics
    .filter((diagnostic) => diagnostic.severity === "warning")
    .map(renderDiagnosticForTextOutput);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    diagnostics,
  };
}

async function runTaskGraphParityChecks(
  cwd: string,
  taskRecords: Awaited<ReturnType<typeof collectTaskRecords>>,
  options: { failFast?: boolean } = {},
): Promise<string[]> {
  const errors: string[] = [];
  const failFast = options.failFast === true;
  const addError = (message: string): boolean => {
    errors.push(message);
    return failFast;
  };

  const graphPath = path.join(cwd, ".arch", "graph.json");
  const graphTasksPath = path.join(cwd, ".arch", "nodes", "tasks.json");
  const milestoneToTaskPath = path.join(cwd, ".arch", "edges", "milestone_to_task.json");

  if (!(await pathExists(graphPath))) {
    addError(
      "Missing graph artifact '.arch/graph.json'. Rebuild graph artifacts before running parity validation.",
    );
    return errors;
  }

  if (!(await pathExists(graphTasksPath))) {
    addError(
      "Missing graph artifact '.arch/nodes/tasks.json'. Rebuild graph artifacts before running parity validation.",
    );
    return errors;
  }

  if (!(await pathExists(milestoneToTaskPath))) {
    addError(
      "Missing graph artifact '.arch/edges/milestone_to_task.json'. Rebuild graph artifacts before running parity validation.",
    );
    return errors;
  }

  const graph = await readJson<GraphSummary>(graphPath);
  const graphTaskNodes = await readJson<{ tasks: GraphTaskNode[] }>(graphTasksPath);
  const milestoneToTask = await readJson<{ edges: MilestoneToTaskEdge[] }>(milestoneToTaskPath);

  const roadmapTaskMap = new Map<string, string>();
  for (const task of taskRecords) {
    const taskRef = `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`;
    roadmapTaskMap.set(taskRef, task.frontmatter.status);
  }

  const graphTaskMap = new Map<string, string>();
  for (const task of graphTaskNodes.tasks ?? []) {
    graphTaskMap.set(task.id, task.status);
  }

  const roadmapCount = roadmapTaskMap.size;
  const graphNodeCount = graphTaskMap.size;
  const graphSummaryCount = graph.nodes.tasks;

  if (graphSummaryCount !== undefined && graphSummaryCount !== graphNodeCount) {
    if (
      addError(
        `Graph parity mismatch: .arch/graph.json reports nodes.tasks=${graphSummaryCount}, but .arch/nodes/tasks.json has ${graphNodeCount} task nodes.`,
      )
    ) {
      return errors;
    }
  }

  if (roadmapCount !== graphNodeCount) {
    if (
      addError(
        `Graph parity mismatch: roadmap task files count is ${roadmapCount}, but .arch task node count is ${graphNodeCount} (.arch/nodes/tasks.json).`,
      )
    ) {
      return errors;
    }
  }

  for (const taskRef of roadmapTaskMap.keys()) {
    if (!graphTaskMap.has(taskRef)) {
      if (
        addError(`Graph parity mismatch: missing task node '${taskRef}' in .arch/nodes/tasks.json`)
      ) {
        return errors;
      }
    }
  }

  const milestoneEdges = new Set(
    (milestoneToTask.edges ?? []).map((edge) => `${edge.milestone}=>${edge.task}`),
  );

  for (const [taskRef, roadmapStatus] of roadmapTaskMap.entries()) {
    const milestoneRef = taskRef.split("/").slice(0, 2).join("/");
    const expectedEdge = `${milestoneRef}=>${taskRef}`;
    if (!milestoneEdges.has(expectedEdge)) {
      if (
        addError(
          `Graph parity mismatch: missing milestone-task edge '${milestoneRef}' -> '${taskRef}' in .arch/edges/milestone_to_task.json`,
        )
      ) {
        return errors;
      }
    }

    const graphStatus = graphTaskMap.get(taskRef);
    if (graphStatus !== undefined && graphStatus !== roadmapStatus) {
      if (
        addError(
          `Graph parity mismatch: status drift for task '${taskRef}' (roadmap='${roadmapStatus}', graph='${graphStatus}') in .arch/nodes/tasks.json`,
        )
      ) {
        return errors;
      }
    }
  }

  return errors;
}

function toRuntimeModule(target: string): string | null {
  const normalized = target.replace(/\\/g, "/");
  if (!normalized.startsWith("apps/") && !normalized.startsWith("packages/")) {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function parseDomainTag(tag: string): string | null {
  const lower = tag.toLowerCase();
  const prefix = "domain:";
  if (!lower.startsWith(prefix)) {
    return null;
  }
  const value = lower.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

async function loadDeclaredModules(cwd: string): Promise<Set<string>> {
  const modulesPath = path.join(cwd, "arch-model", "modules.json");
  if (!(await pathExists(modulesPath))) {
    return new Set<string>();
  }
  const raw = await readJson<{ modules?: unknown }>(modulesPath);
  if (!Array.isArray(raw.modules)) {
    return new Set<string>();
  }
  const modules = raw.modules
    .filter(
      (item): item is { name: string } =>
        !!item && typeof item === "object" && typeof item.name === "string",
    )
    .map((item) => item.name);
  return new Set(modules);
}

async function loadDeclaredDomains(cwd: string): Promise<Set<string>> {
  const domainsPath = path.join(cwd, "arch-domains", "domains.json");
  if (!(await pathExists(domainsPath))) {
    return new Set<string>();
  }
  const raw = await readJson<{ domains?: unknown }>(domainsPath);
  if (!Array.isArray(raw.domains)) {
    return new Set<string>();
  }
  const domains = raw.domains
    .filter(
      (item): item is { name: string } =>
        !!item && typeof item === "object" && typeof item.name === "string",
    )
    .map((item) => item.name.toLowerCase());
  return new Set(domains);
}

function toDiagnostic(message: string, severity: CheckDiagnosticSeverity): CheckDiagnostic {
  const parsed = parseDiagnosticCode(message);
  const normalizedMessage = parsed.message;
  return {
    code:
      parsed.code ??
      resolveStableDiagnosticCode(normalizedMessage) ??
      (severity === "error" ? "CHECK_ERROR" : "CHECK_WARNING"),
    severity,
    message: normalizedMessage,
    path: extractPath(normalizedMessage),
    hint: extractHint(normalizedMessage),
  };
}

function resolveStableDiagnosticCode(message: string): string | null {
  for (const mapping of STABLE_DIAGNOSTIC_CODE_MAPPINGS) {
    if (mapping.pattern.test(message)) {
      return mapping.code;
    }
  }
  return null;
}

function parseDiagnosticCode(message: string): { code: string | null; message: string } {
  const match = message.match(/^\[([A-Z0-9_]+)\]\s+(.+)$/);
  if (!match) {
    return { code: null, message };
  }
  return {
    code: match[1],
    message: match[2],
  };
}

function extractPath(message: string): string | null {
  const quotedMatch = message.match(
    /'((?:\.arch|\.project-arch|arch-model|arch-domains|roadmap|apps|packages)\/[^'\s]+)'/,
  );
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const inlineMatch = message.match(
    /(?:\.arch|\.project-arch|arch-model|arch-domains|roadmap|apps|packages)\/[^\s'\])]+/,
  );
  if (inlineMatch) {
    return inlineMatch[0];
  }

  const conceptMapMatch = message.match(/at\s+(arch-model\/concept-map\.json)/);
  if (conceptMapMatch) {
    return conceptMapMatch[1];
  }

  return null;
}

function extractHint(message: string): string | null {
  const declareIdx = message.indexOf("Declare it in ");
  if (declareIdx >= 0) {
    return message.slice(declareIdx).trim();
  }

  const rebuildIdx = message.indexOf("Rebuild graph artifacts");
  if (rebuildIdx >= 0) {
    return message.slice(rebuildIdx).trim();
  }

  return null;
}

function renderDiagnosticForTextOutput(diagnostic: CheckDiagnostic): string {
  if (diagnostic.code === "CHECK_ERROR" || diagnostic.code === "CHECK_WARNING") {
    return diagnostic.message;
  }
  return `[${diagnostic.code}] ${diagnostic.message}`;
}

function matchGlob(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexPattern = escaped
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    .replace(/\?/g, "[^/]");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}
