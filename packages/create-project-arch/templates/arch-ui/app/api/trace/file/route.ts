import { NextRequest, NextResponse } from "next/server";
import { graph } from "project-arch";
import { readTaskToDecisionEdges, readTaskToModuleEdges } from "../../../../lib/arch-model";
import { getProjectRoot, mapTargetToModule, normalizePath } from "../../../../lib/project-root";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const root = getProjectRoot();
  process.env.PROJECT_ROOT = root;
  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return NextResponse.json(
      { success: false, errors: ["path query parameter is required"] },
      { status: 400 },
    );
  }
  await graph.graphBuild();
  const moduleName = mapTargetToModule(filePath);
  const taskEdges = await readTaskToModuleEdges(root);
  const decisionEdges = await readTaskToDecisionEdges(root);
  const tasksForModule = [
    ...new Set(
      taskEdges.edges.filter((edge) => edge.module === moduleName).map((edge) => edge.task),
    ),
  ];
  const decisionsForModule = [
    ...new Set(
      decisionEdges.edges
        .filter((edge) => tasksForModule.includes(edge.task))
        .map((edge) => edge.decision),
    ),
  ];
  return NextResponse.json({
    file: normalizePath(filePath),
    module: moduleName,
    tasks: tasksForModule,
    decisions: decisionsForModule,
  });
}
