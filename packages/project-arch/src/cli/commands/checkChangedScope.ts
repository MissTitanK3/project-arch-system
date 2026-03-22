import { spawnSync } from "child_process";

const REQUIRED_CHANGED_SCOPE_PATHS = [
  "roadmap/manifest.json",
  "arch-model/modules.json",
  "arch-domains/domains.json",
  ".project-arch/graph.config.json",
  ".project-arch/reconcile.config.json",
  ".arch/**",
] as const;

export interface ChangedScopeDetectionResult {
  ok: boolean;
  paths: string[];
  reason?: string;
}

function normalizeChangedPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");
}

export function detectChangedPaths(cwd = process.cwd()): ChangedScopeDetectionResult {
  const gitResult = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });

  if (gitResult.error) {
    return { ok: false, paths: [], reason: gitResult.error.message };
  }

  if (typeof gitResult.status === "number" && gitResult.status !== 0) {
    return {
      ok: false,
      paths: [],
      reason: (gitResult.stderr || "git status failed").trim() || "git status failed",
    };
  }

  const changedPaths = new Set<string>();
  const lines = gitResult.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    const payload = line.slice(3).trim();
    if (!payload) continue;

    if (payload.includes(" -> ")) {
      const [fromPath, toPath] = payload.split(" -> ");
      const normalizedFrom = normalizeChangedPath(fromPath);
      const normalizedTo = normalizeChangedPath(toPath);
      if (normalizedFrom) changedPaths.add(normalizedFrom);
      if (normalizedTo) changedPaths.add(normalizedTo);
      continue;
    }

    const normalized = normalizeChangedPath(payload);
    if (normalized) {
      changedPaths.add(normalized);
    }
  }

  return { ok: true, paths: [...changedPaths] };
}

export function buildChangedScopePaths(changedPaths: string[]): string[] {
  const scope = new Set<string>();
  for (const changedPath of changedPaths) {
    const normalized = normalizeChangedPath(changedPath);
    if (!normalized) continue;
    scope.add(normalized);
  }

  for (const requiredPath of REQUIRED_CHANGED_SCOPE_PATHS) {
    scope.add(requiredPath);
  }

  return [...scope];
}
