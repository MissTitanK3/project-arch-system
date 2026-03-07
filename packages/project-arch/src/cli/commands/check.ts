import { Command } from "commander";
import { check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

export function registerCheckCommand(program: Command): void {
  program.command("check").action(async () => {
    const result = unwrap(await check.checkRun());
    for (const warning of result.warnings) {
      console.warn(`WARNING: ${warning}`);
    }
    if (result.ok) {
      console.log("OK");
      return;
    }

    for (const error of result.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
  });
}
