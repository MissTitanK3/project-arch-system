import { Command } from "commander";
import { init } from "../../sdk";
import type { InitOptions } from "../../sdk/init";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

interface InitCommandOptions extends InitOptions {
  mono?: boolean;
}

function normalizeInitSurfaceOptions(
  options: InitCommandOptions,
  explicitTemplateProvided = false,
): InitOptions {
  const requestedTemplate =
    typeof options.template === "string" ? options.template.trim().toLowerCase() : undefined;
  const monoRequested = options.mono === true;
  const templateRequestedMono = requestedTemplate === "mono";

  if (monoRequested && explicitTemplateProvided && requestedTemplate && !templateRequestedMono) {
    throw new Error("--mono cannot be combined with --template unless template is 'mono'.");
  }

  const normalizedTemplate = monoRequested || templateRequestedMono ? "mono" : options.template;

  return {
    ...options,
    template: normalizedTemplate,
  };
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create base repository structure")
    .option("-m, --mono", "initialize using the approved mono scaffold surface", false)
    .option("--force", "overwrite managed files on re-init", false)
    .option("--template <name>", "template", "mono")
    .option("--pm <name>", "package manager", "pnpm")
    .option("--with-ai", "create ai/indexing directory", false)
    .option(
      "--with-workflows",
      "materialize first-pass workflow files in .project-arch/workflows/*.workflow.md (default: disabled; legacy .github/workflows/*.md is non-canonical)",
      false,
    )
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa init [options]",
        description: "Initialize a new project with architecture management structure.",
        options: [
          {
            flag: "-m, --mono",
            description:
              "Primary mono scaffold surface. Equivalent to --template mono (default: false)",
          },
          {
            flag: "--force",
            description:
              "Overwrite managed files on re-init (default: skip existing conflicting files)",
          },
          {
            flag: "--template <name>",
            description:
              "Project template (default: mono; 'nextjs-turbo' remains a compatibility alias)",
          },
          { flag: "--pm <name>", description: "Package manager (default: pnpm)" },
          { flag: "--with-ai", description: "Create AI/indexing directory (default: false)" },
          {
            flag: "--with-workflows",
            description:
              "Create first-pass workflow files in .project-arch/workflows/*.workflow.md (default: false; legacy .github/workflows/*.md is non-canonical)",
          },
        ],
        examples: [
          { description: "Initialize with defaults", command: "pa init" },
          {
            description: "Initialize using the primary mono surface",
            command: "pa init --mono",
          },
          {
            description: "Re-initialize and overwrite managed files",
            command: "pa init --force",
          },
          { description: "Initialize with AI features", command: "pa init --with-ai" },
          {
            description: "Initialize with first-pass workflow files",
            command: "pa init --with-workflows",
          },
        ],
        agentMetadata: {
          outputFormat: "Creates directory structure: roadmap/, architecture/, .project-arch/",
          fileLocation: "Creates files in project root",
        },
        relatedCommands: [
          { command: "pa phase new --help", description: "Create a phase" },
          { command: "pa help architecture", description: "Learn about repository structure" },
        ],
      }),
    )
    .action(async (options: InitCommandOptions, command: Command) => {
      const templateSource = command.getOptionValueSource("template");
      const normalizedOptions = normalizeInitSurfaceOptions(options, templateSource === "cli");
      unwrap(await init.initRun(normalizedOptions));
    });
}

export { normalizeInitSurfaceOptions };
