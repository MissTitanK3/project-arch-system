import { Command } from "commander";
import { phases } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

export function registerPhaseCommand(program: Command): void {
  const command = program.command("phase");

  command
    .command("new")
    .argument("<id>", "phase id")
    .action(async (id: string) => {
      unwrap(await phases.phaseCreate({ id }));
      console.log(`Created phase ${id}`);
    });

  command.command("list").action(async () => {
    const all = unwrap(await phases.phaseList());
    for (const phase of all) {
      const activeMark = phase.active ? "*" : " ";
      console.log(`${activeMark} ${phase.id}`);
    }
  });
}
