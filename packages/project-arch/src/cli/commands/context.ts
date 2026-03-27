import { Command } from "commander";
import { context as contextSdk } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function registerContextCommand(program: Command): void {
  program
    .command("context")
    .description("Resolve active repository context")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa context [--json]",
        description:
          "Resolve the current active phase, milestone, and task context without mutating repository state.",
        examples: [
          { description: "Print active repository context", command: "pa context" },
          { description: "Emit machine-readable context", command: "pa context --json" },
        ],
        agentMetadata: {
          outputFormat:
            "Context payload with version, timestamp, projectRoot, active phase/milestone/task, and optional recommended action.",
        },
        relatedCommands: [
          { command: "pa next", description: "Recommend next deterministic workflow action" },
          { command: "pa report", description: "Generate broader repository report" },
        ],
      }),
    )
    .action(async (options: { json?: boolean }) => {
      const resolved = unwrap(await contextSdk.contextResolve());

      if (options.json) {
        printJson(resolved);
        return;
      }

      console.log(`phase: ${resolved.active.phase.id}`);
      console.log(`milestone: ${resolved.active.milestone.id}`);
      console.log(`task: ${resolved.active.task.id}`);
      console.log(`task title: ${resolved.active.task.title}`);
      console.log(`task status: ${resolved.active.task.status}`);
      if (resolved.recommended) {
        console.log(`recommended command: ${resolved.recommended.action.command}`);
      }
    });
}
