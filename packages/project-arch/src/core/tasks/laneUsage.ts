import { TaskLane } from "../../schemas/task";
import { laneRanges, formatLaneRange } from "../../core/ids/task";
import { collectTaskRecords } from "../../core/validation/tasks";

export interface LaneUsage {
  lane: TaskLane;
  range: string;
  usedIds: string[];
  nextAvailableId: string | null;
  total: number;
  used: number;
}

export async function getLaneUsage(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<LaneUsage[]> {
  const allTasks = await collectTaskRecords(cwd);
  const milestoneTasks = allTasks.filter(
    (task) => task.phaseId === phaseId && task.milestoneId === milestoneId,
  );

  const lanes: TaskLane[] = ["planned", "discovered", "backlog"];
  const usages: LaneUsage[] = [];

  for (const lane of lanes) {
    const laneTasks = milestoneTasks.filter((task) => task.lane === lane);
    const usedIds = laneTasks.map((task) => task.frontmatter.id).sort();
    const range = laneRanges[lane];
    const total = range.max - range.min + 1;

    // Find next available ID
    let nextAvailableId: string | null = null;
    const usedSet = new Set(usedIds.map(Number));
    for (let i = range.min; i <= range.max; i += 1) {
      if (!usedSet.has(i)) {
        nextAvailableId = String(i).padStart(3, "0");
        break;
      }
    }

    usages.push({
      lane,
      range: formatLaneRange(lane),
      usedIds,
      nextAvailableId,
      total,
      used: usedIds.length,
    });
  }

  return usages;
}
