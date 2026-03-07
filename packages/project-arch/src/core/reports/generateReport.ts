import path from "path";
import fg from "fast-glob";
import { collectDecisionRecords } from "../../core/validation/decisions";
import { collectTaskRecords } from "../../core/validation/tasks";
import { loadPhaseManifest } from "../../graph/manifests";
import { pathExists } from "../../fs";

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

export async function generateReport(cwd = process.cwd()): Promise<string> {
  const manifest = await loadPhaseManifest(cwd);
  const tasks = await collectTaskRecords(cwd);
  const decisions = await collectDecisionRecords(cwd);

  const activePhase = manifest.activePhase ?? "none";

  const milestones = await fg(`roadmap/phases/${activePhase}/milestones/*`, {
    cwd,
    onlyDirectories: true,
    absolute: false,
  });
  const activeMilestone =
    activePhase === "none" || milestones.length === 0
      ? "none"
      : path.basename(milestones.sort()[0]);

  const taskStatusCounts = new Map<string, number>();
  for (const task of tasks) {
    taskStatusCounts.set(
      task.frontmatter.status,
      (taskStatusCounts.get(task.frontmatter.status) ?? 0) + 1,
    );
  }

  const discoveredCount = tasks.filter((task) => task.lane === "discovered").length;
  const backlogCount = tasks.filter((task) => task.lane === "backlog").length;

  const decisionStatusCounts = new Map<string, number>();
  for (const decision of decisions) {
    decisionStatusCounts.set(
      decision.frontmatter.status,
      (decisionStatusCounts.get(decision.frontmatter.status) ?? 0) + 1,
    );
  }

  const docRefs = new Set<string>();
  for (const task of tasks) {
    task.frontmatter.publicDocs.forEach((ref) => docRefs.add(ref));
  }
  for (const decision of decisions) {
    decision.frontmatter.links.publicDocs.forEach((ref) => docRefs.add(ref));
  }

  let existingDocs = 0;
  for (const ref of docRefs) {
    if (await pathExists(path.join(cwd, ref))) {
      existingDocs += 1;
    }
  }

  const rows: Array<[string, string]> = [
    ["active phase", activePhase],
    ["active milestone", activeMilestone],
    [
      "tasks by status",
      [...taskStatusCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([status, count]) => `${status}:${count}`)
        .join(", ") || "none",
    ],
    ["discovered tasks", String(discoveredCount)],
    ["backlog ideas", String(backlogCount)],
    [
      "decisions by status",
      [...decisionStatusCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([status, count]) => `${status}:${count}`)
        .join(", ") || "none",
    ],
    ["docs coverage", `${existingDocs}/${docRefs.size}`],
  ];

  return renderTable(rows);
}
