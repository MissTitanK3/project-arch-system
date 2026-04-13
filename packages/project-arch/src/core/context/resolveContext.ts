import path from "path";
import { loadPhaseManifest, resolvePhaseProjectId } from "../../graph/manifests";
import { pathExists } from "../../utils/fs";
import {
  projectDocsRoot,
  projectDir,
  projectMilestoneDir,
  projectPhaseDir,
} from "../../utils/paths";
import { collectTaskRecords, type TaskRecord } from "../validation/tasks";
import { resolveNextWorkflow } from "../workflow/next";
import { assertSupportedRuntimeCompatibility } from "../runtime/compatibility";

export interface ContextTaskSummary {
  id: string;
  path: string;
  title: string;
  status: string;
  lane: string;
}

export interface ContextLocationSummary {
  id: string;
  path: string;
  title: string;
}

export type ContextProjectSummary = ContextLocationSummary;

export interface ResolvedContextPayload {
  version: "2.0";
  timestamp: string;
  projectRoot: string;
  active: {
    project: ContextProjectSummary;
    phase: ContextLocationSummary;
    milestone: ContextLocationSummary;
    task: ContextTaskSummary;
  };
  recommended?: {
    task?: ContextTaskSummary;
    action: {
      status: string;
      command: string;
      reason: string;
      evidence: string[];
    };
  };
}

const LANE_PRIORITY: Record<string, number> = {
  planned: 0,
  discovered: 1,
  backlog: 2,
};

const STATUS_PRIORITY: Record<string, number> = {
  in_progress: 0,
  todo: 1,
  blocked: 2,
  done: 3,
};

function humanizeId(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function toRelative(targetPath: string, cwd: string): string {
  return path.relative(cwd, targetPath).replace(/\\/g, "/");
}

function sortTaskRecords(records: TaskRecord[]): TaskRecord[] {
  return [...records].sort((a, b) => {
    const laneDelta = (LANE_PRIORITY[a.lane] ?? 99) - (LANE_PRIORITY[b.lane] ?? 99);
    if (laneDelta !== 0) {
      return laneDelta;
    }

    const statusDelta =
      (STATUS_PRIORITY[a.frontmatter.status] ?? 99) - (STATUS_PRIORITY[b.frontmatter.status] ?? 99);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return a.frontmatter.id.localeCompare(b.frontmatter.id);
  });
}

function toTaskSummary(record: TaskRecord, cwd: string): ContextTaskSummary {
  return {
    id: `${record.frontmatter.id}-${record.frontmatter.slug}`,
    path: toRelative(record.filePath, cwd),
    title: record.frontmatter.title,
    status: record.frontmatter.status,
    lane: record.lane,
  };
}

export async function resolveContext(cwd = process.cwd()): Promise<ResolvedContextPayload> {
  if (!(await pathExists(projectDocsRoot(cwd)))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
  await assertSupportedRuntimeCompatibility("Context resolution", cwd);

  const manifest = await loadPhaseManifest(cwd);
  if (!manifest.activePhase) {
    throw new Error(
      "Context resolution is incomplete: no active phase is set in roadmap/manifest.json.",
    );
  }
  if (!manifest.activeMilestone) {
    throw new Error(
      "Context resolution is incomplete: no active milestone is set in roadmap/manifest.json.",
    );
  }

  const derivedProjectId = resolvePhaseProjectId(manifest, manifest.activePhase);
  if (manifest.activeProject && manifest.activeProject !== derivedProjectId) {
    throw new Error(
      `Context resolution is inconsistent: active project '${manifest.activeProject}' does not own active phase '${manifest.activePhase}'.`,
    );
  }

  const activeProjectPath = projectDir(derivedProjectId, cwd);
  const activePhasePath = projectPhaseDir(derivedProjectId, manifest.activePhase, cwd);
  const activeMilestonePath = projectMilestoneDir(
    derivedProjectId,
    manifest.activePhase,
    manifest.activeMilestone,
    cwd,
  );
  if (!(await pathExists(activeMilestonePath))) {
    throw new Error(
      `Context resolution is incomplete: active milestone '${derivedProjectId}/${manifest.activePhase}/${manifest.activeMilestone}' does not exist on disk.`,
    );
  }

  const tasks = await collectTaskRecords(cwd);
  const activeMilestoneTasks = sortTaskRecords(
    tasks.filter(
      (task) =>
        task.projectId === derivedProjectId &&
        task.phaseId === manifest.activePhase &&
        task.milestoneId === manifest.activeMilestone &&
        task.frontmatter.status !== "done",
    ),
  );

  const activeTask = activeMilestoneTasks[0];
  if (!activeTask) {
    throw new Error(
      `Context resolution is incomplete: no actionable task was found in active milestone '${manifest.activePhase}/${manifest.activeMilestone}'.`,
    );
  }

  const nextDecision = await resolveNextWorkflow(cwd);
  const recommendedTask = activeMilestoneTasks.find(
    (task) => task.filePath !== activeTask.filePath,
  );

  return {
    version: "2.0",
    timestamp: new Date().toISOString(),
    projectRoot: cwd,
    active: {
      project: {
        id: derivedProjectId,
        path: toRelative(activeProjectPath, cwd),
        title: humanizeId(derivedProjectId),
      },
      phase: {
        id: manifest.activePhase,
        path: toRelative(activePhasePath, cwd),
        title: humanizeId(manifest.activePhase),
      },
      milestone: {
        id: manifest.activeMilestone,
        path: toRelative(activeMilestonePath, cwd),
        title: humanizeId(manifest.activeMilestone),
      },
      task: toTaskSummary(activeTask, cwd),
    },
    recommended: {
      ...(recommendedTask ? { task: toTaskSummary(recommendedTask, cwd) } : {}),
      action: {
        status: nextDecision.status,
        command: nextDecision.recommendedCommand,
        reason: nextDecision.reason,
        evidence: nextDecision.evidence,
      },
    },
  };
}
