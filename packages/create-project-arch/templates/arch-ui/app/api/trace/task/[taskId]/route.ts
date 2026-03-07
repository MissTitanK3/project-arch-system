import { NextResponse } from "next/server";
import { graph } from "project-arch";
import { getProjectRoot } from "../../../../../lib/project-root";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ taskId: string }> }) {
  const root = getProjectRoot();
  process.env.PROJECT_ROOT = root;
  const { taskId } = await context.params;
  return NextResponse.json(await graph.graphTraceTask({ task: decodeURIComponent(taskId) }));
}
