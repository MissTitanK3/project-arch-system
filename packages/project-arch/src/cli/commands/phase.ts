import { Command } from "commander";
import { phases } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { assertSafeId } from "../../utils/safeId";
import { formatEnhancedHelp } from "../help/format";

export function registerPhaseCommand(program: Command): void {
  const command = program.command("phase");

  command
    .command("new")
    .argument("<id>", "phase id")
    .description("Create a new phase")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa phase new <id>",
        description: "Create a new phase in the project roadmap.",
        examples: [
          { description: "Create phase 1", command: "pa phase new phase-1" },
          { description: "Create phase 2", command: "pa phase new phase-2" },
        ],
        agentMetadata: {
          inputValidation: {
            id: "string matching /^phase-\\d+$/",
          },
          outputFormat: "Success message with phase ID",
          fileLocation: "roadmap/phases/{id}/overview.md",
        },
        relatedCommands: [
          { command: "pa milestone new --help", description: "Create a milestone" },
          { command: "pa phase list", description: "List all phases" },
        ],
      }),
    )
    .action(async (id: string) => {
      try {
        assertSafeId(id, "phaseId");
      } catch (error) {
        console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
        console.error(
          "Hint: phase ids must be lowercase alphanumeric with single hyphens, e.g. phase-1",
        );
        process.exitCode = 1;
        return;
      }
      unwrap(await phases.phaseCreate({ id }));
      console.log(`Created phase ${id}`);
    });

  command
    .command("list")
    .description("List all phases")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa phase list",
        description: "List all phases in the project. Active phase is marked with *.",
        examples: [{ description: "List all phases", command: "pa phase list" }],
        agentMetadata: {
          outputFormat: "One phase per line, active phase prefixed with *",
        },
        relatedCommands: [
          { command: "pa phase new --help", description: "Create a phase" },
          { command: "pa milestone list", description: "List all milestones" },
        ],
      }),
    )
    .action(async () => {
      const all = unwrap(await phases.phaseList());
      for (const phase of all) {
        const activeMark = phase.active ? "*" : " ";
        console.log(`${activeMark} ${phase.id}`);
      }
    });
}
