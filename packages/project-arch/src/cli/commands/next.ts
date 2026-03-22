import { Command } from "commander";
import { next as nextSdk } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerNextCommand(program: Command): void {
  program
    .command("next")
    .description("Recommend the next deterministic workflow action")
    .option("--json", "Output machine-readable routing decision")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa next [--json]",
        description:
          "Determines the next logical action based on repository state using deterministic route precedence.",
        examples: [
          { description: "Print next action", command: "pa next" },
          { description: "Emit machine-readable decision", command: "pa next --json" },
        ],
        agentMetadata: {
          outputFormat:
            "Decision contract with status, recommendedCommand, reason, and evidence. Never mutates repository state.",
        },
        relatedCommands: [
          { command: "pa doctor health", description: "Structural health diagnostics" },
          { command: "pa check", description: "Critical architecture validations" },
          { command: "pa reconcile", description: "Reconciliation workflows" },
          { command: "pa report", description: "Verification and reporting" },
        ],
      }),
    )
    .action(async (options: { json?: boolean }) => {
      const decision = unwrap(await nextSdk.nextResolve());

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              schemaVersion: "1.0",
              ...decision,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`status: ${decision.status}`);
      console.log(`next: ${decision.recommendedCommand}`);
      console.log(`reason: ${decision.reason}`);
      if (decision.evidence.length > 0) {
        console.log("evidence:");
        for (const evidence of decision.evidence) {
          console.log(`- ${evidence}`);
        }
      }
    });
}
