import { Command } from "commander";
import { report } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";
import { sanitizeTerminalText } from "../../utils/outputSafety";

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Generate architecture report")
    .option("-v, --verbose", "Include detailed inconsistency diagnostics")
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
          { description: "Save report to file", command: "pa report > architecture-report.txt" },
          {
            description: "Generate verbose report and save",
            command: "pa report -v > detailed-report.txt",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Report text with sections: metrics (with provenance), parity summary, consistency checks, governance warnings. Verbose mode adds full inconsistency table.",
        },
        relatedCommands: [
          { command: "pa check", description: "Validate architecture" },
          { command: "pa docs", description: "List documentation" },
        ],
      }),
    )
    .action(async (options: { verbose?: boolean }) => {
      const output = unwrap(await report.reportGenerate({ verbose: options.verbose })).text;
      console.log(sanitizeTerminalText(output, { allowNewlines: true, allowTabs: true }));
    });
}
