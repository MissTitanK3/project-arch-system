import { Command } from "commander";
import { report } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";
import { sanitizeTerminalText } from "../../utils/outputSafety";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Generate architecture report")
    .option("-v, --verbose", "Include detailed inconsistency diagnostics")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa report [options]",
        description:
          "Generate a comprehensive architecture report with task distribution, decision status, milestone progress, and parity diagnostics.",
        examples: [
          { description: "Generate concise report", command: "pa report" },
          {
            description: "Generate verbose report with full diagnostics",
            command: "pa report --verbose",
          },
          {
            description: "Generate structured JSON report",
            command: "pa report --json",
          },
          { description: "Save report to file", command: "pa report > architecture-report.txt" },
          {
            description: "Generate verbose report and save",
            command: "pa report -v > detailed-report.txt",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Report text or JSON with metrics, docs coverage, graph summary, parity summary, consistency checks, and governance warnings. Verbose mode adds full inconsistency diagnostics.",
        },
        relatedCommands: [
          { command: "pa check", description: "Validate architecture" },
          { command: "pa docs", description: "List documentation" },
        ],
      }),
    )
    .action(async (options: { verbose?: boolean; json?: boolean }) => {
      const output = unwrap(await report.reportGenerate({ verbose: options.verbose }));
      if (options.json) {
        printJson({ schemaVersion: "1.0", ...output });
        return;
      }
      console.log(sanitizeTerminalText(output.text, { allowNewlines: true, allowTabs: true }));
    });
}
