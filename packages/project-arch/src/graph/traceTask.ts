import path from "path";
import { pathExists, readJson } from "../utils/fs";

interface ArchGraph {
  schemaVersion: string;
  nodes: Record<string, number>;
  edges: Record<string, number>;
}

export async function traceTask(
  taskRef: string,
  cwd = process.cwd(),
): Promise<Record<string, unknown>> {
  const graphPath = path.join(cwd, ".arch", "graph.json");
  if (!(await pathExists(graphPath))) {
    throw new Error(".arch/graph.json not found. Run 'pa init' or a mutating command first.");
  }

  const tasksPath = path.join(cwd, ".arch", "nodes", "tasks.json");
  const edgesDecisionPath = path.join(cwd, ".arch", "edges", "task_to_decision.json");
  const edgesModulePath = path.join(cwd, ".arch", "edges", "task_to_module.json");

  const graph = await readJson<ArchGraph>(graphPath);
  const tasks = await readJson<{ tasks: Array<Record<string, unknown>> }>(tasksPath);
  const taskToDecision = await readJson<{ edges: Array<{ task: string; decision: string }> }>(
    edgesDecisionPath,
  );
  const taskToModule = await readJson<{ edges: Array<{ task: string; module: string }> }>(
    edgesModulePath,
  );

  const task = tasks.tasks.find((item) => item.id === taskRef);
  if (!task) {
    throw new Error(`Task '${taskRef}' not found in .arch graph`);
  }

  return {
    graph,
    task,
    decisions: taskToDecision.edges
      .filter((edge) => edge.task === taskRef)
      .map((edge) => edge.decision),
    modules: taskToModule.edges.filter((edge) => edge.task === taskRef).map((edge) => edge.module),
  };
}
