import path from "path";
import { pathExists, readJson } from "../../utils/fs";
import { projectDocsRoot } from "../../utils/paths";

export const DEFAULT_DISCOVERED_LOAD_THRESHOLD_PERCENT = 40;

export async function resolveDiscoveredLoadThresholdPercent(cwd = process.cwd()): Promise<number> {
  const envValue = parseThreshold(process.env.PA_DISCOVERED_LOAD_THRESHOLD_PERCENT);
  if (envValue !== null) {
    return envValue;
  }

  const governancePath = path.join(projectDocsRoot(cwd), "governance.json");
  if (!(await pathExists(governancePath))) {
    return DEFAULT_DISCOVERED_LOAD_THRESHOLD_PERCENT;
  }

  const parsed = await readJson<{ discoveredLoadThresholdPercent?: unknown }>(governancePath);
  const fileValue = parseThreshold(parsed.discoveredLoadThresholdPercent);
  if (fileValue !== null) {
    return fileValue;
  }

  return DEFAULT_DISCOVERED_LOAD_THRESHOLD_PERCENT;
}

export function calculateDiscoveredRatioPercent(
  plannedCount: number,
  discoveredCount: number,
): number {
  const denominator = plannedCount + discoveredCount;
  if (denominator === 0) {
    return 0;
  }
  return (discoveredCount / denominator) * 100;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function parseThreshold(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric < 0 || numeric > 100) {
    return null;
  }
  return numeric;
}
