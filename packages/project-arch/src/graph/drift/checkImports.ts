import fs from "fs-extra";
import fg from "fast-glob";
import { DriftFinding } from "./runChecks";

const IMPORT_PATTERN =
  /(?:import|export)\s[^'"\n]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export async function checkImports(cwd: string): Promise<DriftFinding[]> {
  const findings: DriftFinding[] = [];

  const files = await fg(["apps/**/*.{ts,tsx,js,jsx}", "packages/**/*.{ts,tsx,js,jsx}"], {
    cwd,
    absolute: false,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  });

  for (const file of files.sort()) {
    if (!file.startsWith("packages/")) {
      continue;
    }

    const content = await fs.readFile(`${cwd}/${file}`, "utf8");
    let match: RegExpExecArray | null = IMPORT_PATTERN.exec(content);
    while (match) {
      const spec = (match[1] ?? match[2] ?? "").replace(/\\/g, "/");
      if (isAppsImport(spec)) {
        findings.push({
          severity: "error",
          code: "LAYER_VIOLATION",
          message: `${file} imports from apps layer ('${spec}')`,
        });
      }
      match = IMPORT_PATTERN.exec(content);
    }
    IMPORT_PATTERN.lastIndex = 0;
  }

  return findings;
}

function isAppsImport(spec: string): boolean {
  if (spec.includes("apps/")) {
    return true;
  }
  if (/^\.{1,2}\//.test(spec) && spec.includes("apps/")) {
    return true;
  }
  return false;
}
