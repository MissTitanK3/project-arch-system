import { Command } from "commander";
import { projects } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { projectTypeSchema } from "../../schemas/project";
import { assertSafeId } from "../../utils/safeId";
import { formatEnhancedHelp } from "../help/format";

export function registerProjectCommand(program: Command): void {
  const command = program.command("project");

  command
    .command("new")
    .argument("<projectId>", "project id")
    .option("--title <title>", "Project title")
    .option(
      "--type <type>",
      `Project type (${projectTypeSchema.options.join(", ")})`,
      "application",
    )
    .option("--summary <summary>", "Project summary")
    .option("--owned-path <path...>", "Owned source path(s)")
    .option("--shared-dependency <path...>", "Shared dependency path(s)")
    .option("--tag <tag...>", "Project tag(s)")
    .description("Create a new roadmap project")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage:
          "pa project new <projectId> [--title <title>] [--type <type>] [--summary <summary>]",
        description:
          "Scaffold a named roadmap project under roadmap/projects with a manifest, overview, and phases directory.",
        options: [
          { flag: "--title <title>", description: "Override the default humanized project title" },
          {
            flag: "--type <type>",
            description: `Project type: ${projectTypeSchema.options.join(", ")}`,
          },
          {
            flag: "--owned-path <path...>",
            description: "One or more owned paths. Defaults to apps/<projectId>",
          },
          {
            flag: "--shared-dependency <path...>",
            description: "One or more shared dependency paths",
          },
          { flag: "--tag <tag...>", description: "Optional project tags" },
        ],
        examples: [
          { description: "Create a default project", command: "pa project new storefront" },
          {
            description: "Create a service project with explicit ownership",
            command:
              "pa project new billing --type service --owned-path services/billing --shared-dependency packages/config",
          },
        ],
        agentMetadata: {
          inputValidation: {
            projectId: "string matching /^[a-z0-9]+(?:-[a-z0-9]+)*$/",
            type: `one of ${projectTypeSchema.options.join(", ")}`,
          },
          outputFormat: "Success message with project id",
          fileLocation: "roadmap/projects/{project}/manifest.json",
        },
        relatedCommands: [
          { command: "pa phase new --help", description: "Create a phase inside a project" },
          { command: "pa context", description: "Inspect current roadmap context" },
        ],
      }),
    )
    .action(
      async (
        projectId: string,
        options: {
          title?: string;
          type: string;
          summary?: string;
          ownedPath?: string[];
          sharedDependency?: string[];
          tag?: string[];
        },
      ) => {
        try {
          assertSafeId(projectId, "projectId");
          projectTypeSchema.parse(options.type);
        } catch (error) {
          console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
          console.error(
            `Hint: project ids must be lowercase alphanumeric with single hyphens, and type must be one of ${projectTypeSchema.options.join(", ")}`,
          );
          process.exitCode = 1;
          return;
        }

        const result = unwrap(
          await projects.projectCreate({
            id: projectId,
            title: options.title,
            type: options.type as (typeof projectTypeSchema.options)[number],
            summary: options.summary,
            ownedPaths: options.ownedPath,
            sharedDependencies: options.sharedDependency,
            tags: options.tag,
          }),
        );
        console.log(`Created project ${result.id}`);
      },
    );
}
