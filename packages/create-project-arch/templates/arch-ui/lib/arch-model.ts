import path from "node:path";
import { readFile } from "node:fs/promises";
import { getProjectRoot } from "./project-root";
import type { ArchitectureMapData, TaskNode } from "./types";

async function readArchJson<T>(root: string, relativePath: string): Promise<T> {
  const raw = await readFile(path.join(root, ".arch", relativePath), "utf8");
  return JSON.parse(raw) as T;
}

export async function readDomains(
  root?: string,
): Promise<{ domains: Array<{ name: string; description?: string; ownedPackages?: string[] }> }> {
  const projectRoot = root ?? getProjectRoot();
  const raw = await readFile(path.join(projectRoot, "arch-domains", "domains.json"), "utf8");
  return JSON.parse(raw) as {
    domains: Array<{ name: string; description?: string; ownedPackages?: string[] }>;
  };
}

export async function readTasksNode(root?: string): Promise<{ tasks: TaskNode[] }> {
  const projectRoot = root ?? getProjectRoot();
  return readArchJson<{ tasks: TaskNode[] }>(projectRoot, path.join("nodes", "tasks.json"));
}

export async function readTaskToModuleEdges(
  root?: string,
): Promise<{ edges: Array<{ task: string; module: string }> }> {
  const projectRoot = root ?? getProjectRoot();
  return readArchJson<{ edges: Array<{ task: string; module: string }> }>(
    projectRoot,
    path.join("edges", "task_to_module.json"),
  );
}

export async function readTaskToDecisionEdges(
  root?: string,
): Promise<{ edges: Array<{ task: string; decision: string }> }> {
  const projectRoot = root ?? getProjectRoot();
  return readArchJson<{ edges: Array<{ task: string; decision: string }> }>(
    projectRoot,
    path.join("edges", "task_to_decision.json"),
  );
}

export async function readArchitectureMap(root?: string): Promise<ArchitectureMapData> {
  const projectRoot = root ?? getProjectRoot();

  const [
    graphSummary,
    domains,
    decisions,
    milestones,
    tasksNode,
    modules,
    taskToDecision,
    taskToModule,
    decisionToDomain,
    milestoneToTask,
  ] = await Promise.all([
    readArchJson<Record<string, unknown>>(projectRoot, "graph.json"),
    readArchJson<{ domains?: ArchitectureMapData["nodes"]["domains"] }>(
      projectRoot,
      path.join("nodes", "domains.json"),
    ),
    readArchJson<{ decisions?: ArchitectureMapData["nodes"]["decisions"] }>(
      projectRoot,
      path.join("nodes", "decisions.json"),
    ),
    readArchJson<{ milestones?: ArchitectureMapData["nodes"]["milestones"] }>(
      projectRoot,
      path.join("nodes", "milestones.json"),
    ),
    readArchJson<{ tasks?: TaskNode[] }>(projectRoot, path.join("nodes", "tasks.json")),
    readArchJson<{ modules?: ArchitectureMapData["nodes"]["modules"] }>(
      projectRoot,
      path.join("nodes", "modules.json"),
    ),
    readArchJson<{ edges?: ArchitectureMapData["edges"]["taskToDecision"] }>(
      projectRoot,
      path.join("edges", "task_to_decision.json"),
    ),
    readArchJson<{ edges?: ArchitectureMapData["edges"]["taskToModule"] }>(
      projectRoot,
      path.join("edges", "task_to_module.json"),
    ),
    readArchJson<{ edges?: ArchitectureMapData["edges"]["decisionToDomain"] }>(
      projectRoot,
      path.join("edges", "decision_to_domain.json"),
    ),
    readArchJson<{ edges?: ArchitectureMapData["edges"]["milestoneToTask"] }>(
      projectRoot,
      path.join("edges", "milestone_to_task.json"),
    ),
  ]);

  return {
    summary: graphSummary as ArchitectureMapData["summary"],
    nodes: {
      domains: domains.domains ?? [],
      decisions: decisions.decisions ?? [],
      milestones: milestones.milestones ?? [],
      tasks: tasksNode.tasks ?? [],
      modules: modules.modules ?? [],
    },
    edges: {
      taskToDecision: taskToDecision.edges ?? [],
      taskToModule: taskToModule.edges ?? [],
      decisionToDomain: decisionToDomain.edges ?? [],
      milestoneToTask: milestoneToTask.edges ?? [],
    },
  };
}
