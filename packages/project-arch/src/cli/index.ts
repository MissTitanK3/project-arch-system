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
import { registerLintCommand } from "./commands/lint";
import { registerFeedbackCommand } from "./commands/feedback";
import { registerDoctorCommand } from "./commands/doctor";
import { registerReconcileCommand } from "./commands/reconcile";
import { registerBackfillCommand } from "./commands/backfill";
import {
  getArchDir,
  getCommandPathFromCommander,
  inferCommandPathFromArgv,
  safelyCaptureFeedback,
} from "../feedback/integration";

function buildCommandChainFromAction(actionCommand: Command): string[] {
  const names: string[] = [];
  let current: Command | null = actionCommand;

  while (current) {
    names.push(current.name());
    const parentCommand = current.parent as Command | undefined;
    current = parentCommand ?? null;
  }

  return names.reverse();
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program.name("pa").description("Project architecture CLI").version("1.0.0");
  const archDir = getArchDir(process.cwd());

  program.hook("postAction", async (_thisCommand, actionCommand) => {
    const commandPath = getCommandPathFromCommander(buildCommandChainFromAction(actionCommand));
    const exitCode = typeof process.exitCode === "number" ? process.exitCode : undefined;
    await safelyCaptureFeedback(archDir, {
      commandPath,
      argv,
      exitCode,
    });
  });

  registerInitCommand(program);
  registerPhaseCommand(program);
  registerMilestoneCommand(program);
  registerTaskCommand(program);
  registerDecisionCommand(program);
  registerDocsCommand(program);
  registerCheckCommand(program);
  registerDoctorCommand(program);
  registerLintCommand(program);
  registerReportCommand(program);
  registerPolicyCommand(program);
  registerFeedbackCommand(program);
  registerReconcileCommand(program);
  registerBackfillCommand(program);
  registerHelpCommand(program);

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const commandPath = inferCommandPathFromArgv(argv);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const exitCode = typeof process.exitCode === "number" ? process.exitCode : undefined;

    await safelyCaptureFeedback(archDir, {
      commandPath,
      argv,
      exitCode,
      errorMessage,
    });

    throw error;
  }
}
