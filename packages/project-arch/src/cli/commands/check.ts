import { Command } from "commander";
import { check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";
import { filterCheckResult, toCheckDiagnosticsPayload } from "../../core/validation/check";
import { buildChangedScopePaths, detectChangedPaths } from "./checkChangedScope";

function renderFailFastDiagnostic(diagnostic: {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: string | null;
  hint: string | null;
}): string {
  const lines = [`[${diagnostic.code}] ${diagnostic.message}`];
  if (diagnostic.path) {
    lines.push(`Location: ${diagnostic.path}`);
  }
  if (diagnostic.hint) {
    lines.push(`Hint: ${diagnostic.hint}`);
  }
  return lines.join("\n");
}

function parseCsvOrRepeatable(value: string, previous: string[]): string[] {
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...previous, ...items];
}

function parseSeverityValues(
  value: string,
  previous: Array<"error" | "warning">,
): Array<"error" | "warning"> {
  const parsed = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is "error" | "warning" => entry === "error" || entry === "warning");
  return [...previous, ...parsed];
}

export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Validate architecture consistency")
    .option("--json", "Output machine-readable diagnostics as JSON")
    .option(
      "--only <codes>",
      "Filter diagnostics by code (comma-separated or repeatable)",
      parseCsvOrRepeatable,
      [],
    )
    .option(
      "--severity <levels>",
      "Filter diagnostics by severity: error, warning (comma-separated or repeatable)",
      parseSeverityValues,
      [],
    )
    .option(
      "--paths <patterns>",
      "Filter diagnostics by path glob patterns (comma-separated or repeatable)",
      parseCsvOrRepeatable,
      [],
    )
    .option("--changed", "Limit reported diagnostics to changed git scope with safe fallback")
    .option("--fail-fast", "Stop at first actionable error")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa check [options]",
        description:
          "Validate the architecture for consistency issues, broken links, and schema violations.",
        examples: [
          { description: "Run validation", command: "pa check" },
          {
            description: "Check only changed git scope (with safe fallback)",
            command: "pa check --changed",
          },
          { description: "Stop after first actionable error", command: "pa check --fail-fast" },
          { description: "Emit diagnostics JSON", command: "pa check --json" },
          {
            description: "Triage only untracked implementation warnings",
            command: "pa check --only UNTRACKED_IMPLEMENTATION --severity warning",
          },
          {
            description: "Scope diagnostics to web app paths",
            command: 'pa check --paths "apps/web/**"',
          },
        ],
        agentMetadata: {
          outputFormat: "Validation errors and warnings, exits with code 1 if errors found",
        },
        relatedCommands: [
          { command: "pa report", description: "Generate architecture report" },
          { command: "pa help architecture", description: "Learn about validation" },
        ],
      }),
    )
    .action(
      async (options: {
        json?: boolean;
        only?: string[];
        severity?: Array<"error" | "warning">;
        paths?: string[];
        changed?: boolean;
        failFast?: boolean;
      }) => {
        const rawResult = unwrap(await check.checkRun({ failFast: options.failFast }));

        let changedScopePaths: string[] | undefined;
        if (options.changed) {
          const changedDetection = detectChangedPaths();
          if (!changedDetection.ok || changedDetection.paths.length === 0) {
            const fallbackReason = !changedDetection.ok
              ? (changedDetection.reason ?? "could not infer changed files")
              : "no changed files detected";
            console.warn(`WARNING: --changed fallback to full check (${fallbackReason}).`);
          } else {
            changedScopePaths = buildChangedScopePaths(changedDetection.paths);
            console.log(
              `INFO: --changed detected ${changedDetection.paths.length} changed path(s); applying scoped diagnostics filter.`,
            );
          }
        }

        const resultWithPrimaryFilters = filterCheckResult(rawResult, {
          only: options.only,
          severity: options.severity,
          paths: changedScopePaths,
        });

        const result =
          options.changed && (options.paths?.length ?? 0) > 0
            ? filterCheckResult(resultWithPrimaryFilters, {
                paths: options.paths,
              })
            : options.changed
              ? resultWithPrimaryFilters
              : filterCheckResult(rawResult, {
                  only: options.only,
                  severity: options.severity,
                  paths: options.paths,
                });

        if (options.json) {
          const payload = toCheckDiagnosticsPayload(result);
          console.log(JSON.stringify(payload, null, 2));
          if (!result.ok) {
            process.exitCode = 1;
          }
          return;
        }

        if (options.failFast && !result.ok) {
          const firstErrorDiagnostic = result.diagnostics.find(
            (diagnostic) => diagnostic.severity === "error",
          );
          if (firstErrorDiagnostic) {
            console.error(renderFailFastDiagnostic(firstErrorDiagnostic));
            process.exitCode = 1;
            return;
          }
        }

        for (const warning of result.warnings) {
          console.warn(`WARNING: ${warning}`);
        }
        if (result.ok) {
          console.log("OK");
          return;
        }

        for (const error of result.errors) {
          console.error(`ERROR: ${error}`);
        }
        process.exitCode = 1;
      },
    );
}
