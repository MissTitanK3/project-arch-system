import { rebuildArchitectureGraph } from "../core/manifests";

export async function buildGraph(cwd = process.cwd()): Promise<void> {
  await rebuildArchitectureGraph(cwd);
}
