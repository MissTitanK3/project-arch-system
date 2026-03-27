import { Command } from "commander";
import { learn } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";
import { sanitizeTerminalText } from "../../utils/outputSafety";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseCsvOrRepeatable(value: string, previous: string[]): string[] {
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...previous, ...items];
}

export function registerLearnCommand(program: Command): void {
  program
    .command("learn")
    .description("Interpret path-scoped drift and suggest governed follow-up work")
    .requiredOption(
      "--path <path>",
      "Analyze one or more repository paths (repeatable or comma-separated)",
      parseCsvOrRepeatable,
      [],
    )
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa learn --path <path> [--path <path>] [--json]",
        description:
          "Analyze one or more explicit repository paths, explain relevant drift in context, and suggest governed next steps without mutating the repository.",
        examples: [
          { description: "Analyze one app surface", command: "pa learn --path apps/web" },
          {
            description: "Compare multiple paths in one report",
            command: "pa learn --path apps/web --path packages/ui",
          },
          {
            description: "Inspect one documentation file as JSON",
            command: "pa learn --path architecture/product-framing/project-overview.md --json",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Human-readable path-scoped report or JSON with findings, summary counts, and suggested commands.",
        },
        relatedCommands: [
          { command: "pa context --json", description: "Resolve active repository context" },
          { command: "pa check --json", description: "Run repository-wide validation" },
          { command: "pa report --json", description: "Summarize repository state" },
        ],
      }),
    )
    .action(async (options: { path: string[]; json?: boolean }) => {
      const result = unwrap(await learn.learnPath({ paths: options.path }));

      if (options.json) {
        printJson(result.report);
        return;
      }

      console.log(sanitizeTerminalText(result.text, { allowNewlines: true, allowTabs: true }));
    });
}
