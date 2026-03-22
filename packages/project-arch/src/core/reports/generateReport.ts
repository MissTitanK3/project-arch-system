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
import { pathExists, readJson } from "../../fs";

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
async function discoverActivePhaseFromFilesystem(cwd: string): Promise<string | null> {
  const phaseDirs = await fg("roadmap/phases/*", {
    cwd,
    onlyDirectories: true,
    absolute: false,
    followSymbolicLinks: false,
  });
  const safePhaseDirs = await filterGlobPathsBySymlinkPolicy(phaseDirs, cwd);

  if (safePhaseDirs.length === 0) {
    return null;
  }

  return path.basename(safePhaseDirs.sort()[0]);
}

/**
 * Discover active milestone from filesystem by scanning milestones directory.
 */
async function discoverActiveMilestoneFromFilesystem(
  activePhase: string | null,
  cwd: string,
): Promise<string | null> {
  if (activePhase === null || activePhase === "none") {
    return null;
  }

  const milestoneDirs = await fg(`roadmap/phases/${activePhase}/milestones/*`, {
    cwd,
    onlyDirectories: true,
    absolute: false,
    followSymbolicLinks: false,
  });
  const safeMilestoneDirs = await filterGlobPathsBySymlinkPolicy(milestoneDirs, cwd);

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
  const discoveredPhase = await discoverActivePhaseFromFilesystem(cwd);
  const phasePath = "roadmap/phases/*";

  if (discoveredPhase !== manifestPhase) {
    diagnostics.push({
      type: "activePhase",
      canonical: manifestPhase,
      secondarySurface: "filesystem",
      secondaryValue: discoveredPhase,
      offendingPath: phasePath,
    });
    issues.push(
      `activePhase mismatch: manifest declares "${manifestPhase}", filesystem at "${phasePath}" resolves to "${discoveredPhase}"`,
    );
  }

  // Check activeMilestone consistency
  const discoveredMilestone = await discoverActiveMilestoneFromFilesystem(manifestPhase, cwd);
  const manifestMilestone = manifest.activeMilestone ?? null;
  const milestonePath = manifestPhase
    ? `roadmap/phases/${manifestPhase}/milestones/*`
    : "roadmap/phases/<activePhase>/milestones/*";

  if (discoveredMilestone !== manifestMilestone) {
    diagnostics.push({
      type: "activeMilestone",
      canonical: manifestMilestone,
      secondarySurface: "filesystem",
      secondaryValue: discoveredMilestone,
      offendingPath: milestonePath,
    });
    issues.push(
      `activeMilestone mismatch: manifest declares "${manifestMilestone}", filesystem at "${milestonePath}" resolves to "${discoveredMilestone}"`,
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

export async function generateReport(
  cwd = process.cwd(),
  options: { verbose?: boolean } = {},
): Promise<string> {
  const manifest = await loadPhaseManifest(cwd);
  const tasks = await collectTaskRecords(cwd);
  const decisions = await collectDecisionRecords(cwd);
  const graphMeta = await loadGraphMetadata(cwd);

  const activePhase = manifest.activePhase ?? "none";
  const activeMilestone = manifest.activeMilestone ?? "none";

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
      `Discovered load ratio ${formatPercent(discoveredRatio)} exceeds threshold ${formatPercent(discoveredThreshold)}. Milestone completion requires roadmap/phases/<phase>/milestones/<milestone>/replan-checkpoint.md before completion.`,
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

  // Add provenance annotations
  const lastSyncInfo = graphMeta?.lastSync
    ? `(last sync: ${new Date(graphMeta.lastSync).toLocaleString()})`
    : "(graph not synced)";

  const rows: Array<[string, string]> = [
    ["active phase", `${activePhase} [source: roadmap/manifest.json]`],
    ["active milestone", `${activeMilestone} [source: roadmap/manifest.json]`],
    [
      "tasks by status",
      `${
        [...taskStatusCounts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([status, count]) => `${status}:${count}`)
          .join(", ") || "none"
      } [source: roadmap/phases/*/milestones/*/tasks/**/*.md]`,
    ],
    ["discovered tasks", `${discoveredCount} [source: roadmap task frontmatter]`],
    [
      "discovered ratio",
      `${formatPercent(discoveredRatio)} (threshold ${formatPercent(discoveredThreshold)}) [source: calculated]`,
    ],
    ["backlog ideas", `${backlogCount} [source: roadmap task frontmatter]`],
    [
      "decisions by status",
      `${
        [...decisionStatusCounts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([status, count]) => `${status}:${count}`)
          .join(", ") || "none"
      } [source: roadmap/decisions/**/*.md]`,
    ],
    ["docs coverage", `${existingDocs}/${docRefs.size} [source: task/decision publicDocs fields]`],
    ["graph sync status", lastSyncInfo],
  ];

  const report = renderTable(rows);

  // Check and include consistency diagnostics
  const { diagnostics } = await checkConsistency(cwd);
  const diagnosticsTable = renderConsistencyDiagnostics(diagnostics);
  const warningsSection = renderGovernanceWarnings(governanceWarnings);

  // Add parity check
  const parity = await checkParityDiagnostics(cwd, tasks);
  const paritySummary = renderParitySummary(parity);

  // Verbose mode: include full inconsistency table
  const inconsistencyTable = options.verbose ? renderInconsistencyTable(parity.diagnostics) : "";

  return report + diagnosticsTable + warningsSection + paritySummary + inconsistencyTable;
}
