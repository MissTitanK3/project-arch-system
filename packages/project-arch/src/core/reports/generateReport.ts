import path from "path";
import fg from "fast-glob";
import { collectDecisionRecords } from "../../core/validation/decisions";
import { collectTaskRecords } from "../../core/validation/tasks";
import {
  calculateDiscoveredRatioPercent,
  formatPercent,
  resolveDiscoveredLoadThresholdPercent,
} from "../../core/governance/discoveredLoad";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";
import { isSensitivePath } from "../../utils/sensitivePaths";
import { loadPhaseManifest } from "../../graph/manifests";
import { resolvePhaseProjectId } from "../manifests";
import { pathExists, readJson } from "../../utils/fs";
import { phaseDir, projectPhaseDir } from "../../utils/paths";
import { resolveRuntimeCompatibilityContract } from "../runtime/compatibility";

interface ConsistencyDiagnostic {
  type: "activeMilestone" | "activePhase";
  canonical: string | null;
  secondarySurface: "filesystem";
  secondaryValue: string | null;
  offendingPath: string;
}

interface ParityDiagnostic {
  entityType: "task";
  entityId: string;
  roadmapStatus: string;
  graphStatus: string;
  filePath: string;
}

interface GraphMetadata {
  schemaVersion: string;
  lastSync?: string;
  nodes: {
    tasks?: number;
    decisions?: number;
    milestones?: number;
    modules?: number;
    domains?: number;
  };
  edges: Record<string, number>;
}

interface GraphTaskNode {
  id: string;
  status: string;
  title?: string;
  milestone?: string;
  domain?: string | null;
  lane?: string;
}

export interface ReportData {
  compatibility: {
    surface: "validation" | "reporting";
    mode: "project-scoped-only" | "hybrid" | "legacy-only";
    supported: boolean;
    canonicalRootExists: boolean;
    legacyRootExists: boolean;
    reason: string;
  };
  activeProject: string;
  activePhase: string;
  activeMilestone: string;
  inventory: {
    projects: string[];
    phasesByProject: Record<string, number>;
  };
  tasksByStatus: Record<string, number>;
  decisionsByStatus: Record<string, number>;
  planning: {
    plannedCount: number;
    discoveredCount: number;
    backlogCount: number;
    discoveredRatioPercent: number;
    discoveredThresholdPercent: number;
  };
  docsCoverage: {
    existing: number;
    total: number;
  };
  graph: {
    snapshotLoaded: boolean;
    lastSync: string | null;
    metadata: GraphMetadata | null;
  };
  consistency: {
    diagnostics: ConsistencyDiagnostic[];
    issues: string[];
  };
  governanceWarnings: string[];
  parity: {
    ok: boolean;
    total: number;
    mismatches: number;
    diagnostics: ParityDiagnostic[];
  };
}

function renderTable(rows: Array<[string, string]>): string {
  const keyWidth = Math.max(...rows.map((r) => r[0].length), "Metric".length);
  const valueWidth = Math.max(...rows.map((r) => r[1].length), "Value".length);

  const border = `+${"-".repeat(keyWidth + 2)}+${"-".repeat(valueWidth + 2)}+`;
  const header = `| ${"Metric".padEnd(keyWidth)} | ${"Value".padEnd(valueWidth)} |`;

  const lines = [border, header, border];
  for (const [metric, value] of rows) {
    lines.push(`| ${metric.padEnd(keyWidth)} | ${value.padEnd(valueWidth)} |`);
  }
  lines.push(border);
  return lines.join("\n");
}

/**
 * Discover active phase from filesystem by scanning phases directory.
 */
async function discoverActivePhaseFromFilesystem(
  manifest: Awaited<ReturnType<typeof loadPhaseManifest>>,
  cwd: string,
): Promise<{ projectId: string | null; phaseId: string | null }> {
  const discovered: Array<{ projectId: string; phaseId: string }> = [];

  for (const phase of [...manifest.phases].sort((a, b) => a.id.localeCompare(b.id))) {
    const projectId = resolvePhaseProjectId(manifest, phase.id);
    const canonicalPhasePath = projectPhaseDir(projectId, phase.id, cwd);
    if (await pathExists(canonicalPhasePath)) {
      discovered.push({ projectId, phaseId: phase.id });
      continue;
    }

    const legacyPhasePath = phaseDir(phase.id, cwd);
    if (await pathExists(legacyPhasePath)) {
      discovered.push({ projectId, phaseId: phase.id });
    }
  }

  if (discovered.length === 0) {
    return { projectId: null, phaseId: null };
  }

  return (
    discovered.sort((left, right) => {
      const leftRef = `${left.projectId}/${left.phaseId}`;
      const rightRef = `${right.projectId}/${right.phaseId}`;
      return leftRef.localeCompare(rightRef);
    })[0] ?? { projectId: null, phaseId: null }
  );
}

/**
 * Discover active milestone from filesystem by scanning milestones directory.
 */
async function discoverActiveMilestoneFromFilesystem(
  projectId: string | null,
  activePhase: string | null,
  cwd: string,
): Promise<string | null> {
  if (projectId === null || activePhase === null || activePhase === "none") {
    return null;
  }

  const canonicalMilestoneRoot = path.join(
    projectPhaseDir(projectId, activePhase, cwd),
    "milestones",
  );
  const legacyMilestoneRoot = path.join(phaseDir(activePhase, cwd), "milestones");
  const milestoneRoot = (await pathExists(canonicalMilestoneRoot))
    ? canonicalMilestoneRoot
    : legacyMilestoneRoot;

  const milestoneDirs = await fg(path.join(milestoneRoot, "*").replace(/\\/g, "/"), {
    onlyDirectories: true,
    absolute: true,
    followSymbolicLinks: false,
  });
  const safeMilestoneDirs = await filterGlobPathsBySymlinkPolicy(milestoneDirs, cwd, {
    pathsAreAbsolute: true,
  });

  if (safeMilestoneDirs.length === 0) {
    return null;
  }

  return path.basename(safeMilestoneDirs.sort()[0]);
}

/**
 * Check consistency between manifest-declared active state and filesystem discovery.
 */
async function checkConsistency(
  cwd: string,
): Promise<{ diagnostics: ConsistencyDiagnostic[]; issues: string[] }> {
  const manifest = await loadPhaseManifest(cwd);
  const diagnostics: ConsistencyDiagnostic[] = [];
  const issues: string[] = [];

  const manifestPhase = manifest.activePhase ?? null;
  const manifestProject = manifestPhase ? resolvePhaseProjectId(manifest, manifestPhase) : null;
  const discoveredPhase = await discoverActivePhaseFromFilesystem(manifest, cwd);
  const phasePath = manifestProject
    ? `roadmap/projects/${manifestProject}/phases/*`
    : "roadmap/projects/<project>/phases/*";

  if (discoveredPhase.phaseId !== manifestPhase || discoveredPhase.projectId !== manifestProject) {
    diagnostics.push({
      type: "activePhase",
      canonical:
        manifestPhase && manifestProject ? `${manifestProject}/${manifestPhase}` : manifestPhase,
      secondarySurface: "filesystem",
      secondaryValue:
        discoveredPhase.phaseId && discoveredPhase.projectId
          ? `${discoveredPhase.projectId}/${discoveredPhase.phaseId}`
          : discoveredPhase.phaseId,
      offendingPath: phasePath,
    });
    issues.push(
      `activePhase mismatch: manifest declares "${manifestProject ? `${manifestProject}/${manifestPhase}` : manifestPhase}", filesystem at "${phasePath}" resolves to "${discoveredPhase.projectId && discoveredPhase.phaseId ? `${discoveredPhase.projectId}/${discoveredPhase.phaseId}` : discoveredPhase.phaseId}"`,
    );
  }

  // Check activeMilestone consistency
  const discoveredMilestone = await discoverActiveMilestoneFromFilesystem(
    manifestProject,
    manifestPhase,
    cwd,
  );
  const manifestMilestone = manifest.activeMilestone ?? null;
  const milestonePath =
    manifestProject && manifestPhase
      ? `roadmap/projects/${manifestProject}/phases/${manifestPhase}/milestones/*`
      : "roadmap/projects/<project>/phases/<activePhase>/milestones/*";

  if (discoveredMilestone !== manifestMilestone) {
    diagnostics.push({
      type: "activeMilestone",
      canonical:
        manifestProject && manifestPhase && manifestMilestone
          ? `${manifestProject}/${manifestPhase}/${manifestMilestone}`
          : manifestMilestone,
      secondarySurface: "filesystem",
      secondaryValue: discoveredMilestone,
      offendingPath: milestonePath,
    });
    issues.push(
      `activeMilestone mismatch: manifest declares "${manifestProject && manifestPhase && manifestMilestone ? `${manifestProject}/${manifestPhase}/${manifestMilestone}` : manifestMilestone}", filesystem at "${milestonePath}" resolves to "${discoveredMilestone}"`,
    );
  }

  return { diagnostics, issues };
}

/**
 * Format consistency diagnostics as a table.
 */
function renderConsistencyDiagnostics(diagnostics: ConsistencyDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "";
  }

  const header = "Consistency Checks";
  const rows: Array<[string, string, string, string, string]> = [
    ["Type", "Manifest (Canonical)", "Secondary Surface", "Secondary Value", "Offending Path"],
    ...diagnostics.map<[string, string, string, string, string]>((d) => [
      d.type,
      d.canonical ?? "(none)",
      d.secondarySurface,
      d.secondaryValue ?? "(none)",
      d.offendingPath,
    ]),
  ];

  const colWidths = [
    Math.max(4, ...rows.map((r) => r[0].length)),
    Math.max(18, ...rows.map((r) => r[1].length)),
    Math.max(17, ...rows.map((r) => r[2].length)),
    Math.max(15, ...rows.map((r) => r[3].length)),
    Math.max(13, ...rows.map((r) => r[4].length)),
  ];

  const border = `+${"-".repeat(colWidths[0] + 2)}+${"-".repeat(colWidths[1] + 2)}+${"-".repeat(colWidths[2] + 2)}+${"-".repeat(colWidths[3] + 2)}+${"-".repeat(colWidths[4] + 2)}+`;

  const lines = [
    "",
    header,
    border,
    `| ${rows[0][0].padEnd(colWidths[0])} | ${rows[0][1].padEnd(colWidths[1])} | ${rows[0][2].padEnd(colWidths[2])} | ${rows[0][3].padEnd(colWidths[3])} | ${rows[0][4].padEnd(colWidths[4])} |`,
    border,
  ];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    lines.push(
      `| ${r[0].padEnd(colWidths[0])} | ${r[1].padEnd(colWidths[1])} | ${r[2].padEnd(colWidths[2])} | ${r[3].padEnd(colWidths[3])} | ${r[4].padEnd(colWidths[4])} |`,
    );
  }
  lines.push(border);
  return lines.join("\n");
}

function renderGovernanceWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  const lines = ["", "Planning Governance Warnings", ...warnings.map((warning) => `- ${warning}`)];
  return lines.join("\n");
}

/**
 * Load graph metadata including lastSync timestamp
 */
async function loadGraphMetadata(cwd: string): Promise<GraphMetadata | null> {
  const graphPath = path.join(cwd, ".arch", "graph.json");
  if (!(await pathExists(graphPath))) {
    return null;
  }
  return await readJson<GraphMetadata>(graphPath);
}

/**
 * Check roadmap-vs-graph parity for task statuses
 */
async function checkParityDiagnostics(
  cwd: string,
  taskRecords: Awaited<ReturnType<typeof collectTaskRecords>>,
): Promise<{ ok: boolean; total: number; mismatches: number; diagnostics: ParityDiagnostic[] }> {
  const graphTasksPath = path.join(cwd, ".arch", "nodes", "tasks.json");

  if (!(await pathExists(graphTasksPath))) {
    return { ok: false, total: 0, mismatches: 0, diagnostics: [] };
  }

  const graphTaskNodes = await readJson<{ tasks: GraphTaskNode[] }>(graphTasksPath);
  const graphTaskMap = new Map<string, GraphTaskNode>();

  for (const task of graphTaskNodes.tasks ?? []) {
    graphTaskMap.set(task.id, task);
  }

  const diagnostics: ParityDiagnostic[] = [];

  for (const task of taskRecords) {
    const taskRef = `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`;
    const graphTask = graphTaskMap.get(taskRef);

    if (graphTask && graphTask.status !== task.frontmatter.status) {
      diagnostics.push({
        entityType: "task",
        entityId: taskRef,
        roadmapStatus: task.frontmatter.status,
        graphStatus: graphTask.status,
        filePath: task.filePath,
      });
    }
  }

  const total = taskRecords.length;
  const mismatches = diagnostics.length;
  const ok = mismatches === 0;

  return { ok, total, mismatches, diagnostics };
}

/**
 * Render parity summary section
 */
function renderParitySummary(parity: { ok: boolean; total: number; mismatches: number }): string {
  const status = parity.ok ? "PASS" : "FAIL";
  const emoji = parity.ok ? "✓" : "✗";

  return `
Roadmap-Graph Parity Check
  Status: ${emoji} ${status}
  Tasks checked: ${parity.total}
  Status mismatches: ${parity.mismatches}`;
}

/**
 * Render inconsistency table (verbose mode)
 */
function renderInconsistencyTable(diagnostics: ParityDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "";
  }

  const rows: Array<[string, string, string, string]> = [
    ["Task ID", "Roadmap Status", "Graph Status", "File Path"],
    ...diagnostics.map<[string, string, string, string]>((d) => [
      d.entityId,
      d.roadmapStatus,
      d.graphStatus,
      d.filePath,
    ]),
  ];

  const colWidths = [
    Math.max(...rows.map((r) => r[0].length)),
    Math.max(...rows.map((r) => r[1].length)),
    Math.max(...rows.map((r) => r[2].length)),
    Math.max(...rows.map((r) => r[3].length)),
  ];

  const border = `+${"-".repeat(colWidths[0] + 2)}+${"-".repeat(colWidths[1] + 2)}+${"-".repeat(colWidths[2] + 2)}+${"-".repeat(colWidths[3] + 2)}+`;

  const lines = [
    "",
    "Status Inconsistencies Detected",
    border,
    `| ${rows[0][0].padEnd(colWidths[0])} | ${rows[0][1].padEnd(colWidths[1])} | ${rows[0][2].padEnd(colWidths[2])} | ${rows[0][3].padEnd(colWidths[3])} |`,
    border,
  ];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    lines.push(
      `| ${r[0].padEnd(colWidths[0])} | ${r[1].padEnd(colWidths[1])} | ${r[2].padEnd(colWidths[2])} | ${r[3].padEnd(colWidths[3])} |`,
    );
  }
  lines.push(border);
  return lines.join("\n");
}

export async function generateReportData(cwd = process.cwd()): Promise<ReportData> {
  const manifest = await loadPhaseManifest(cwd);
  const compatibility = await resolveRuntimeCompatibilityContract("reporting", cwd);
  const tasks = await collectTaskRecordsForReport(cwd);
  const decisions = await collectDecisionRecords(cwd);
  const graphMeta = await loadGraphMetadata(cwd);

  const activeProject = manifest.activePhase
    ? resolvePhaseProjectId(manifest, manifest.activePhase)
    : (manifest.activeProject ?? "none");
  const activePhase = manifest.activePhase ?? "none";
  const activeMilestone = manifest.activeMilestone ?? "none";
  const inventoryProjects = [...new Set(manifest.phases.map((phase) => phase.projectId))].sort();
  const phasesByProject = Object.fromEntries(
    inventoryProjects.map((projectId) => [
      projectId,
      manifest.phases.filter((phase) => phase.projectId === projectId).length,
    ]),
  );

  const taskStatusCounts = new Map<string, number>();
  for (const task of tasks) {
    taskStatusCounts.set(
      task.frontmatter.status,
      (taskStatusCounts.get(task.frontmatter.status) ?? 0) + 1,
    );
  }

  const discoveredCount = tasks.filter((task) => task.lane === "discovered").length;
  const plannedCount = tasks.filter((task) => task.lane === "planned").length;
  const backlogCount = tasks.filter((task) => task.lane === "backlog").length;
  const discoveredRatio = calculateDiscoveredRatioPercent(plannedCount, discoveredCount);
  const discoveredThreshold = await resolveDiscoveredLoadThresholdPercent(cwd);
  const governanceWarnings: string[] = [];

  if (discoveredRatio > discoveredThreshold) {
    governanceWarnings.push(
      `Discovered load ratio ${formatPercent(discoveredRatio)} exceeds threshold ${formatPercent(discoveredThreshold)}. Milestone completion requires roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/replan-checkpoint.md before completion.`,
    );
  }

  const decisionStatusCounts = new Map<string, number>();
  for (const decision of decisions) {
    decisionStatusCounts.set(
      decision.frontmatter.status,
      (decisionStatusCounts.get(decision.frontmatter.status) ?? 0) + 1,
    );
  }

  const docRefs = new Set<string>();
  for (const task of tasks) {
    task.frontmatter.publicDocs
      .filter((ref) => !isSensitivePath(ref))
      .forEach((ref) => docRefs.add(ref));
  }
  for (const decision of decisions) {
    decision.frontmatter.links.publicDocs
      .filter((ref) => !isSensitivePath(ref))
      .forEach((ref) => docRefs.add(ref));
  }

  let existingDocs = 0;
  for (const ref of docRefs) {
    if (await pathExists(path.join(cwd, ref))) {
      existingDocs += 1;
    }
  }

  const taskStatusRecord = Object.fromEntries(
    [...taskStatusCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
  const decisionStatusRecord = Object.fromEntries(
    [...decisionStatusCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );

  const { diagnostics, issues } = await checkConsistency(cwd);
  const parity = await checkParityDiagnostics(cwd, tasks);

  return {
    compatibility,
    activeProject,
    activePhase,
    activeMilestone,
    inventory: {
      projects: inventoryProjects,
      phasesByProject,
    },
    tasksByStatus: taskStatusRecord,
    decisionsByStatus: decisionStatusRecord,
    planning: {
      plannedCount,
      discoveredCount,
      backlogCount,
      discoveredRatioPercent: discoveredRatio,
      discoveredThresholdPercent: discoveredThreshold,
    },
    docsCoverage: {
      existing: existingDocs,
      total: docRefs.size,
    },
    graph: {
      snapshotLoaded: graphMeta !== null,
      lastSync: graphMeta?.lastSync ?? null,
      metadata: graphMeta,
    },
    consistency: {
      diagnostics,
      issues,
    },
    governanceWarnings,
    parity,
  };
}

export function renderReportData(data: ReportData, options: { verbose?: boolean } = {}): string {
  const lastSyncInfo = data.graph.lastSync
    ? `(last sync: ${new Date(data.graph.lastSync).toLocaleString()})`
    : "(graph not synced)";

  const rows: Array<[string, string]> = [
    [
      "runtime compatibility",
      `${data.compatibility.mode} (${data.compatibility.supported ? "supported" : "unsupported"}) [source: roadmap runtime detection]`,
    ],
    ["active project", `${data.activeProject} [source: roadmap/manifest.json + phase ownership]`],
    ["active phase", `${data.activePhase} [source: roadmap/manifest.json]`],
    ["active milestone", `${data.activeMilestone} [source: roadmap/manifest.json]`],
    [
      "planning scopes",
      `${
        data.inventory.projects
          .map(
            (projectId) => `${projectId}:${data.inventory.phasesByProject[projectId] ?? 0} phases`,
          )
          .join(", ") || "none"
      } [source: roadmap/manifest.json + roadmap/projects/*/phases/*]`,
    ],
    [
      "tasks by status",
      `${
        Object.entries(data.tasksByStatus)
          .map(([status, count]) => `${status}:${count}`)
          .join(", ") || "none"
      } [source: roadmap/projects/*/phases/*/milestones/*/tasks/**/*.md]`,
    ],
    ["discovered tasks", `${data.planning.discoveredCount} [source: roadmap task frontmatter]`],
    [
      "discovered ratio",
      `${formatPercent(data.planning.discoveredRatioPercent)} (threshold ${formatPercent(data.planning.discoveredThresholdPercent)}) [source: calculated]`,
    ],
    ["planned tasks", `${data.planning.plannedCount} [source: roadmap task frontmatter]`],
    ["backlog ideas", `${data.planning.backlogCount} [source: roadmap task frontmatter]`],
    [
      "decisions by status",
      `${
        Object.entries(data.decisionsByStatus)
          .map(([status, count]) => `${status}:${count}`)
          .join(", ") || "none"
      } [source: roadmap/decisions/**/*.md]`,
    ],
    [
      "docs coverage",
      `${data.docsCoverage.existing}/${data.docsCoverage.total} [source: task/decision publicDocs fields]`,
    ],
    ["graph sync status", lastSyncInfo],
    [
      "graph nodes",
      data.graph.metadata
        ? `${Object.entries(data.graph.metadata.nodes)
            .map(([key, value]) => `${key}:${value ?? 0}`)
            .join(", ")} [source: .arch/graph.json]`
        : "none [source: .arch/graph.json]",
    ],
    [
      "graph edges",
      data.graph.metadata
        ? `${Object.entries(data.graph.metadata.edges)
            .map(([key, value]) => `${key}:${value}`)
            .join(", ")} [source: .arch/graph.json]`
        : "none [source: .arch/graph.json]",
    ],
  ];

  const report = renderTable(rows);
  const diagnosticsTable = renderConsistencyDiagnostics(data.consistency.diagnostics);
  const warningsSection = renderGovernanceWarnings(data.governanceWarnings);
  const compatibilitySection =
    data.compatibility.mode === "legacy-only"
      ? `\nRuntime Compatibility Note\n- ${data.compatibility.reason}`
      : "";
  const paritySummary = renderParitySummary(data.parity);
  const inconsistencyTable = options.verbose
    ? renderInconsistencyTable(data.parity.diagnostics)
    : "";
  return (
    report +
    diagnosticsTable +
    warningsSection +
    compatibilitySection +
    paritySummary +
    inconsistencyTable
  );
}

export async function generateReport(
  cwd = process.cwd(),
  options: { verbose?: boolean } = {},
): Promise<string> {
  return renderReportData(await generateReportData(cwd), options);
}

async function collectTaskRecordsForReport(
  cwd: string,
): Promise<Awaited<ReturnType<typeof collectTaskRecords>>> {
  try {
    return await collectTaskRecords(cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not supported for legacy-only roadmap runtimes")) {
      return [];
    }
    throw error;
  }
}
