import path from "path";
import { buildGraph } from "../graph/buildGraph";
import { traceTask } from "../graph/traceTask";
import { pathExists, readJson } from "../utils/fs";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";
import type { GraphLayerMode } from "../core/manifests/graph";

export async function graphBuild(
  input: {
    cwd?: string;
    write?: boolean;
    layerMode?: GraphLayerMode;
  } = {},
): Promise<OperationResult<{ path: string }>> {
  return wrap(async () => {
    await buildGraph(input.cwd, { write: input.write, layerMode: input.layerMode });
    return { path: ".arch/graph.json" };
  });
}

export async function graphTraceTask(input: {
  task: string;
  cwd?: string;
}): Promise<OperationResult<Record<string, unknown>>> {
  return wrap(async () => traceTask(input.task, input.cwd));
}

export async function graphRead(
  cwd = process.cwd(),
): Promise<OperationResult<Record<string, unknown>>> {
  return wrap(async () => {
    const graphPath = path.join(cwd, ".arch", "graph.json");
    if (!(await pathExists(graphPath))) {
      throw new Error(".arch/graph.json not found");
    }
    return readJson<Record<string, unknown>>(graphPath);
  });
}
