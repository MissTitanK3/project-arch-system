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
    .option("--project <projectId>", "Target project id", "shared")
    .description("Create a new phase")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa phase new <id> [--project <projectId>]",
        description: "Create a new phase in a named roadmap project.",
        examples: [
          { description: "Create a shared phase", command: "pa phase new phase-1" },
          {
            description: "Create a storefront phase",
            command: "pa phase new phase-2 --project storefront",
          },
        ],
        agentMetadata: {
          inputValidation: {
            id: "string matching /^phase-\\d+$/",
            projectId: "string matching /^[a-z0-9]+(?:-[a-z0-9]+)*$/",
          },
          outputFormat: "Success message with project and phase ID",
          fileLocation: "roadmap/projects/{project}/phases/{id}/overview.md",
        },
        relatedCommands: [
          { command: "pa milestone new --help", description: "Create a milestone" },
          { command: "pa phase list", description: "List all phases" },
        ],
      }),
    )
    .action(async (id: string, options: { project: string }) => {
      try {
        assertSafeId(id, "phaseId");
        assertSafeId(options.project, "projectId");
      } catch (error) {
        console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
        console.error(
          "Hint: phase and project ids must be lowercase alphanumeric with single hyphens, e.g. phase-1 storefront",
        );
        process.exitCode = 1;
        return;
      }
      const result = unwrap(await phases.phaseCreate({ id, project: options.project }));
      console.log(`Created phase ${result.projectId}/${result.id}`);
    });

  command
    .command("list")
    .option("--project <projectId>", "Filter phases by project id")
    .description("List all phases")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa phase list [--project <projectId>]",
        description:
          "List all phases in the roadmap. Active phase is marked with * and each phase is labeled with its owning project.",
        examples: [
          { description: "List all phases", command: "pa phase list" },
          {
            description: "List phases in one project",
            command: "pa phase list --project storefront",
          },
        ],
        agentMetadata: {
          outputFormat: "One phase per line as project/phase, active phase prefixed with *",
        },
        relatedCommands: [
          { command: "pa phase new --help", description: "Create a phase" },
          { command: "pa milestone list", description: "List all milestones" },
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
      const all = unwrap(await phases.phaseList({ project: options.project }));
      for (const phase of all) {
        const activeMark = phase.active ? "*" : " ";
        console.log(`${activeMark} ${phase.projectId}/${phase.id}`);
      }
    });
}
