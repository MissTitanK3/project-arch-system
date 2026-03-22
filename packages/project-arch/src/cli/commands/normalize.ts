import { Command } from "commander";
import { formatEnhancedHelp } from "../help/format";
import { normalizeFrontmatter } from "../../core/validation/frontmatterRepair";
import { renderRepairResult } from "./_repair";

export function registerNormalizeCommand(program: Command): void {
  program
    .command("normalize")
    .description("Validate and rewrite frontmatter into canonical form")
    .option("--yes", "Write changes instead of showing a dry-run diff")
    .option("--check", "Exit non-zero if changes would be made or manual intervention is needed")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa normalize [options]",
        description:
          "Validates task and decision frontmatter, applies safe mechanical fixes in-memory, then rewrites valid files into canonical frontmatter order. By default this is a dry-run that prints a diff preview.",
        options: [
          { flag: "--yes", description: "Apply normalization instead of previewing it" },
          {
            flag: "--check",
            description:
              "Exit with code 1 if any file would change or still requires manual intervention",
          },
        ],
        examples: [
          { description: "Preview canonical normalization", command: "pa normalize" },
          { description: "Apply canonical normalization", command: "pa normalize --yes" },
          { description: "CI mode", command: "pa normalize --check" },
        ],
        agentMetadata: {
          outputFormat:
            "Dry-run line diff by default, or applied-file summary with manual intervention guidance.",
        },
        relatedCommands: [
          { command: "pa fix frontmatter", description: "Apply only safe mechanical fixes" },
          { command: "pa lint frontmatter", description: "Inspect diagnostics first" },
        ],
      }),
    )
    .action(async (options: { yes?: boolean; check?: boolean }) => {
      const result = await normalizeFrontmatter({ write: options.yes === true });
      renderRepairResult(result, {
        apply: options.yes === true,
        check: options.check === true,
        commandLabel: "pa normalize",
      });
    });
}
