import { Command } from "commander";
import { formatEnhancedHelp } from "../help/format";
import { repairFrontmatter } from "../../core/validation/frontmatterRepair";
import { renderRepairResult } from "./_repair";

export function registerFixCommand(program: Command): void {
  const command = program.command("fix").description("Apply safe repair workflows");

  command
    .command("frontmatter")
    .description("Apply safe frontmatter repairs with dry-run diff by default")
    .option("--yes", "Write changes instead of showing a dry-run diff")
    .option("--check", "Exit non-zero if changes would be made or manual intervention is needed")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa fix frontmatter [options]",
        description:
          "Applies mechanically safe repairs to task and decision frontmatter: tab-to-space indentation, trailing whitespace removal, and quoting risky plain scalars. By default this is a dry-run that prints a diff preview.",
        options: [
          { flag: "--yes", description: "Apply the repairs instead of previewing them" },
          {
            flag: "--check",
            description:
              "Exit with code 1 if changes would be made or manual steps are still required",
          },
        ],
        examples: [
          { description: "Preview frontmatter fixes", command: "pa fix frontmatter" },
          { description: "Apply frontmatter fixes", command: "pa fix frontmatter --yes" },
          {
            description: "CI mode: fail if any file would change",
            command: "pa fix frontmatter --check",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Dry-run line diff by default, or applied-file summary with manual intervention guidance.",
        },
        relatedCommands: [
          { command: "pa lint frontmatter", description: "See frontmatter diagnostics first" },
          { command: "pa normalize", description: "Rewrite frontmatter into canonical order" },
          { command: "pa explain <code>", description: "Explain any diagnostic code" },
        ],
      }),
    )
    .action(async (options: { yes?: boolean; check?: boolean }) => {
      const result = await repairFrontmatter({ write: options.yes === true });
      renderRepairResult(result, {
        apply: options.yes === true,
        check: options.check === true,
        commandLabel: "pa fix frontmatter",
      });
    });
}
