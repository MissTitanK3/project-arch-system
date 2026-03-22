import path from "path";
import fg from "fast-glob";
import { DecisionRecord } from "../../core/validation/decisions";
import { pathExists, readJson } from "../../fs";
import { DriftFinding } from "./runChecks";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";

export async function checkModules(
  cwd: string,
  decisionRecords: DecisionRecord[],
): Promise<DriftFinding[]> {
  const findings: DriftFinding[] = [];

  const modulesPath = path.join(cwd, "arch-model", "modules.json");
  if (!(await pathExists(modulesPath))) {
    findings.push({
      severity: "warning",
      code: "ARCH_MAP_MISSING",
      message: "arch-model/modules.json not found; module drift checks skipped.",
    });
    return findings;
  }

  const declaredRaw = await readJson<{ modules?: unknown }>(modulesPath);
  const declaredModules = new Set(
    Array.isArray(declaredRaw.modules)
      ? declaredRaw.modules
          .filter(
            (item): item is { name: string } =>
              !!item && typeof item === "object" && typeof item.name === "string",
          )
          .map((item) => item.name)
      : [],
  );

  const repoModules = await fg(["apps/*", "packages/*"], {
    cwd,
    onlyDirectories: true,
    absolute: false,
    followSymbolicLinks: false,
  });
  const safeRepoModules = await filterGlobPathsBySymlinkPolicy(repoModules, cwd);

  for (const moduleName of safeRepoModules.sort()) {
    if (declaredModules.has(moduleName)) {
      continue;
    }

    findings.push({
      severity: "error",
      code: "UNMAPPED_MODULE",
      message: `${moduleName} not declared in arch-model/modules.json`,
    });

    const coveredByDecision = decisionRecords.some((decision) =>
      decision.frontmatter.links.codeTargets.some(
        (target) =>
          normalizePath(target).startsWith(`${moduleName}/`) ||
          normalizePath(target) === moduleName,
      ),
    );

    if (!coveredByDecision) {
      findings.push({
        severity: "error",
        code: "MISSING_ARCHITECTURE_DECISION",
        message: `module ${moduleName} has no linked architecture decision`,
      });
    }
  }

  return findings;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
