import { Command } from "commander";
import { docs } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerDocsCommand(program: Command): void {
  program
    .command("docs")
    .description("List all architecture documentation")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa docs",
        description: "List all architecture documentation files organized by category.",
        examples: [{ description: "List all docs", command: "pa docs" }],
        agentMetadata: {
          outputFormat: "Category and file paths, one per line",
        },
        relatedCommands: [
          { command: "pa report", description: "Generate architecture report" },
          { command: "pa help architecture", description: "Learn about documentation structure" },
        ],
      }),
    )
    .action(async () => {
      const refs = unwrap(await docs.docsList()).refs;
      for (const ref of refs) {
        console.log(ref);
      }
    });
}
