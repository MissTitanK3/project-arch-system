import { NextRequest, NextResponse } from "next/server";
import { tasks } from "project-arch";
import { readTasksNode } from "../../../lib/arch-model";
import { getProjectRoot } from "../../../lib/project-root";

export const runtime = "nodejs";

export async function GET() {
  const root = getProjectRoot();
  return NextResponse.json(await readTasksNode(root));
}

export async function POST(request: NextRequest) {
  const root = getProjectRoot();
  const body = (await request.json()) as { phase?: string; milestone?: string; title?: string };
  if (!body.phase || !body.milestone) {
    return NextResponse.json(
      { success: false, errors: ["phase and milestone are required"] },
      { status: 400 },
    );
  }
  if (body.title && typeof body.title !== "string") {
    return NextResponse.json(
      { success: false, errors: ["title must be a string"] },
      { status: 400 },
    );
  }
  return NextResponse.json(
    await tasks.taskCreate({
      phase: body.phase,
      milestone: body.milestone,
      title: body.title,
      cwd: root,
    }),
  );
}
