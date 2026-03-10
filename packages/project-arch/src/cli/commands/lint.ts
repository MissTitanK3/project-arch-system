import { Command } from "commander";
import { lint } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerLintCommand(program: Command): void {
  const command = program.command("lint").description("Lint architecture artifacts");

  command
    .command("frontmatter")
    .description("Lint YAML frontmatter in task and decision markdown files")
    .option("--fix", "Apply safe whitespace-only fixes")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa lint frontmatter [options]",
        description:
          "Validate frontmatter shape and safety before runtime command failures. Reports file and line for each issue.",
        options: [
          {
            flag: "--fix",
            description:
              "Normalize indentation tabs to spaces when safe. Does not rewrite scalar values.",
          },
        ],
        examples: [
          { description: "Run frontmatter lint", command: "pa lint frontmatter" },
          {
            description: "Apply safe whitespace normalization",
            command: "pa lint frontmatter --fix",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Line-based diagnostics: <severity> <path>:<line> [code] message. Exit code 1 on lint errors.",
        },
        relatedCommands: [
          { command: "pa check", description: "Run repository validation" },
          { command: "pa report", description: "Generate architecture report" },
        ],
      }),
    )
    .action(async (options: { fix?: boolean }) => {
      const result = unwrap(await lint.lintFrontmatterRun({ fix: options.fix }));

      for (const diagnostic of result.diagnostics) {
        const prefix = diagnostic.severity === "error" ? "ERROR" : "WARNING";
        const output = `${prefix}: ${diagnostic.path}:${diagnostic.line} [${diagnostic.code}] ${diagnostic.message}`;
        if (diagnostic.severity === "error") {
          console.error(output);
        } else {
          console.warn(output);
        }
      }

      if (result.diagnostics.length === 0) {
        if (result.fixedFiles > 0) {
          console.log(`OK (${result.scannedFiles} files scanned, ${result.fixedFiles} fixed)`);
        } else {
          console.log("OK");
        }
        return;
      }

      if (result.fixedFiles > 0) {
        console.log(`Fixed ${result.fixedFiles} file(s).`);
      }

      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
