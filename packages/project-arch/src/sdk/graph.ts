import path from "path";
import { buildGraph } from "../graph/buildGraph";
import { traceTask } from "../graph/traceTask";
import { pathExists, readJson } from "../fs";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export async function graphBuild(): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => {
    await buildGraph();
    return { path: ".arch/graph.json" };
  });
}

export async function graphTraceTask(input: {
  task: string;
}): Promise<OperationResult<Record<string, unknown>>> {
  return wrap(async () => traceTask(input.task));
}

export async function graphRead(): Promise<OperationResult<Record<string, unknown>>> {
  return wrap(async () => {
    const graphPath = path.join(process.cwd(), ".arch", "graph.json");
    if (!(await pathExists(graphPath))) {
      throw new Error(".arch/graph.json not found");
    }
    return readJson<Record<string, unknown>>(graphPath);
  });
}
