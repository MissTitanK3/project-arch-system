import fg from "fast-glob";
import { DecisionRecord } from "../../core/validation/decisions";
import { TaskRecord } from "../../core/validation/tasks";
import { DriftFinding } from "./runChecks";

export async function checkTasks(
  cwd: string,
  taskRecords: TaskRecord[],
  decisionRecords: DecisionRecord[],
): Promise<DriftFinding[]> {
  const findings: DriftFinding[] = [];

  const trackedPrefixes = new Set<string>();
  for (const task of taskRecords) {
    for (const target of task.frontmatter.codeTargets) {
      trackedPrefixes.add(normalizePrefix(target));
    }
  }
  for (const decision of decisionRecords) {
    for (const target of decision.frontmatter.links.codeTargets) {
      trackedPrefixes.add(normalizePrefix(target));
    }
  }

  if (trackedPrefixes.size === 0) {
    return findings;
  }

  const files = await fg(["apps/**/*.{ts,tsx,js,jsx}", "packages/**/*.{ts,tsx,js,jsx}"], {
    cwd,
    absolute: false,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  });

  for (const file of files.sort()) {
    const normalizedFile = file.replace(/\\/g, "/");
    const matches = [...trackedPrefixes].some(
      (prefix) => normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`),
    );
    if (!matches) {
      findings.push({
        severity: "warning",
        code: "UNTRACKED_IMPLEMENTATION",
        message: `${normalizedFile} not associated with any task or decision codeTarget`,
      });
    }
  }

  return compressWarnings(findings);
}

function normalizePrefix(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function compressWarnings(findings: DriftFinding[]): DriftFinding[] {
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const errors = findings.filter((finding) => finding.severity === "error");
  const maxWarnings = 50;
  if (warnings.length <= maxWarnings) {
    return [...errors, ...warnings];
  }

  return [
    ...errors,
    ...warnings.slice(0, maxWarnings),
    {
      severity: "warning",
      code: "UNTRACKED_IMPLEMENTATION_TRUNCATED",
      message: `${warnings.length - maxWarnings} additional untracked implementation files omitted`,
    },
  ];
}
