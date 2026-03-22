import type { FrontmatterRepairResult } from "../../core/validation/frontmatterRepair";

export function renderRepairResult(
  result: FrontmatterRepairResult,
  options: { apply: boolean; check?: boolean; commandLabel: string },
): void {
  const changed = result.fileResults.filter((file) => file.changed);
  const manual = result.fileResults.filter((file) => file.requiresManualIntervention);

  if (changed.length > 0 && !options.apply) {
    for (const file of changed) {
      if (file.diff) {
        console.log(file.diff);
      }
    }
    console.log("");
    console.log(
      `Dry-run: ${changed.length} file(s) would be updated by ${options.commandLabel}. Re-run with --yes to apply.`,
    );
  }

  if (changed.length > 0 && options.apply) {
    console.log(`Applied ${result.appliedFiles} file(s) via ${options.commandLabel}.`);
  }

  if (manual.length > 0) {
    console.error("");
    console.error(`Manual intervention required for ${manual.length} file(s):`);
    for (const file of manual) {
      console.error(`- ${file.path}`);
      for (const diagnostic of file.diagnostics) {
        console.error(`  [${diagnostic.code}] line ${diagnostic.line}: ${diagnostic.message}`);
      }
      if (file.suggestion) {
        console.error(`  Suggestion: ${file.suggestion}`);
      }
    }
  }

  if (result.changedFiles === 0 && result.manualFiles === 0) {
    console.log("OK");
  }

  if (options.check && (result.changedFiles > 0 || result.manualFiles > 0)) {
    process.exitCode = 1;
    return;
  }

  if (result.manualFiles > 0) {
    process.exitCode = 1;
  }
}
