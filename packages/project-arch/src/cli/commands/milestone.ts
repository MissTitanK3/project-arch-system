import { Command } from "commander";
import { milestones } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerMilestoneCommand(program: Command): void {
  const command = program.command("milestone");

  command
    .command("new")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .description("Create a new milestone")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone new <phaseId> <milestoneId>",
        description: "Create a new milestone within a phase.",
        examples: [
          {
            description: "Create a milestone",
            command: "pa milestone new phase-1 milestone-1-setup",
          },
          {
            description: "Create milestone with short name",
            command: "pa milestone new phase-1 m1",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat: "Success message with phase/milestone path",
          fileLocation: "roadmap/phases/{phase}/milestones/{milestone}/overview.md",
        },
        commonIssues: [{ issue: "Phase does not exist", solution: "Run 'pa phase new' first" }],
        relatedCommands: [
          { command: "pa task new --help", description: "Create a task" },
          { command: "pa milestone list", description: "List all milestones" },
        ],
      }),
    )
    .action(async (phaseId: string, milestoneId: string) => {
      unwrap(await milestones.milestoneCreate({ phase: phaseId, milestone: milestoneId }));
      console.log(`Created milestone ${phaseId}/${milestoneId}`);
    });

  command
    .command("list")
    .description("List all milestones")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone list",
        description: "List all milestones across all phases.",
        examples: [{ description: "List all milestones", command: "pa milestone list" }],
        agentMetadata: {
          outputFormat: "One milestone per line: phase-id/milestone-id",
        },
        relatedCommands: [
          { command: "pa milestone new --help", description: "Create a milestone" },
          { command: "pa phase list", description: "List all phases" },
        ],
      }),
    )
    .action(async () => {
      const all = unwrap(await milestones.milestoneList());
      for (const milestone of all) {
        console.log(milestone);
      }
    });
}
