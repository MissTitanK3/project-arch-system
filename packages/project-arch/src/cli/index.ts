import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerProjectCommand } from "./commands/project";
import { registerPhaseCommand } from "./commands/phase";
import { registerMilestoneCommand } from "./commands/milestone";
import { registerTaskCommand } from "./commands/task";
import { registerDecisionCommand } from "./commands/decision";
import { registerDocsCommand } from "./commands/docs";
import { registerCheckCommand } from "./commands/check";
import { registerContextCommand } from "./commands/context";
import { registerLearnCommand } from "./commands/learn";
import { registerReportCommand } from "./commands/report";
import { registerPolicyCommand } from "./commands/policy";
import { registerHelpCommand } from "./commands/help";
import { registerLintCommand } from "./commands/lint";
import { registerFeedbackCommand } from "./commands/feedback";
import { registerDoctorCommand } from "./commands/doctor";
import { registerReconcileCommand } from "./commands/reconcile";
import { registerBackfillCommand } from "./commands/backfill";
import { registerNextCommand } from "./commands/next";
import { registerExplainCommand } from "./commands/explain";
import { registerFixCommand } from "./commands/fix";
import { registerNormalizeCommand } from "./commands/normalize";
import { registerAgentCommand } from "./commands/agent";
import { registerResultCommand } from "./commands/result";
import { registerAgentsCommand } from "./commands/agents";
import { registerRuntimeCommand } from "./commands/runtime";
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
  program.name("pa").description("Project architecture CLI").version("2.0.0");
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
  registerProjectCommand(program);
  registerPhaseCommand(program);
  registerMilestoneCommand(program);
  registerTaskCommand(program);
  registerDecisionCommand(program);
  registerDocsCommand(program);
  registerCheckCommand(program);
  registerContextCommand(program);
  registerLearnCommand(program);
  registerDoctorCommand(program);
  registerLintCommand(program);
  registerReportCommand(program);
  registerPolicyCommand(program);
  registerFeedbackCommand(program);
  registerReconcileCommand(program);
  registerBackfillCommand(program);
  registerNextCommand(program);
  registerExplainCommand(program);
  registerFixCommand(program);
  registerNormalizeCommand(program);
  registerAgentCommand(program);
  registerResultCommand(program);
  registerAgentsCommand(program);
  registerRuntimeCommand(program);
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
