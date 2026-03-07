import { NextResponse } from "next/server";
import { phases } from "project-arch";
import { getProjectRoot } from "../../../lib/project-root";

export const runtime = "nodejs";

export async function GET() {
  const root = getProjectRoot();
  return NextResponse.json(await phases.phaseList({ cwd: root }));
}
