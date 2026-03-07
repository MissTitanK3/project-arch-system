import path from "node:path";
import { existsSync } from "node:fs";

function looksLikeProjectRoot(candidate: string): boolean {
  return (
    existsSync(path.join(candidate, "roadmap")) && existsSync(path.join(candidate, "arch-model"))
  );
}

/**
 * Pure function that resolves the project root path without side-effects.
 * Does NOT call process.chdir().
 */
export function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    const envRoot = path.resolve(process.env.PROJECT_ROOT);
    if (looksLikeProjectRoot(envRoot)) return envRoot;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "testProject"),
    path.resolve(cwd, "../../testProject"),
    path.resolve(cwd, "../../../testProject"),
  ];

  for (const candidate of candidates) {
    if (looksLikeProjectRoot(candidate)) {
      return candidate;
    }
  }

  return path.resolve(cwd, "../..");
}

export function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

export function mapTargetToModule(target: string): string {
  const normalized = normalizePath(target);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return normalized;
  if ((parts[0] === "apps" || parts[0] === "packages") && parts[1])
    return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "architecture" && parts[1]) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "arch-domains") return "arch-domains";
  if (parts[0] === "roadmap") return "roadmap";
  return parts.slice(0, Math.min(parts.length, 2)).join("/");
}
