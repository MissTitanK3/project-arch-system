import { rebuildArchitectureGraph } from "../core/manifests";

export async function buildGraph(
  cwd = process.cwd(),
  options: { write?: boolean } = {},
): Promise<void> {
  await rebuildArchitectureGraph(cwd, options);
}
