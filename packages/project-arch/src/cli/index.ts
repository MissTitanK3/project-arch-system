import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerPhaseCommand } from "./commands/phase";
import { registerMilestoneCommand } from "./commands/milestone";
import { registerTaskCommand } from "./commands/task";
import { registerDecisionCommand } from "./commands/decision";
import { registerDocsCommand } from "./commands/docs";
import { registerCheckCommand } from "./commands/check";
import { registerReportCommand } from "./commands/report";
import { registerPolicyCommand } from "./commands/policy";
import { registerHelpCommand } from "./commands/help";

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program.name("pa").description("Project architecture CLI").version("1.0.0");

  registerInitCommand(program);
  registerPhaseCommand(program);
  registerMilestoneCommand(program);
  registerTaskCommand(program);
  registerDecisionCommand(program);
  registerDocsCommand(program);
  registerCheckCommand(program);
  registerReportCommand(program);
  registerPolicyCommand(program);
  registerHelpCommand(program);

  await program.parseAsync(argv);
}
