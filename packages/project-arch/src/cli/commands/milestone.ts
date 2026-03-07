import { Command } from "commander";
import { milestones } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

export function registerMilestoneCommand(program: Command): void {
  const command = program.command("milestone");

  command
    .command("new")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .action(async (phaseId: string, milestoneId: string) => {
      unwrap(await milestones.milestoneCreate({ phase: phaseId, milestone: milestoneId }));
      console.log(`Created milestone ${phaseId}/${milestoneId}`);
    });

  command.command("list").action(async () => {
    const all = unwrap(await milestones.milestoneList());
    for (const milestone of all) {
      console.log(milestone);
    }
  });
}
