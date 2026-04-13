import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import { nextTaskId } from "../../core/ids/task";
import { defaultTaskBody, defaultTaskFrontmatter } from "../../core/templates/task";
import { taskSchema, TaskLane } from "../../schemas/task";
import { currentDateISO } from "../../utils/date";
import {
  milestoneTaskLaneDir,
  projectDocsRoot,
  projectMilestoneTaskLaneDir,
} from "../../utils/paths";
import {
  pathExists,
  readMarkdownWithFrontmatter,
  writeMarkdownWithFrontmatter,
} from "../../utils/fs";
import { assertSafeId } from "../../utils/safeId";
import { assertWithinRoot } from "../../utils/assertWithinRoot";
import * as graphManifests from "../../graph/manifests";
import { withAtomicTaskMutation } from "./atomicMutation";
import {
  milestoneTaskGlob,
  resolveMilestoneRuntimePaths,
  resolvePreferredMilestoneDir,
  taskIdGlob,
} from "../runtime/projectPaths";
import { assertSupportedRuntimeCompatibility } from "../runtime/compatibility";

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  if (!(await pathExists(projectDocsRoot(cwd)))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
  await assertSupportedRuntimeCompatibility("Task runtime", cwd);
}

async function assertMilestoneExists(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  const milestoneDirPath = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  if (!(await pathExists(milestoneDirPath))) {
    throw new Error(`Milestone '${phaseId}/${milestoneId}' does not exist`);
  }
}

function normalizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "task"
  );
}

async function collectMilestoneTaskIds(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<string[]> {
  const milestoneRoot = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  const files = await fg(milestoneTaskGlob(milestoneRoot), {
    absolute: true,
    onlyFiles: true,
  });

  const ids: string[] = [];
  for (const file of files.sort()) {
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(file);
    const parsed = taskSchema.parse(data);
    ids.push(parsed.id);
  }
  return ids;
}

function taskDefaults(
  phaseId: string,
  milestoneId: string,
  lane: TaskLane,
): { slugBase: string; title: string } {
  if (phaseId === "phase-1" && milestoneId.includes("setup")) {
    if (lane === "planned") {
      return {
        slugBase: "bootstrap-project-arch",
        title: "Bootstrap project architecture workflow",
      };
    }
    if (lane === "discovered") {
      return { slugBase: "validate-cli-check-report", title: "Validate CLI check/report workflow" };
    }
    return { slugBase: "setup-hardening-ideas", title: "Setup hardening ideas" };
  }

  if (lane === "planned") {
    return { slugBase: "task", title: "Task" };
  }
  if (lane === "discovered") {
    return { slugBase: "discovery", title: "Discovered Task" };
  }
  return { slugBase: "idea", title: "Backlog Idea" };
}

export async function createTask(input: {
  phaseId: string;
  milestoneId: string;
  lane: TaskLane;
  discoveredFromTask: string | null;
  title?: string;
  slugBase?: string;
  cwd?: string;
}): Promise<string> {
  const cwd = input.cwd ?? process.cwd();
  assertSafeId(input.phaseId, "phaseId");
  assertSafeId(input.milestoneId, "milestoneId");
  await assertInitialized(cwd);
  await assertMilestoneExists(input.phaseId, input.milestoneId, cwd);

  const defaults = taskDefaults(input.phaseId, input.milestoneId, input.lane);
  const title = input.title ?? defaults.title;
  const slugBase = input.slugBase ?? defaults.slugBase;
  const ids = await collectMilestoneTaskIds(input.phaseId, input.milestoneId, cwd);
  const id = nextTaskId(ids, input.lane);
  const slug = normalizeSlug(slugBase || title);
  const milestonePaths = await resolveMilestoneRuntimePaths(input.phaseId, input.milestoneId, cwd);

  const canonicalTargetPath = path.join(
    projectMilestoneTaskLaneDir(
      milestonePaths.projectId,
      input.phaseId,
      input.milestoneId,
      input.lane,
      cwd,
    ),
    `${id}-${slug}.md`,
  );
  const legacyTargetPath = path.join(
    milestoneTaskLaneDir(input.phaseId, input.milestoneId, input.lane, cwd),
    `${id}-${slug}.md`,
  );
  assertWithinRoot(canonicalTargetPath, cwd, "task file");

  const now = currentDateISO();
  const frontmatter = defaultTaskFrontmatter({
    id,
    slug,
    title,
    lane: input.lane,
    createdAt: now,
    discoveredFromTask: input.discoveredFromTask,
  });

  await withAtomicTaskMutation({
    cwd,
    mutateRoadmap: async () => {
      await writeMarkdownWithFrontmatter(canonicalTargetPath, frontmatter, defaultTaskBody());
      await writeMarkdownWithFrontmatter(legacyTargetPath, frontmatter, defaultTaskBody());
    },
    rollbackRoadmap: async () => {
      await fs.remove(canonicalTargetPath);
      await fs.remove(legacyTargetPath);
    },
    syncGraph: async () => {
      await graphManifests.rebuildArchitectureGraph(cwd);
    },
  });

  return canonicalTargetPath;
}

export async function getTaskStatus(
  phaseId: string,
  milestoneId: string,
  taskId: string,
  cwd = process.cwd(),
): Promise<string> {
  await assertInitialized(cwd);
  await assertMilestoneExists(phaseId, milestoneId, cwd);

  const milestoneRoot = await resolvePreferredMilestoneDir(phaseId, milestoneId, cwd);
  const files = await fg(taskIdGlob(milestoneRoot, taskId), {
    absolute: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    throw new Error(`Task ${phaseId}/${milestoneId}/${taskId} not found`);
  }
  if (files.length > 1) {
    throw new Error(`Task ${phaseId}/${milestoneId}/${taskId} is ambiguous`);
  }

  const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(files[0]);
  const parsed = taskSchema.parse(data);
  return parsed.status;
}
