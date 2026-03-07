import { NextResponse } from "next/server";
import { readDomains } from "../../../lib/arch-model";
import { getProjectRoot } from "../../../lib/project-root";

export const runtime = "nodejs";

export async function GET() {
  const root = getProjectRoot();
  return NextResponse.json(await readDomains(root));
}
