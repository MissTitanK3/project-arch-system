import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "arch-api",
    status: "ok",
    endpoints: [
      "GET /api/health",
      "GET /api/graph",
      "GET /api/architecture/map",
      "GET /api/domains",
      "GET /api/phases",
      "GET /api/tasks",
      "GET /api/trace/task/:taskId",
      "GET /api/trace/file?path=<repoPath>",
      "POST /api/tasks",
      "POST /api/decisions",
    ],
  });
}
