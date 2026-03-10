import { Command } from "commander";
import { check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";
import { filterCheckResult, toCheckDiagnosticsPayload } from "../../core/validation/check";

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
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa check [options]",
        description:
          "Validate the architecture for consistency issues, broken links, and schema violations.",
        examples: [
          { description: "Run validation", command: "pa check" },
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
      }) => {
        const rawResult = unwrap(await check.checkRun());
        const result = filterCheckResult(rawResult, {
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
