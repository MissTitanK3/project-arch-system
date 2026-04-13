import { Command } from "commander";
import { docs } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function registerDocsCommand(program: Command): void {
  program
    .command("docs")
    .description("Inspect architecture and linked documentation")
    .option("--json", "Output machine-readable JSON")
    .option("--linked-only", "Limit output to task/decision-linked docs", false)
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa docs [--json] [--linked-only]",
        description:
          "Inspect documentation inventory, including discovered markdown files and linked public docs.",
        examples: [
          { description: "Inspect docs inventory", command: "pa docs" },
          { description: "Show only linked docs as JSON", command: "pa docs --linked-only --json" },
        ],
        agentMetadata: {
          outputFormat: "Summary plus categorized documentation inventory",
        },
        relatedCommands: [
          { command: "pa report", description: "Generate architecture report" },
          { command: "pa help architecture", description: "Learn about documentation structure" },
        ],
      }),
    )
    .action(async (options: { json?: boolean; linkedOnly?: boolean }) => {
      const result = unwrap(await docs.docsCatalog({ linkedOnly: options.linkedOnly }));

      if (options.json) {
        printJson({ schemaVersion: "2.0", ...result });
        return;
      }

      console.log(
        [
          `docs: ${result.summary.total} total`,
          `${result.summary.existing} existing`,
          `${result.summary.missing} missing`,
          `${result.summary.referenced} referenced`,
          `${result.summary.discoveredOnDisk} on-disk`,
        ].join(" | "),
      );

      if (result.entries.length === 0) {
        console.log("No docs found.");
        return;
      }

      for (const entry of result.entries) {
        const markers = [entry.category, entry.exists ? "exists" : "missing"];
        if (entry.discoveredOnDisk) {
          markers.push("file");
        }
        if (entry.taskRefs > 0) {
          markers.push(`tasks:${entry.taskRefs}`);
        }
        if (entry.decisionRefs > 0) {
          markers.push(`decisions:${entry.decisionRefs}`);
        }
        console.log(`${entry.path} [${markers.join(", ")}]`);
      }
    });
}
