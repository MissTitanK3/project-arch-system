import { runCheck } from "../checks/runCheck";
import { runDoctorHealth } from "../doctor/health";
import { collectTaskRecords } from "../validation/tasks";
import { listLatestReconciliationArtifacts } from "../reconciliation/lifecycle";

export type NextWorkflowStatus =
  | "needs_init"
  | "needs_check"
  | "needs_verification"
  | "needs_reconciliation"
  | "healthy_noop";

export interface NextWorkflowDecision {
  status: NextWorkflowStatus;
  recommendedCommand: string;
  reason: string;
  evidence: string[];
}

const INIT_SURFACE_PATHS = new Set([
  "architecture",
  "roadmap",
  "arch-model",
  "arch-domains",
  ".arch",
  "roadmap/manifest.json",
]);

function isInitSurfaceIssue(issue: { code: string; path: string | null }): boolean {
  if (issue.code === "PAH002") {
    return true;
  }

  if (issue.code !== "PAH001") {
    return false;
  }

  if (!issue.path) {
    return false;
  }

  return INIT_SURFACE_PATHS.has(issue.path);
}

function buildDecision(input: NextWorkflowDecision): NextWorkflowDecision {
  return {
    ...input,
    evidence: [...input.evidence].sort((a, b) => a.localeCompare(b)),
  };
}

export async function resolveNextWorkflow(cwd = process.cwd()): Promise<NextWorkflowDecision> {
  const health = await runDoctorHealth({ cwd });
  const initSurfaceIssues = health.issues.filter(isInitSurfaceIssue);

  if (initSurfaceIssues.length > 0) {
    return buildDecision({
      status: "needs_init",
      recommendedCommand: "pa init",
      reason: "Repository is missing initialization artifacts.",
      evidence: initSurfaceIssues
        .map((issue) => issue.path)
        .filter((value): value is string => Boolean(value)),
    });
  }

  const check = await runCheck(cwd, { failFast: true, completenessThreshold: 100 });
  if (!check.ok) {
    return buildDecision({
      status: "needs_check",
      recommendedCommand: "pa check",
      reason: "Critical architecture checks are failing.",
      evidence: check.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .slice(0, 5)
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    });
  }

  const tasks = await collectTaskRecords(cwd);
  const plannedTaskRefs = tasks
    .filter((task) => task.lane === "planned")
    .map((task) => `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`)
    .sort((a, b) => a.localeCompare(b));

  const latestArtifacts = await listLatestReconciliationArtifacts(cwd);
  const latestTaskIds = new Set(latestArtifacts.map((artifact) => artifact.report.taskId));

  if (plannedTaskRefs.length > 0 && latestArtifacts.length === 0) {
    return buildDecision({
      status: "needs_verification",
      recommendedCommand: "pa report",
      reason: "Planned tasks exist but no recent verification evidence was found.",
      evidence: [
        `planned tasks: ${plannedTaskRefs.length}`,
        "reconciliation artifacts: 0",
        ...plannedTaskRefs.slice(0, 3).map((taskRef) => `planned: ${taskRef}`),
      ],
    });
  }

  const doneTaskIds = [
    ...new Set(
      tasks
        .map((task) => task.frontmatter)
        .filter((task) => task.status === "done")
        .map((task) => task.id),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const unreconciledDoneTaskIds = doneTaskIds.filter((taskId) => !latestTaskIds.has(taskId));

  if (unreconciledDoneTaskIds.length > 0) {
    return buildDecision({
      status: "needs_reconciliation",
      recommendedCommand: "pa reconcile",
      reason: "Done tasks exist without reconciliation artifacts.",
      evidence: unreconciledDoneTaskIds.slice(0, 5).map((taskId) => `missing reconcile: ${taskId}`),
    });
  }

  return buildDecision({
    status: "healthy_noop",
    recommendedCommand: "none",
    reason: "Repository state is healthy; no next action required.",
    evidence: [
      "checks: passing",
      `planned tasks: ${plannedTaskRefs.length}`,
      `reconciliation artifacts: ${latestArtifacts.length}`,
    ],
  });
}
