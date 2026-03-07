import { TaskLane } from "../../schemas/task";

const laneRanges: Record<TaskLane, { min: number; max: number }> = {
  planned: { min: 1, max: 99 },
  discovered: { min: 101, max: 199 },
  backlog: { min: 901, max: 999 },
};

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
