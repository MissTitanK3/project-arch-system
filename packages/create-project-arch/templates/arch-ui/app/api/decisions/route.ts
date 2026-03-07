import { NextRequest, NextResponse } from "next/server";
import { decisions } from "project-arch";
import { getProjectRoot } from "../../../lib/project-root";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const root = getProjectRoot();
  const body = (await request.json()) as {
    scope?: "project" | "phase" | "milestone";
    phase?: string;
    milestone?: string;
    slug?: string;
    title?: string;
  };
  if (!body.scope || !["project", "phase", "milestone"].includes(body.scope)) {
    return NextResponse.json(
      { success: false, errors: ["scope must be one of: project, phase, milestone"] },
      { status: 400 },
    );
  }
  return NextResponse.json(await decisions.decisionCreate({ ...body, cwd: root }));
}
