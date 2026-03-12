import path from "path";
import { Command } from "commander";
import { runBackfillImplemented } from "../../core/reconciliation/backfillImplemented";
import { formatEnhancedHelp } from "../help/format";

export function registerBackfillCommand(program: Command): void {
  const command = program.command("backfill").description("Run architecture backfill analysis");

  command
    .command("implemented")
    .description("Find completed tasks with missing or incomplete reconciliation")
    .option("--json", "Write backfill candidate artifact to .project-arch/reconcile/")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa backfill implemented [options]",
        description:
          "Enumerates completed tasks and identifies reconciliation backfill candidates. " +
          "Prioritizes candidates by reconciliation status: required, suggested, none.",
        options: [
          {
            flag: "--json",
            description: "Write optional artifact: .project-arch/reconcile/backfill-<date>.json",
          },
        ],
        examples: [
          {
            description: "List backfill candidates",
            command: "pa backfill implemented",
          },
          {
            description: "List and write JSON artifact",
            command: "pa backfill implemented --json",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Summary line counts followed by candidate rows: <status> <taskId> <phase>/<milestone> - <title>.",
        },
        relatedCommands: [
          {
            command: "pa reconcile task <taskId>",
            description: "Run reconciliation for a specific candidate",
          },
          { command: "pa check", description: "Validate architecture consistency" },
        ],
      }),
    )
    .action(async (options: { json?: boolean }) => {
      const result = await runBackfillImplemented({ writeJson: options.json });

      console.log(`completed tasks: ${result.totalCompletedTasks}`);
      console.log(`backfill candidates: ${result.candidateCount}`);

      if (result.candidates.length === 0) {
        console.log("No backfill candidates found.");
      } else {
        console.log("Candidates (priority order):");

        for (const candidate of result.candidates) {
          const row = [
            `- [${candidate.status}]`,
            candidate.taskId,
            `${candidate.phaseId}/${candidate.milestoneId}`,
            `- ${candidate.title}`,
          ].join(" ");
          console.log(row);
          console.log(`  source: ${candidate.source}; reason: ${candidate.reason}`);
          console.log(`  next:   ${candidate.suggestedCommand}`);
        }
      }

      if (result.jsonPath) {
        console.log(`json artifact: ${path.relative(process.cwd(), result.jsonPath)}`);
      }
    });
}
