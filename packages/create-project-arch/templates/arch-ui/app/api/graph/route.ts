import { NextResponse } from "next/server";
import { graph } from "project-arch";
import { getProjectRoot } from "../../../lib/project-root";
import { readArchitectureMap } from "../../../lib/arch-model";
import { buildValidatedGraphDataset } from "../../../lib/graph-dataset";

export const runtime = "nodejs";

export async function GET() {
  const root = getProjectRoot();
  process.env.PROJECT_ROOT = root;
  await graph.graphBuild();
  const architectureMap = await readArchitectureMap(root);
  const result = await buildValidatedGraphDataset(root, architectureMap);
  return NextResponse.json(result);
}
