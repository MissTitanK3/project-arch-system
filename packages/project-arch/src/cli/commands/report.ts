import { Command } from "commander";
import { report } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

export function registerReportCommand(program: Command): void {
  program.command("report").action(async () => {
    console.log(unwrap(await report.reportGenerate()).text);
  });
}
