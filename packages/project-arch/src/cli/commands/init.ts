import { Command } from "commander";
import { init } from "../../sdk";
import type { InitOptions } from "../../sdk/init";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create base repository structure")
    .option("--force", "overwrite managed files on re-init", false)
    .option("--template <name>", "template", "nextjs-turbo")
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
            flag: "--force",
            description:
              "Overwrite managed files on re-init (default: skip existing conflicting files)",
          },
          { flag: "--template <name>", description: "Project template (default: nextjs-turbo)" },
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
          outputFormat:
            "Creates directory structure: roadmap/, architecture/, arch-domains/, arch-model/",
          fileLocation: "Creates files in project root",
        },
        relatedCommands: [
          { command: "pa phase new --help", description: "Create a phase" },
          { command: "pa help architecture", description: "Learn about repository structure" },
        ],
      }),
    )
    .action(async (options: InitOptions) => {
      unwrap(await init.initRun(options));
    });
}
