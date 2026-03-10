import { lintFrontmatter } from "../validation/frontmatter";

export async function runFrontmatterLint(options?: { cwd?: string; fix?: boolean }): Promise<{
  ok: boolean;
  scannedFiles: number;
  fixedFiles: number;
  diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    path: string;
    line: number;
  }>;
}> {
  return lintFrontmatter(options);
}
