import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import { collectDecisionRecords } from "./decisions";
import { collectTaskRecords } from "./tasks";
import {
  loadDecisionIndex,
  loadMilestoneManifest,
  loadPhaseManifest,
  preferredMilestoneDecisionIndexDir,
  preferredPhaseDecisionIndexDir,
} from "../manifests";
import {
  phaseDir,
  projectDocsRoot,
  projectMilestoneTargetsPath,
  projectPhaseDir,
  projectPhaseValidationContractPath,
} from "../../utils/paths";
import { pathExists, readJson } from "../../utils/fs";
import { runDriftChecks } from "../../graph/drift/runChecks";
import { conceptMapSchema } from "../../schemas/conceptMap";
import { reconciliationReportSchema } from "../../schemas/reconciliationReport";
import { validationContractSchema } from "../../schemas/validationContract";
import { findReconcileConfigPath, loadReconcileConfig } from "../reconciliation/triggerDetection";
import { classifyModuleTarget, loadModuleGraphConfig } from "../../graph/moduleClassification";
import { findDuplicateReconciliationOverrides } from "../reconciliation/lifecycle";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";
import { resolvePhaseProjectId } from "../manifests";
import { resolvePreferredTaskLaneDir } from "../runtime/projectPaths";
import {
  resolveRuntimeCompatibilityContract,
  type RuntimeCompatibilityContract,
} from "../runtime/compatibility";

export interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: CheckDiagnostic[];
  graphDiagnostics?: CheckGraphDiagnostics;
  compatibility?: RuntimeCompatibilityContract;
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
  graphDiagnostics: CheckGraphDiagnostics;
  compatibility: RuntimeCompatibilityContract;
}

export interface CheckDiagnosticFilters {
  only?: string[];
  severity?: CheckDiagnosticSeverity[];
  paths?: string[];
}

export interface RunRepositoryChecksOptions {
  failFast?: boolean;
  completenessThreshold?: number;
  coverageMode?: "warning" | "error";
}

export interface CheckGraphDiagnostics {
  built: boolean;
  completeness: {
    score: number;
    threshold: number;
    sufficient: boolean;
    connectedDecisionNodes: number;
    totalDecisionNodes: number;
  };
  disconnectedNodes: {
    decisionsWithoutDomain: string[];
    decisionsWithoutTaskBackReferences: string[];
    domainsWithoutDecisions: string[];
    taskReferencesToMissingDecisions: Array<{ task: string; decision: string }>;
  };
}

export const CHECK_DIAGNOSTICS_SCHEMA_VERSION = "1.0";
const DEFAULT_COMPLETENESS_THRESHOLD = 0;
const DEFAULT_COVERAGE_MODE: "warning" | "error" = "warning";

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
    pattern: /^Task .* codeTarget '.*' resolves to non-module artifact layer '.*'\./,
    code: "TASK_NON_MODULE_CODE_TARGET",
  },
  {
    pattern:
      /^Duplicate reconciliation override entries for task '.*' in \.project-arch\/reconcile\//,
    code: "DUPLICATE_RECONCILIATION_OVERRIDE",
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
  { pattern: /^Malformed task file '/, code: "MALFORMED_TASK_FILE" },
  { pattern: /^Validation contract not found for phase '/, code: "PAV_CONTRACT_MISSING" },
  {
    pattern: /^Invalid validation contract schema for phase '/,
    code: "PAV_CONTRACT_INVALID_SCHEMA",
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
  const completenessThreshold = normalizeCompletenessThreshold(options.completenessThreshold);
  const coverageMode = normalizeCoverageMode(options.coverageMode);
  let graphDiagnostics: CheckGraphDiagnostics = {
    ...buildDefaultGraphDiagnostics(),
    completeness: {
      ...buildDefaultGraphDiagnostics().completeness,
      threshold: completenessThreshold,
    },
  };
  const compatibility = await resolveRuntimeCompatibilityContract("validation", cwd);

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
    graphDiagnostics,
    compatibility,
  });

  if (!compatibility.supported) {
    addError(`[RUNTIME_COMPATIBILITY_UNSUPPORTED] ${compatibility.reason} Detected runtime mode: ${compatibility.mode}.`);
    return toResult();
  }

  const taskParseErrors: Array<{ filePath: string; error: Error }> = [];
  const taskRecords = await collectTaskRecords(cwd, {
    onError: (filePath, error) => taskParseErrors.push({ filePath, error }),
  });

  // Emit per-file parse errors as first-class diagnostics before any other checks.
  // We continue past these so that well-formed files still get validated.
  for (const { filePath, error } of taskParseErrors) {
    const relative = path.relative(cwd, filePath);
    const detail = error.message.split("\n")[0]; // first line only – keep messages compact
    if (addError(`Malformed task file '${relative}': ${detail}`)) {
      return toResult();
    }
  }

  const decisionRecords = await collectDecisionRecords(cwd);
  const declaredModules = await loadDeclaredModules(cwd);
  const declaredDomains = await loadDeclaredDomains(cwd);
  const moduleGraphConfig = await loadModuleGraphConfig(cwd);

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

  const duplicateOverrides = await findDuplicateReconciliationOverrides(cwd);
  for (const duplicate of duplicateOverrides) {
    if (
      addError(
        `Duplicate reconciliation override entries for task '${duplicate.taskId}' in .project-arch/reconcile/: ${duplicate.files.join(", ")}. Run 'pa reconcile prune --apply' to retain only the current-state record.`,
      )
    ) {
      return toResult();
    }
  }

  const coverageDiagnostics = await collectPlanningCoverageDiagnostics(cwd, taskRecords, {
    mode: coverageMode,
  });
  for (const diagnostic of coverageDiagnostics) {
    const rendered = `[${diagnostic.code}] ${diagnostic.message}`;
    if (diagnostic.severity === "error") {
      if (addError(rendered)) {
        return toResult();
      }
    } else {
      warnings.push(rendered);
    }
  }

  const seenTaskKeys = new Set<string>();
  for (const task of taskRecords) {
    const key = formatTaskRef(task.projectId, task.phaseId, task.milestoneId, task.frontmatter.id);
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
      const classification = classifyModuleTarget(target, moduleGraphConfig);
      const runtimeModule = classification.isRuntime ? classification.module : null;
      if (!classification.suppressed && !classification.isRuntime) {
        warnings.push(
          `Task ${key} codeTarget '${target}' resolves to non-module artifact layer '${classification.layer}'. Use runtime module paths or suppress/classify it in .project-arch/graph.config.json.`,
        );
      }
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
      const classification = classifyModuleTarget(target, moduleGraphConfig);
      const runtimeModule = classification.isRuntime ? classification.module : null;
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

  const contractDiagnostics = await collectValidationContractDiagnostics(cwd, manifest);
  for (const diagnostic of contractDiagnostics) {
    const rendered = `[${diagnostic.code}] ${diagnostic.message}`;
    if (addError(rendered)) {
      return toResult();
    }
  }

  const phaseDirs = await fg("roadmap/phases/*", {
    cwd,
    onlyDirectories: true,
    absolute: false,
    followSymbolicLinks: false,
  });
  const safePhaseDirs = await filterGlobPathsBySymlinkPolicy(phaseDirs, cwd);
  const scannedPhaseIds = new Set<string>();
  const manifestPhaseRecords = [...manifest.phases].sort((a, b) => a.id.localeCompare(b.id));

  for (const phaseRecord of manifestPhaseRecords) {
    const phaseId = phaseRecord.id;
    scannedPhaseIds.add(phaseId);
    const runtimePaths = await resolveMilestoneAwarePhaseDir(cwd, phaseId, phaseRecord.projectId);

    if (!phaseIdsFromManifest.has(phaseId)) {
      if (addError(`Phase directory '${phaseId}' is missing in roadmap/manifest.json`)) {
        return toResult();
      }
    }

    const milestones = await fg(path.join(runtimePaths.phaseDir, "milestones", "*").replace(/\\/g, "/"), {
      onlyDirectories: true,
      absolute: true,
      followSymbolicLinks: false,
    });
    const safeMilestones = await filterGlobPathsBySymlinkPolicy(milestones, cwd, {
      pathsAreAbsolute: true,
    });

    for (const milestonePath of safeMilestones.sort()) {
      const pId = phaseId;
      const mId = path.basename(milestonePath);

      try {
        await loadMilestoneManifest(pId, mId, cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (addError(message)) {
          return toResult();
        }
      }

      for (const lane of ["planned", "discovered", "backlog"] as const) {
        const laneDir = await resolvePreferredTaskLaneDir(pId, mId, lane, cwd);
        if (!(await pathExists(laneDir))) {
          if (addError(`Missing lane directory '${laneDir}'`)) {
            return toResult();
          }
        }
      }
    }
  }

  for (const phasePath of safePhaseDirs) {
    const phaseId = path.basename(phasePath);
    if (scannedPhaseIds.has(phaseId)) {
      continue;
    }
    if (!phaseIdsFromManifest.has(phaseId)) {
      if (addError(`Phase directory '${phaseId}' is missing in roadmap/manifest.json`)) {
        return toResult();
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
    const projectId = resolvePhaseProjectId(manifest, phaseId);
    const index = await loadDecisionIndex(await preferredPhaseDecisionIndexDir(phaseId, cwd));
    for (const id of index.decisions) {
      if (!decisionIds.has(id)) {
        if (
          addError(
            `Phase ${formatPhaseRef(projectId, phaseId)} decision index references missing decision '${id}'`,
          )
        ) {
          return toResult();
        }
      }
    }

    const milestoneRuntimePaths = await resolveMilestoneAwarePhaseDir(
      cwd,
      phaseId,
      resolvePhaseProjectId(manifest, phaseId),
    );
    const milestones = await fg(path.join(milestoneRuntimePaths.phaseDir, "milestones", "*").replace(/\\/g, "/"), {
      onlyDirectories: true,
      absolute: true,
      followSymbolicLinks: false,
    });
    const safeMilestones = await filterGlobPathsBySymlinkPolicy(milestones, cwd, {
      pathsAreAbsolute: true,
    });
    for (const milestonePath of safeMilestones.sort()) {
      const mId = path.basename(milestonePath);
      const mIndex = await loadDecisionIndex(await preferredMilestoneDecisionIndexDir(phaseId, mId, cwd));
      for (const id of mIndex.decisions) {
        if (!decisionIds.has(id)) {
          if (
            addError(
              `Milestone ${formatMilestoneRef(projectId, phaseId, mId)} decision index references missing decision '${id}'`,
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

  const driftResult = await runDriftChecks({
    cwd,
    taskRecords,
    decisionRecords,
    completenessThreshold,
  });
  graphDiagnostics = {
    built: true,
    completeness: {
      score: driftResult.graphCompleteness.summary.score,
      threshold: driftResult.graphCompleteness.summary.threshold,
      sufficient: driftResult.graphCompleteness.summary.sufficient,
      connectedDecisionNodes: driftResult.graphCompleteness.summary.connectedDecisionNodes,
      totalDecisionNodes: driftResult.graphCompleteness.summary.totalDecisionNodes,
    },
    disconnectedNodes: driftResult.graphCompleteness.disconnected,
  };

  for (const finding of driftResult.findings) {
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
    followSymbolicLinks: false,
  });
  const safeFeedbackReportFiles = await filterGlobPathsBySymlinkPolicy(feedbackReportFiles, cwd, {
    pathsAreAbsolute: true,
  });

  let count = 0;
  for (const reportFile of safeFeedbackReportFiles) {
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
  const graphDiagnostics = result.graphDiagnostics ?? buildDefaultGraphDiagnostics();
  const compatibility = result.compatibility ?? buildDefaultValidationCompatibilityContract();
  return {
    schemaVersion: CHECK_DIAGNOSTICS_SCHEMA_VERSION,
    status: result.ok ? "ok" : "invalid",
    summary: {
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      diagnosticCount: result.diagnostics.length,
    },
    diagnostics: result.diagnostics,
    graphDiagnostics,
    compatibility,
  };
}

export function filterCheckResult(
  result: CheckResult,
  filters: CheckDiagnosticFilters,
): CheckResult {
  const onlyFilters = Array.isArray(filters.only) ? filters.only : [];
  const severityFilters = Array.isArray(filters.severity) ? filters.severity : [];
  const pathFilters = Array.isArray(filters.paths) ? filters.paths : [];

  const normalizedCodes = new Set(onlyFilters.map((code) => code.trim().toUpperCase()));
  const normalizedSeverities = new Set(
    severityFilters.map((severity) => severity.trim().toLowerCase() as CheckDiagnosticSeverity),
  );
  const pathPatterns = pathFilters.map((pattern) => pattern.trim()).filter(Boolean);

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
    graphDiagnostics: result.graphDiagnostics,
    compatibility: result.compatibility,
  };
}

function normalizeCompletenessThreshold(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_COMPLETENESS_THRESHOLD;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return Number(value.toFixed(2));
}

function normalizeCoverageMode(value: "warning" | "error" | undefined): "warning" | "error" {
  if (value === "warning" || value === "error") {
    return value;
  }
  return DEFAULT_COVERAGE_MODE;
}

interface PlanningCoverageDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
}

async function collectPlanningCoverageDiagnostics(
  cwd: string,
  taskRecords: Awaited<ReturnType<typeof collectTaskRecords>>,
  input: { mode: "warning" | "error" },
): Promise<PlanningCoverageDiagnostic[]> {
  const severity = input.mode;
  const diagnostics: PlanningCoverageDiagnostic[] = [];

  const plannedTasks = taskRecords
    .filter((task) => task.lane === "planned")
    .sort((left, right) => {
      const leftRef = `${left.phaseId}/${left.milestoneId}/${left.frontmatter.id}`;
      const rightRef = `${right.phaseId}/${right.milestoneId}/${right.frontmatter.id}`;
      return leftRef.localeCompare(rightRef);
    });

  const milestoneGroups = new Map<string, typeof plannedTasks>();
  for (const task of plannedTasks) {
    const key = `${task.phaseId}/${task.milestoneId}`;
    const group = milestoneGroups.get(key);
    if (group) {
      group.push(task);
    } else {
      milestoneGroups.set(key, [task]);
    }
  }

  for (const [milestoneRef, tasks] of [...milestoneGroups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const [phaseId, milestoneId] = milestoneRef.split("/");
    const targetAreas = await loadDeclaredTargetAreas(cwd, phaseId, milestoneId);
    const manifest = await loadPhaseManifest(cwd);
    const phasePathPrefix = path
      .relative(cwd, projectPhaseDir(resolvePhaseProjectId(manifest, phaseId), phaseId, cwd))
      .replace(/\\/g, "/");

    for (const targetArea of targetAreas) {
      const covered = tasks.some((task) => taskLinksTargetArea(task.frontmatter, targetArea));
      if (!covered) {
        diagnostics.push({
          code: "PAC_TARGET_UNCOVERED",
          severity,
          message:
            `Coverage gap: milestone ${formatMilestoneRef(resolvePhaseProjectId(manifest, phaseId), phaseId, milestoneId)} target area '${targetArea}' has no planned task linkage. ` +
            "Add a planned task with matching codeTargets/publicDocs/traceLinks.",
        });
      }
    }

    for (const task of tasks) {
      const taskRef = formatTaskRef(
        task.projectId,
        task.phaseId,
        task.milestoneId,
        task.frontmatter.id,
      );
      if (
        !taskHasObjectiveTrace(phasePathPrefix, task.milestoneId, task.frontmatter.traceLinks ?? [])
      ) {
        diagnostics.push({
          code: "PAC_TASK_MISSING_OBJECTIVE_TRACE",
          severity,
          message:
            `Coverage gap: planned task ${taskRef} has no phase/milestone objective trace link. ` +
            "Add traceLinks pointing to phase overview, milestone overview, or milestone targets.",
        });
      }
    }
  }

  diagnostics.sort((left, right) => {
    if (left.code !== right.code) {
      return left.code.localeCompare(right.code);
    }
    return left.message.localeCompare(right.message);
  });

  return diagnostics;
}

function normalizeRepoRef(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const withoutGlob = normalized.replace(/\/*\*+$/g, "");
  if (withoutGlob.endsWith("/")) {
    return withoutGlob.slice(0, -1);
  }
  return withoutGlob;
}

function taskLinksTargetArea(
  frontmatter: { codeTargets: string[]; publicDocs: string[]; traceLinks?: string[] },
  targetArea: string,
): boolean {
  const normalizedTarget = normalizeRepoRef(targetArea);
  if (normalizedTarget.length === 0) {
    return true;
  }

  const links = [
    ...frontmatter.codeTargets,
    ...frontmatter.publicDocs,
    ...(frontmatter.traceLinks ?? []),
  ].map(normalizeRepoRef);

  return links.some(
    (link) =>
      link === normalizedTarget ||
      link.startsWith(`${normalizedTarget}/`) ||
      (normalizedTarget === "packages" && link.startsWith("packages/")),
  );
}

function taskHasObjectiveTrace(
  phasePathPrefix: string,
  milestoneId: string,
  traceLinks: string[],
): boolean {
  const normalizedLinks = traceLinks.map(normalizeRepoRef);
  const accepted = [
    `${phasePathPrefix}/overview.md`,
    `${phasePathPrefix}/milestones/${milestoneId}/overview.md`,
    `${phasePathPrefix}/milestones/${milestoneId}/targets.md`,
  ];

  return normalizedLinks.some((link) => accepted.includes(link));
}

interface ValidationContractDiagnostic {
  code: string;
  message: string;
}

async function collectValidationContractDiagnostics(
  cwd: string,
  manifest: Awaited<ReturnType<typeof loadPhaseManifest>>,
): Promise<ValidationContractDiagnostic[]> {
  const diagnostics: ValidationContractDiagnostic[] = [];
  const phaseIds = manifest.phases.map((p) => p.id).sort();

  for (const phaseId of phaseIds) {
    const projectId = resolvePhaseProjectId(manifest, phaseId);
    const canonicalContractPath = projectPhaseValidationContractPath(projectId, phaseId, cwd);
    const legacyContractPath = path.join(cwd, "roadmap", "phases", phaseId, "validation-contract.json");
    const contractPath = (await pathExists(canonicalContractPath))
      ? canonicalContractPath
      : legacyContractPath;

    if (!(await pathExists(contractPath))) {
      diagnostics.push({
        code: "PAV_CONTRACT_MISSING",
        message:
          `Validation contract not found for phase '${formatPhaseRef(projectId, phaseId)}' ` +
          `at ${path.relative(cwd, canonicalContractPath).replace(/\\/g, "/")}`,
      });
      continue;
    }

    try {
      const contractRaw = await readJson<unknown>(contractPath);
      validationContractSchema.parse(contractRaw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      diagnostics.push({
        code: "PAV_CONTRACT_INVALID_SCHEMA",
        message:
          `Invalid validation contract schema for phase '${formatPhaseRef(projectId, phaseId)}' ` +
          `at ${path.relative(cwd, contractPath).replace(/\\/g, "/")}: ${detail}`,
      });
    }
  }

  diagnostics.sort((left, right) => {
    if (left.code !== right.code) {
      return left.code.localeCompare(right.code);
    }
    return left.message.localeCompare(right.message);
  });

  return diagnostics;
}

async function loadDeclaredTargetAreas(
  cwd: string,
  phaseId: string,
  milestoneId: string,
): Promise<string[]> {
  const manifest = await loadPhaseManifest(cwd);
  const projectId = resolvePhaseProjectId(manifest, phaseId);
  const canonicalTargetsPath = projectMilestoneTargetsPath(projectId, phaseId, milestoneId, cwd);
  const legacyTargetsPath = path.join(cwd, "roadmap", "phases", phaseId, "milestones", milestoneId, "targets.md");
  const targetsPath = (await pathExists(canonicalTargetsPath))
    ? canonicalTargetsPath
    : legacyTargetsPath;

  if (!(await pathExists(targetsPath))) {
    return [];
  }

  const content = await fs.readFile(targetsPath, "utf8");
  const matches = [...content.matchAll(/`([^`]+)`/g)]
    .map((match) => normalizeRepoRef(match[1] ?? ""))
    .filter((value) =>
      /^(apps|packages|architecture|arch-model|arch-domains|roadmap)\//.test(value),
    );

  return [...new Set(matches)].sort((a, b) => a.localeCompare(b));
}

async function resolveMilestoneAwarePhaseDir(
  cwd: string,
  phaseId: string,
  projectId: string,
): Promise<{ phaseDir: string; phasePathPrefix: string }> {
  const canonicalPhaseDir = projectPhaseDir(projectId, phaseId, cwd);
  if (await pathExists(canonicalPhaseDir)) {
    return {
      phaseDir: canonicalPhaseDir,
      phasePathPrefix: path.relative(cwd, canonicalPhaseDir).replace(/\\/g, "/"),
    };
  }

  const legacyPhaseDir = phaseDir(phaseId, cwd);
  return {
    phaseDir: legacyPhaseDir,
    phasePathPrefix: path.relative(cwd, legacyPhaseDir).replace(/\\/g, "/"),
  };
}

function buildDefaultGraphDiagnostics(): CheckGraphDiagnostics {
  return {
    built: false,
    completeness: {
      score: 100,
      threshold: DEFAULT_COMPLETENESS_THRESHOLD,
      sufficient: true,
      connectedDecisionNodes: 0,
      totalDecisionNodes: 0,
    },
    disconnectedNodes: {
      decisionsWithoutDomain: [],
      decisionsWithoutTaskBackReferences: [],
      domainsWithoutDecisions: [],
      taskReferencesToMissingDecisions: [],
    },
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

function buildDefaultValidationCompatibilityContract(): RuntimeCompatibilityContract {
  return {
    surface: "validation",
    mode: "project-scoped-only",
    supported: true,
    canonicalRootExists: true,
    legacyRootExists: false,
    reason: "Compatibility contract not supplied by caller.",
  };
}

function formatPhaseRef(projectId: string, phaseId: string): string {
  return `${projectId}/${phaseId}`;
}

function formatMilestoneRef(projectId: string, phaseId: string, milestoneId: string): string {
  return `${formatPhaseRef(projectId, phaseId)}/${milestoneId}`;
}

function formatTaskRef(
  projectId: string,
  phaseId: string,
  milestoneId: string,
  taskId: string,
): string {
  return `${formatMilestoneRef(projectId, phaseId, milestoneId)}/${taskId}`;
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
