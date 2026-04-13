import { Command } from "commander";
import { milestones } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { assertSafeId } from "../../utils/safeId";
import { formatEnhancedHelp } from "../help/format";

export function registerMilestoneCommand(program: Command): void {
  const command = program.command("milestone");

  command
    .command("new")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .option("--project <projectId>", "Validate the owning project for this phase")
    .description("Create a new milestone")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone new <phaseId> <milestoneId> [--project <projectId>]",
        description:
          "Create a new milestone within a phase and resolve it inside the phase's owning project.",
        examples: [
          {
            description: "Create a milestone",
            command: "pa milestone new phase-1 milestone-1-setup",
          },
          {
            description: "Create a milestone in a named project phase",
            command: "pa milestone new phase-2 milestone-1-checkout --project storefront",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
            projectId: "string matching /^[a-z0-9]+(?:-[a-z0-9]+)*$/",
          },
          outputFormat: "Success message with project/phase/milestone path",
          fileLocation:
            "roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/overview.md",
        },
        commonIssues: [{ issue: "Phase does not exist", solution: "Run 'pa phase new' first" }],
        relatedCommands: [
          { command: "pa task new --help", description: "Create a task" },
          { command: "pa milestone list", description: "List all milestones" },
        ],
      }),
    )
    .action(async (phaseId: string, milestoneId: string, options: { project?: string }) => {
      try {
        assertSafeId(phaseId, "phaseId");
        assertSafeId(milestoneId, "milestoneId");
        if (options.project) {
          assertSafeId(options.project, "projectId");
        }
      } catch (error) {
        console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
        console.error(
          "Hint: ids must be lowercase alphanumeric with single hyphens, e.g. phase-1 milestone-1-setup storefront",
        );
        process.exitCode = 1;
        return;
      }
      const result = unwrap(
        await milestones.milestoneCreate({
          project: options.project,
          phase: phaseId,
          milestone: milestoneId,
        }),
      );
      console.log(`Created milestone ${result.projectId}/${phaseId}/${milestoneId}`);
    });

  command
    .command("list")
    .option("--project <projectId>", "Filter milestones by project id")
    .description("List all milestones")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone list [--project <projectId>]",
        description: "List all milestones across all phases, grouped by owning project and phase.",
        examples: [
          { description: "List all milestones", command: "pa milestone list" },
          {
            description: "List milestones in one project",
            command: "pa milestone list --project storefront",
          },
        ],
        agentMetadata: {
          outputFormat: "One milestone per line: project-id/phase-id/milestone-id",
        },
        relatedCommands: [
          { command: "pa milestone new --help", description: "Create a milestone" },
          { command: "pa phase list", description: "List all phases" },
        ],
      }),
    )
    .action(async (options: { project?: string }) => {
      if (options.project) {
        try {
          assertSafeId(options.project, "projectId");
        } catch (error) {
          console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
          console.error(
            "Hint: project ids must be lowercase alphanumeric with single hyphens, e.g. storefront",
          );
          process.exitCode = 1;
          return;
        }
      }
      const all = unwrap(await milestones.milestoneList({ project: options.project }));
      for (const milestone of all) {
        console.log(`${milestone.projectId}/${milestone.phaseId}/${milestone.milestoneId}`);
      }
    });

  command
    .command("status")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .description("Show milestone task statuses with dependency gating")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone status <phaseId> <milestoneId>",
        description:
          "Show milestone task status, including dependency-derived blocked states from task frontmatter dependsOn links.",
        examples: [
          {
            description: "Inspect milestone readiness and dependency blockers",
            command: "pa milestone status phase-1 milestone-1-setup",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat:
            "One task per line with effective status; blocked tasks list unresolved dependency IDs.",
        },
        relatedCommands: [
          { command: "pa task status", description: "Check raw status for a single task" },
          { command: "pa milestone complete", description: "Complete a milestone" },
        ],
      }),
    )
    .option("--project <projectId>", "Validate the owning project for this phase")
    .action(async (phaseId: string, milestoneId: string, options: { project?: string }) => {
      const result = unwrap(
        await milestones.milestoneStatus({
          project: options.project,
          phase: phaseId,
          milestone: milestoneId,
        }),
      );

      console.log(`Milestone status ${result.projectId}/${phaseId}/${milestoneId}`);

      let hasBlockedTasks = false;
      for (const task of result.tasks) {
        if (task.unresolvedDependsOn.length > 0 && task.effectiveStatus === "blocked") {
          hasBlockedTasks = true;
          console.log(
            `${task.id} [${task.lane}] blocked (raw: ${task.status}) - unresolved dependencies: ${task.unresolvedDependsOn.join(", ")}`,
          );
          continue;
        }

        console.log(`${task.id} [${task.lane}] ${task.effectiveStatus}`);
      }

      if (hasBlockedTasks) {
        console.log(
          "Resolve prerequisite tasks and mark them done before advancing blocked tasks.",
        );
        process.exitCode = 1;
      }
    });

  command
    .command("activate")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .description("Activate a milestone")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone activate <phaseId> <milestoneId>",
        description:
          "Set the active milestone after validating readiness prerequisites (planned task, targets file, and success criteria/checklist).",
        examples: [
          {
            description: "Activate a milestone",
            command: "pa milestone activate phase-1 milestone-1-setup",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat: "Success message or readiness diagnostics",
        },
        relatedCommands: [
          { command: "pa milestone new --help", description: "Create a milestone" },
          { command: "pa task new --help", description: "Create planned tasks" },
        ],
      }),
    )
    .option("--project <projectId>", "Validate the owning project for this phase")
    .action(async (phaseId: string, milestoneId: string, options: { project?: string }) => {
      const result = unwrap(
        await milestones.milestoneActivate({
          project: options.project,
          phase: phaseId,
          milestone: milestoneId,
        }),
      );
      console.log(`Activated milestone ${result.projectId}/${phaseId}/${milestoneId}`);
    });

  command
    .command("complete")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .option("--force <reason>", "Bypass reconciliation-required blockers with an explicit reason")
    .description("Complete a milestone")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa milestone complete <phaseId> <milestoneId>",
        description:
          "Complete a milestone. When discovered-load ratio exceeds policy threshold, completion requires a replan checkpoint marker.",
        examples: [
          {
            description: "Complete a milestone",
            command: "pa milestone complete phase-1 milestone-1-setup",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat: "Success message or governance diagnostics",
        },
        relatedCommands: [
          { command: "pa report", description: "View discovered-load ratio and warnings" },
          { command: "pa milestone activate", description: "Activate a milestone" },
        ],
      }),
    )
    .option("--project <projectId>", "Validate the owning project for this phase")
    .action(
      async (
        phaseId: string,
        milestoneId: string,
        options: { force?: string; project?: string },
      ) => {
        const result = unwrap(
          await milestones.milestoneComplete({
            project: options.project,
            phase: phaseId,
            milestone: milestoneId,
            forceReason: options.force,
          }),
        );

        for (const warning of result.warnings) {
          console.warn(`WARNING: ${warning}`);
        }

        if (result.overrideLogPath) {
          console.log(`Reconciliation override logged at ${result.overrideLogPath}`);
        }

        console.log(`Completed milestone ${result.projectId}/${phaseId}/${milestoneId}`);
      },
    );
}
