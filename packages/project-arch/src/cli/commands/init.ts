import { Command } from "commander";
import { init } from "../../sdk";
import type { InitOptions } from "../../sdk/init";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create base repository structure")
    .option("--template <name>", "template", "nextjs-turbo")
    .option("--apps <items>", "comma-separated apps", "web,docs")
    .option("--pm <name>", "package manager", "pnpm")
    .option("--with-ai", "create ai/indexing directory", false)
    .option("--with-docs-site", "create docs app (default: enabled)", true)
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa init [options]",
        description: "Initialize a new project with architecture management structure.",
        options: [
          { flag: "--template <name>", description: "Project template (default: nextjs-turbo)" },
          { flag: "--apps <items>", description: "Comma-separated app names (default: web,docs)" },
          { flag: "--pm <name>", description: "Package manager (default: pnpm)" },
          { flag: "--with-ai", description: "Create AI/indexing directory (default: false)" },
          { flag: "--with-docs-site", description: "Create docs app (default: true)" },
        ],
        examples: [
          { description: "Initialize with defaults", command: "pa init" },
          {
            description: "Initialize with custom apps",
            command: "pa init --apps web,admin,mobile",
          },
          { description: "Initialize with AI features", command: "pa init --with-ai" },
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
