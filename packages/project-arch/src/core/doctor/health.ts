import fs from "fs-extra";
import path from "path";
import fg from "fast-glob";
import { defaultPhaseManifest, defaultProjectManifest } from "../manifests";
import { rebuildArchitectureGraph } from "../manifests/graph";
import { currentDateISO } from "../../utils/date";
import { writeJsonDeterministic } from "../../utils/fs";
import { DOCTOR_HEALTH_CODES, DoctorHealthCode } from "./healthCodes";
import { projectManifestSchema } from "../../schemas/project";

export type DoctorHealthSeverity = "error" | "warning";
export type DoctorHealthStatus = "healthy" | "degraded" | "broken";

export interface DoctorHealthIssue {
  code: DoctorHealthCode;
  severity: DoctorHealthSeverity;
  message: string;
  fix: string;
  repairable: boolean;
  path: string | null;
  repaired: boolean;
}

export interface DoctorHealthResult {
  status: DoctorHealthStatus;
  issues: DoctorHealthIssue[];
  checkedAt: string;
  repairedCount: number;
}

interface InternalDoctorHealthIssue extends DoctorHealthIssue {
  repairAction?: () => Promise<void>;
}

interface RunDoctorHealthOptions {
  cwd?: string;
  repair?: boolean;
}

const REQUIRED_ROOT_DIRS = ["architecture", "roadmap", "arch-model", "arch-domains", ".arch"];
const TASK_LANES = ["planned", "discovered", "backlog"];
const GRAPH_ARTIFACTS = [
  ".arch/graph.json",
  ".arch/nodes/tasks.json",
  ".arch/edges/milestone_to_task.json",
];

function toPosixRelative(cwd: string, absolutePath: string): string {
  return path.relative(cwd, absolutePath).replace(/\\/g, "/");
}

function sortIssues(issues: InternalDoctorHealthIssue[]): void {
  issues.sort((left, right) => {
    const leftPath = left.path ?? "";
    const rightPath = right.path ?? "";

    if (leftPath !== rightPath) {
      return leftPath.localeCompare(rightPath);
    }

    if (left.code !== right.code) {
      return left.code.localeCompare(right.code);
    }

    return left.message.localeCompare(right.message);
  });
}

function deriveStatus(issues: DoctorHealthIssue[]): DoctorHealthStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "broken";
  }

  if (issues.some((issue) => issue.severity === "warning")) {
    return "degraded";
  }

  return "healthy";
}

function buildIssue(input: Omit<InternalDoctorHealthIssue, "repaired">): InternalDoctorHealthIssue {
  return {
    ...input,
    repaired: false,
  };
}

async function collectMissingRootIssues(
  cwd: string,
  issues: InternalDoctorHealthIssue[],
): Promise<void> {
  for (const root of REQUIRED_ROOT_DIRS) {
    const absolute = path.join(cwd, root);
    if (await fs.pathExists(absolute)) {
      continue;
    }

    issues.push(
      buildIssue({
        code: DOCTOR_HEALTH_CODES.MISSING_REQUIRED_ROOT,
        severity: "error",
        message: `Missing required repository root '${root}'.`,
        fix: `Create directory '${root}'.`,
        repairable: true,
        path: root,
        repairAction: async () => {
          await fs.ensureDir(absolute);
        },
      }),
    );
  }
}

async function collectPhaseAndMilestoneIssues(
  cwd: string,
  issues: InternalDoctorHealthIssue[],
): Promise<void> {
  const manifestPath = path.join(cwd, "roadmap", "manifest.json");
  const roadmapDir = path.join(cwd, "roadmap");
  const projectsRoot = path.join(roadmapDir, "projects");

  if (!(await fs.pathExists(manifestPath))) {
    issues.push(
      buildIssue({
        code: DOCTOR_HEALTH_CODES.MISSING_PHASE_MANIFEST,
        severity: "error",
        message: "Missing roadmap phase manifest at roadmap/manifest.json.",
        fix: "Create roadmap/manifest.json with default phase manifest structure.",
        repairable: true,
        path: "roadmap/manifest.json",
        repairAction: async () => {
          await fs.ensureDir(path.dirname(manifestPath));
          await writeJsonDeterministic(manifestPath, defaultPhaseManifest());
        },
      }),
    );
  } else {
    try {
      await fs.readJSON(manifestPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.INVALID_PHASE_MANIFEST,
          severity: "error",
          message: `Invalid roadmap phase manifest JSON: ${detail}`,
          fix: "Repair roadmap/manifest.json so it contains valid JSON for the phase manifest.",
          repairable: false,
          path: "roadmap/manifest.json",
        }),
      );
      return;
    }
  }

  if (!(await fs.pathExists(projectsRoot))) {
    issues.push(
      buildIssue({
        code: DOCTOR_HEALTH_CODES.MISSING_REQUIRED_ROOT,
        severity: "error",
        message: "Missing required directory 'roadmap/projects'.",
        fix: "Create roadmap/projects directory.",
        repairable: true,
        path: "roadmap/projects",
        repairAction: async () => {
          await fs.ensureDir(projectsRoot);
        },
      }),
    );
    return;
  }

  const projectDirectories = await fg("roadmap/projects/*", {
    cwd,
    onlyDirectories: true,
    deep: 1,
  });

  for (const projectDir of projectDirectories.sort()) {
    const projectName = path.basename(projectDir);
    const projectManifestPath = path.join(cwd, projectDir, "manifest.json");
    const phasesRoot = path.join(cwd, projectDir, "phases");

    if (!(await fs.pathExists(projectManifestPath))) {
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.MISSING_PROJECT_MANIFEST,
          severity: "error",
          message: `Project '${projectName}' is missing manifest.json.`,
          fix: "Create project manifest with the canonical project contract.",
          repairable: true,
          path: toPosixRelative(cwd, projectManifestPath),
          repairAction: async () => {
            await writeJsonDeterministic(
              projectManifestPath,
              defaultProjectManifest(projectName, {
                title: humanizeId(projectName),
                type: projectName === "shared" ? "shared" : "application",
                summary:
                  projectName === "shared"
                    ? "Shared project scaffold generated by doctor repair."
                    : `Project scaffold for ${humanizeId(projectName)} generated by doctor repair.`,
                ownedPaths: [projectName === "shared" ? "packages" : `apps/${projectName}`],
                sharedDependencies: projectName === "shared" ? [] : ["shared"],
                tags: [],
              }),
            );
          },
        }),
      );
    } else {
      try {
        const raw = await fs.readJSON(projectManifestPath);
        projectManifestSchema.parse(raw);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        issues.push(
          buildIssue({
            code: DOCTOR_HEALTH_CODES.INVALID_PROJECT_MANIFEST,
            severity: "error",
            message: `Invalid project manifest '${toPosixRelative(cwd, projectManifestPath)}': ${detail}`,
            fix: "Repair the project manifest so it matches the canonical project contract.",
            repairable: false,
            path: toPosixRelative(cwd, projectManifestPath),
          }),
        );
      }
    }

    if (!(await fs.pathExists(phasesRoot))) {
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.MISSING_REQUIRED_ROOT,
          severity: "error",
          message: `Project '${projectName}' is missing phases directory.`,
          fix: "Create phases directory under the project.",
          repairable: true,
          path: toPosixRelative(cwd, phasesRoot),
          repairAction: async () => {
            await fs.ensureDir(phasesRoot);
          },
        }),
      );
      continue;
    }

    const phaseDirectories = await fg(`${projectDir}/phases/*`, {
      cwd,
      onlyDirectories: true,
      deep: 1,
    });

    for (const phaseDir of phaseDirectories.sort()) {
      const milestonesDir = path.join(cwd, phaseDir, "milestones");
      const decisionsDir = path.join(cwd, phaseDir, "decisions");
      const phaseName = path.basename(phaseDir);

      if (!(await fs.pathExists(milestonesDir))) {
        issues.push(
          buildIssue({
            code: DOCTOR_HEALTH_CODES.MISSING_PHASE_MILESTONES_DIR,
            severity: "error",
            message: `Phase '${projectName}/${phaseName}' is missing milestones directory.`,
            fix: "Create milestones directory under the phase.",
            repairable: true,
            path: toPosixRelative(cwd, milestonesDir),
            repairAction: async () => {
              await fs.ensureDir(milestonesDir);
            },
          }),
        );
      }

      await collectDecisionIndexIssue(cwd, decisionsDir, issues);

      if (!(await fs.pathExists(milestonesDir))) {
        continue;
      }

      const milestoneDirectories = await fg(`${phaseDir}/milestones/*`, {
        cwd,
        onlyDirectories: true,
        deep: 1,
      });

      for (const milestoneDir of milestoneDirectories.sort()) {
        const milestoneName = path.basename(milestoneDir);
        const milestoneManifestPath = path.join(cwd, milestoneDir, "manifest.json");

        if (!(await fs.pathExists(milestoneManifestPath))) {
          issues.push(
            buildIssue({
              code: DOCTOR_HEALTH_CODES.MISSING_MILESTONE_MANIFEST,
              severity: "error",
              message: `Milestone '${projectName}/${phaseName}/${milestoneName}' is missing manifest.json.`,
              fix: "Create milestone manifest from phase and milestone IDs.",
              repairable: true,
              path: toPosixRelative(cwd, milestoneManifestPath),
              repairAction: async () => {
                const now = currentDateISO();
                await writeJsonDeterministic(milestoneManifestPath, {
                  schemaVersion: "1.0",
                  id: milestoneName,
                  phaseId: phaseName,
                  createdAt: now,
                  updatedAt: now,
                });
              },
            }),
          );
        }

        const tasksRoot = path.join(cwd, milestoneDir, "tasks");
        for (const lane of TASK_LANES) {
          const laneDir = path.join(tasksRoot, lane);
          if (await fs.pathExists(laneDir)) {
            continue;
          }

          issues.push(
            buildIssue({
              code: DOCTOR_HEALTH_CODES.MISSING_TASK_LANE_DIR,
              severity: "error",
              message: `Milestone '${projectName}/${phaseName}/${milestoneName}' is missing '${lane}' task lane directory.`,
              fix: `Create tasks/${lane} lane directory.`,
              repairable: true,
              path: toPosixRelative(cwd, laneDir),
              repairAction: async () => {
                await fs.ensureDir(laneDir);
              },
            }),
          );
        }

        const milestoneDecisionsDir = path.join(cwd, milestoneDir, "decisions");
        await collectDecisionIndexIssue(cwd, milestoneDecisionsDir, issues);
      }
    }
  }
}

async function collectDecisionIndexIssue(
  cwd: string,
  decisionsDir: string,
  issues: InternalDoctorHealthIssue[],
): Promise<void> {
  const indexPath = path.join(decisionsDir, "index.json");

  if (!(await fs.pathExists(indexPath))) {
    issues.push(
      buildIssue({
        code: DOCTOR_HEALTH_CODES.MISSING_DECISION_INDEX,
        severity: "error",
        message: `Missing decision index at '${toPosixRelative(cwd, indexPath)}'.`,
        fix: "Create decisions/index.json with default schemaVersion and empty decisions list.",
        repairable: true,
        path: toPosixRelative(cwd, indexPath),
        repairAction: async () => {
          await fs.ensureDir(path.dirname(indexPath));
          await writeJsonDeterministic(indexPath, {
            schemaVersion: "1.0",
            decisions: [],
          });
        },
      }),
    );
    return;
  }

  try {
    const raw = await fs.readJSON(indexPath);
    const parsed = raw as { schemaVersion?: unknown; decisions?: unknown };
    if (parsed.schemaVersion !== "1.0" || !Array.isArray(parsed.decisions)) {
      throw new Error("expected schemaVersion '1.0' and decisions array");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    issues.push(
      buildIssue({
        code: DOCTOR_HEALTH_CODES.INVALID_DECISION_INDEX,
        severity: "error",
        message: `Invalid decision index '${toPosixRelative(cwd, indexPath)}': ${detail}`,
        fix: "Repair the JSON file so schemaVersion is '1.0' and decisions is an array.",
        repairable: false,
        path: toPosixRelative(cwd, indexPath),
      }),
    );
  }
}

async function collectGraphArtifactIssues(
  cwd: string,
  issues: InternalDoctorHealthIssue[],
): Promise<void> {
  const graphRepairAction = async (): Promise<void> => {
    await rebuildArchitectureGraph(cwd);
  };

  for (const relativeArtifact of GRAPH_ARTIFACTS) {
    const absoluteArtifact = path.join(cwd, relativeArtifact);

    if (!(await fs.pathExists(absoluteArtifact))) {
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.MISSING_GRAPH_ARTIFACT,
          severity: "error",
          message: `Missing graph artifact '${relativeArtifact}'.`,
          fix: "Rebuild architecture graph artifacts.",
          repairable: true,
          path: relativeArtifact,
          repairAction: graphRepairAction,
        }),
      );
      continue;
    }

    try {
      await fs.readJSON(absoluteArtifact);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.INVALID_GRAPH_ARTIFACT,
          severity: "error",
          message: `Invalid graph artifact '${relativeArtifact}': ${detail}`,
          fix: "Regenerate architecture graph artifacts.",
          repairable: true,
          path: relativeArtifact,
          repairAction: graphRepairAction,
        }),
      );
    }
  }
}

async function collectLocalConfigIssues(
  cwd: string,
  issues: InternalDoctorHealthIssue[],
): Promise<void> {
  const configCandidates = [
    path.join(cwd, ".project-arch", "reconcile.config.json"),
    path.join(cwd, ".project-arch", "reconcile-config.json"),
  ];

  for (const configPath of configCandidates) {
    if (!(await fs.pathExists(configPath))) {
      continue;
    }

    try {
      await fs.readJSON(configPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.INVALID_LOCAL_CONFIG,
          severity: "error",
          message: `Invalid local config '${toPosixRelative(cwd, configPath)}': ${detail}`,
          fix: "Fix malformed JSON syntax in local config.",
          repairable: false,
          path: toPosixRelative(cwd, configPath),
        }),
      );
    }
  }
}

async function applyRepairs(issues: InternalDoctorHealthIssue[]): Promise<void> {
  const uniqueRepairs = new Map<string, () => Promise<void>>();

  for (const issue of issues) {
    if (!issue.repairable || !issue.repairAction) {
      continue;
    }

    const key = `${issue.code}:${issue.path ?? ""}`;
    if (!uniqueRepairs.has(key)) {
      uniqueRepairs.set(key, issue.repairAction);
    }
  }

  for (const [key, action] of uniqueRepairs.entries()) {
    try {
      await action();
      for (const issue of issues) {
        const issueKey = `${issue.code}:${issue.path ?? ""}`;
        if (issueKey === key && issue.repairable) {
          issue.repaired = true;
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push(
        buildIssue({
          code: DOCTOR_HEALTH_CODES.REPAIR_ACTION_FAILED,
          severity: "error",
          message: `Repair action failed for ${key}: ${detail}`,
          fix: "Run the suggested fix manually and re-run health checks.",
          repairable: false,
          path: null,
        }),
      );
    }
  }
}

export async function runDoctorHealth(
  options: RunDoctorHealthOptions = {},
): Promise<DoctorHealthResult> {
  const cwd = options.cwd ?? process.cwd();
  const issues: InternalDoctorHealthIssue[] = [];

  await collectMissingRootIssues(cwd, issues);
  await collectDecisionIndexIssue(cwd, path.join(cwd, "roadmap", "decisions"), issues);
  await collectPhaseAndMilestoneIssues(cwd, issues);
  await collectGraphArtifactIssues(cwd, issues);
  await collectLocalConfigIssues(cwd, issues);

  sortIssues(issues);

  if (options.repair === true) {
    await applyRepairs(issues);
    sortIssues(issues);
  }

  const visibleIssues = issues.filter((issue) => !(options.repair === true && issue.repaired));
  const repairedCount = issues.filter((issue) => issue.repaired).length;

  return {
    status: deriveStatus(visibleIssues),
    issues: visibleIssues.map((issue) => ({ ...issue, repairAction: undefined })),
    checkedAt: currentDateISO(),
    repairedCount,
  };
}

function humanizeId(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}
