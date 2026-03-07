import { Command } from "commander";
import { init } from "../../sdk";
import type { InitOptions } from "../../sdk/init";
import { unwrap } from "../../sdk/_utils";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create base repository structure")
    .option("--template <name>", "template", "nextjs-turbo")
    .option("--apps <items>", "comma-separated apps", "web,docs")
    .option("--pm <name>", "package manager", "pnpm")
    .option("--with-ai", "create ai/indexing directory", false)
    .option("--with-docs-site", "create docs app (default: enabled)", true)
    .action(async (options: InitOptions) => {
      unwrap(await init.initRun(options));
    });
}
