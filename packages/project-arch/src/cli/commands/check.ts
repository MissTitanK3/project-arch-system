import { Command } from "commander";
import { check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Validate architecture consistency")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa check",
        description:
          "Validate the architecture for consistency issues, broken links, and schema violations.",
        examples: [{ description: "Run validation", command: "pa check" }],
        agentMetadata: {
          outputFormat: "Validation errors and warnings, exits with code 1 if errors found",
        },
        relatedCommands: [
          { command: "pa report", description: "Generate architecture report" },
          { command: "pa help architecture", description: "Learn about validation" },
        ],
      }),
    )
    .action(async () => {
      const result = unwrap(await check.checkRun());
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
    });
}
