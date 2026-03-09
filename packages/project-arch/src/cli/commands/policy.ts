import { Command } from "commander";
import { policy } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerPolicyCommand(program: Command): void {
  const command = program.command("policy").description("Policy conflict detection commands");

  command
    .command("check")
    .description("Detect task vs architecture policy conflicts (machine-readable)")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa policy check",
        description:
          "Run deterministic policy conflict detection between tasks, decisions, and architecture constraints.",
        examples: [
          { description: "Run policy conflict detection", command: "pa policy check" },
          {
            description: "Save machine-readable conflicts",
            command: "pa policy check > policy-conflicts.json",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Deterministic JSON: { ok, conflicts[] } where each conflict includes severity, confidence, claim pair, rationale, and remediation.",
        },
        relatedCommands: [
          { command: "pa policy explain", description: "Human-readable policy rationale" },
          { command: "pa check", description: "General repository validation" },
        ],
      }),
    )
    .action(async () => {
      const result = unwrap(await policy.policyCheck());
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });

  command
    .command("explain")
    .description("Explain policy conflicts with rationale and remediation")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa policy explain",
        description:
          "Render policy conflicts in a human-readable format with rationale and remediation guidance.",
        examples: [{ description: "Explain conflicts", command: "pa policy explain" }],
        agentMetadata: {
          outputFormat:
            "Human-readable conflict report including severity, confidence, claim pair, rationale, and remediation.",
        },
        relatedCommands: [
          { command: "pa policy check", description: "Machine-readable conflict records" },
          { command: "pa report", description: "Architecture report" },
        ],
      }),
    )
    .action(async () => {
      const result = unwrap(await policy.policyExplain());
      console.log(result.text);
      if (result.conflicts.length > 0) {
        process.exitCode = 1;
      }
    });
}
