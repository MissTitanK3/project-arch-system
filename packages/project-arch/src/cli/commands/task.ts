import path from "path";
import { Command } from "commander";
import { tasks } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

export function registerTaskCommand(program: Command): void {
  const command = program.command("task");

  command
    .command("new")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .action(async (phaseId: string, milestoneId: string) => {
      const result = await tasks.taskCreate({ phase: phaseId, milestone: milestoneId });
      const created = unwrap(result).path;
      console.log(path.relative(process.cwd(), created));
    });

  command
    .command("discover")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .requiredOption("--from <taskId>", "source task id")
    .action(async (phaseId: string, milestoneId: string, options: { from: string }) => {
      if (!/^\d{3}$/.test(options.from)) {
        throw new Error("--from must be a 3-digit task id");
      }
      const result = await tasks.taskDiscover({
        phase: phaseId,
        milestone: milestoneId,
        from: options.from,
      });
      const created = unwrap(result).path;
      console.log(path.relative(process.cwd(), created));
    });

  command
    .command("idea")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .action(async (phaseId: string, milestoneId: string) => {
      const result = await tasks.taskIdea({ phase: phaseId, milestone: milestoneId });
      const created = unwrap(result).path;
      console.log(path.relative(process.cwd(), created));
    });

  command
    .command("status")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .argument("<taskId>")
    .action(async (phaseId: string, milestoneId: string, taskId: string) => {
      const status = unwrap(
        await tasks.taskStatus({ phase: phaseId, milestone: milestoneId, taskId }),
      ).status;
      console.log(status);
    });
}
