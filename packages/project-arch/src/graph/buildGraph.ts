import { rebuildArchitectureGraph } from "../core/manifests";
import type { GraphLayerMode } from "../core/manifests/graph";

export async function buildGraph(
  cwd = process.cwd(),
  options: { write?: boolean; layerMode?: GraphLayerMode } = {},
): Promise<void> {
  await rebuildArchitectureGraph(cwd, options);
}
