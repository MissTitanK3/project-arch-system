import { TaskLane } from "../../schemas/task";

export const laneRanges: Record<TaskLane, { min: number; max: number }> = {
  planned: { min: 1, max: 99 },
  discovered: { min: 101, max: 199 },
  backlog: { min: 901, max: 999 },
};

/**
 * Format a lane range for display (e.g., "001-099")
 */
export function formatLaneRange(lane: TaskLane): string {
  const range = laneRanges[lane];
  return `${String(range.min).padStart(3, "0")}-${String(range.max).padStart(3, "0")}`;
}

/**
 * Get a formatted table of all lane ranges
 */
export function getLaneRangesTable(): string {
  const lanes: TaskLane[] = ["planned", "discovered", "backlog"];
  const rows = lanes.map((lane) => `  ${lane.padEnd(12)} ${formatLaneRange(lane)}`);
  return ["Lane Ranges:", ...rows].join("\n");
}

export function idInLaneRange(id: string, lane: TaskLane): boolean {
  const value = Number(id);
  if (Number.isNaN(value)) {
    return false;
  }
  const range = laneRanges[lane];
  return value >= range.min && value <= range.max;
}

export function nextTaskId(existingIds: string[], lane: TaskLane): string {
  const range = laneRanges[lane];
  const used = new Set(existingIds.map((value) => Number(value)));

  for (let i = range.min; i <= range.max; i += 1) {
    if (!used.has(i)) {
      return String(i).padStart(3, "0");
    }
  }

  throw new Error(`No available task IDs left in lane '${lane}' (${range.min}-${range.max})`);
}
