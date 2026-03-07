import { NextResponse } from "next/server";
import { graph } from "project-arch";
import { readArchitectureMap } from "../../../../lib/arch-model";
import { getProjectRoot } from "../../../../lib/project-root";

export const runtime = "nodejs";

export async function GET() {
  const root = getProjectRoot();
  process.env.PROJECT_ROOT = root;
  await graph.graphBuild();
  return NextResponse.json(await readArchitectureMap(root));
}
