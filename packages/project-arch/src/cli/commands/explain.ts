import { Command } from "commander";
import { formatEnhancedHelp } from "../help/format";
import {
  getDiagnosticExplanation,
  KNOWN_DIAGNOSTIC_CODES,
} from "../../core/diagnostics/explanations";

export function registerExplainCommand(program: Command): void {
  program
    .command("explain")
    .description("Print a detailed explanation and remediation hint for a diagnostic code")
    .argument("<code>", "Diagnostic code (e.g. MALFORMED_TASK_FILE, TAB_INDENTATION)")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa explain <code>",
        description:
          "Looks up any diagnostic code emitted by pa check or pa lint frontmatter and " +
          "prints a human-readable description and step-by-step remediation guidance.",
        examples: [
          {
            description: "Explain a task file parse failure",
            command: "pa explain MALFORMED_TASK_FILE",
          },
          {
            description: "Explain an untracked implementation warning",
            command: "pa explain UNTRACKED_IMPLEMENTATION",
          },
          {
            description: "Explain a frontmatter tab indentation error",
            command: "pa explain TAB_INDENTATION",
          },
          {
            description: "Explain a missing code target error",
            command: "pa explain MISSING_TASK_CODE_TARGET",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Human-readable description and remediation steps for the given diagnostic code. " +
            "Exits with code 1 if the code is unknown.",
        },
        relatedCommands: [
          { command: "pa check --json", description: "Machine-readable diagnostics with codes" },
          { command: "pa lint frontmatter", description: "Frontmatter lint with diagnostic codes" },
          { command: "pa doctor", description: "Full validation health sweep" },
        ],
      }),
    )
    .action((code: string) => {
      const explanation = getDiagnosticExplanation(code);

      if (!explanation) {
        console.error(`Unknown diagnostic code: ${code.toUpperCase()}`);
        console.error("");
        console.error("Known codes:");
        for (const known of KNOWN_DIAGNOSTIC_CODES) {
          console.error(`  ${known}`);
        }
        console.error("");
        console.error(
          "If you encountered a code not listed above, it may be from a drift check " +
            "or a custom validator. Check `pa check --json` output for context.",
        );
        process.exitCode = 1;
        return;
      }

      const header = `[${code.toUpperCase()}]`;
      console.log(header);
      console.log("=".repeat(header.length));
      console.log("");
      console.log("Description:");
      console.log(`  ${explanation.description.replace(/\n/g, "\n  ")}`);
      console.log("");
      console.log("Remediation:");
      console.log(`  ${explanation.remediation.replace(/\n/g, "\n  ")}`);
    });
}
