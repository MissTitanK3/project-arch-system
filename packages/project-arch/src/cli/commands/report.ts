import { Command } from "commander";
import { report } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Generate architecture report")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa report",
        description:
          "Generate a comprehensive architecture report with task distribution, decision status, and milestone progress.",
        examples: [
          { description: "Generate report", command: "pa report" },
          { description: "Save report to file", command: "pa report > architecture-report.txt" },
        ],
        agentMetadata: {
          outputFormat: "Report text with sections for tasks, decisions, phases, milestones",
        },
        relatedCommands: [
          { command: "pa check", description: "Validate architecture" },
          { command: "pa docs", description: "List documentation" },
        ],
      }),
    )
    .action(async () => {
      console.log(unwrap(await report.reportGenerate()).text);
    });
}
