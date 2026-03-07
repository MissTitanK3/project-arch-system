import { Command } from "commander";
import { docs } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

export function registerDocsCommand(program: Command): void {
  program.command("docs").action(async () => {
    const refs = unwrap(await docs.docsList()).refs;
    for (const ref of refs) {
      console.log(ref);
    }
  });
}
