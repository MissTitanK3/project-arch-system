import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjectRoot, normalizePath } from "../../../../lib/project-root";

export const runtime = "nodejs";

const lanes = ["planned", "discovered", "backlog", "complete"] as const;

function isSafeSegment(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

export async function GET(_: Request, context: { params: Promise<{ taskId: string }> }) {
  const root = getProjectRoot();
  const { taskId } = await context.params;
  const decoded = decodeURIComponent(taskId);
  const [phase, milestone, taskNumber] = decoded.split("/");

  if (
    !phase ||
    !milestone ||
    !taskNumber ||
    !isSafeSegment(phase) ||
    !isSafeSegment(milestone) ||
    !isSafeSegment(taskNumber)
  ) {
    return NextResponse.json(
      { success: false, errors: ["invalid task id; expected phase/milestone/task"] },
      { status: 400 },
    );
  }

  const tasksDir = path.join(root, "roadmap", "phases", phase, "milestones", milestone, "tasks");
  for (const lane of lanes) {
    const laneDir = path.join(tasksDir, lane);
    try {
      const files = await readdir(laneDir);
      const candidate = files.find(
        (file) => file.startsWith(`${taskNumber}-`) && file.endsWith(".md"),
      );
      if (!candidate) continue;
      const fullPath = path.join(laneDir, candidate);
      const markdown = await readFile(fullPath, "utf8");
      return NextResponse.json({
        id: decoded,
        lane,
        path: normalizePath(path.relative(root, fullPath)),
        markdown,
      });
    } catch {
      // Continue to other lanes.
    }
  }

  return NextResponse.json(
    { success: false, errors: [`task document not found for ${decoded}`] },
    { status: 404 },
  );
}
