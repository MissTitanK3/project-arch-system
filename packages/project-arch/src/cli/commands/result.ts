import { Command } from "commander";
import { result } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function registerResultCommand(program: Command): void {
  const command = program
    .command("result")
    .description("Import and manage agent runtime result bundles");

  command
    .command("import")
    .argument("<path>")
    .description("Import a runtime-produced result bundle into the local runtime store")
    .option("--json", "Output machine-readable JSON")
    .action(async (bundlePath: string, options: { json?: boolean }) => {
      try {
        const imported = unwrap(await result.resultImport({ path: bundlePath }));

        if (options.json) {
          printJson(imported);
          return;
        }

        console.log(`Imported result bundle ${imported.runId} for task ${imported.taskId}`);
        console.log(`result: ${imported.resultPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ERROR: ${message}`);
        process.exitCode = 1;
      }
    });
}
