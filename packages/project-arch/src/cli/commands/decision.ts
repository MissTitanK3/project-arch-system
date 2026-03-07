import { Command } from "commander";
import { decisions } from "../../sdk";
import type { NewDecisionOptions } from "../../sdk/decisions";
import { unwrap } from "../../sdk/_utils";

export function registerDecisionCommand(program: Command): void {
  const command = program.command("decision");

  command
    .command("new")
    .option("--scope <scope>", "project | phase | milestone", "project")
    .option("--phase <phaseId>")
    .option("--milestone <milestoneId>")
    .option("--slug <slug>", "decision")
    .option("--title <title>", "Decision")
    .action(async (options: NewDecisionOptions) => {
      const created = unwrap(await decisions.decisionCreate(options)).path;
      console.log(created);
    });

  command
    .command("link")
    .argument("<decisionId>")
    .option("--task <taskRef>", "phase-id/milestone-id/task-id")
    .option("--code <codeTarget>")
    .option("--doc <publicDocPath>")
    .action(async (decisionId: string, options: { task?: string; code?: string; doc?: string }) => {
      unwrap(await decisions.decisionLink({ decisionId, ...options }));
      console.log(`Updated links for ${decisionId}`);
    });

  command
    .command("status")
    .argument("<decisionId>")
    .argument("<status>")
    .action(async (decisionId: string, status: string) => {
      const nextStatus = unwrap(await decisions.decisionStatus({ decisionId, status })).status;
      console.log(`${decisionId} -> ${nextStatus}`);
    });

  command
    .command("supersede")
    .argument("<decisionId>")
    .argument("<supersededDecisionId>")
    .action(async (decisionId: string, supersededDecisionId: string) => {
      unwrap(await decisions.decisionSupersede({ decisionId, supersededDecisionId }));
      console.log(`${decisionId} supersedes ${supersededDecisionId}`);
    });

  command.command("list").action(async () => {
    const all = unwrap(await decisions.decisionList());
    for (const decision of all) {
      console.log(`${decision.id} | ${decision.status}`);
    }
  });
}
