import { Command } from "commander";
import { policy } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";

export function registerPolicyCommand(program: Command): void {
  const command = program.command("policy").description("Policy conflict detection commands");

  command
    .command("resolved")
    .description("Print the effective resolved policy profile")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa policy resolved",
        description:
          "Print effective policy settings after file loading, profile selection, and PA_POLICY_PROFILE override.",
        examples: [
          { description: "Print effective policy profile", command: "pa policy resolved" },
          {
            description: "Inspect a specific profile via env override",
            command: "PA_POLICY_PROFILE=strict pa policy resolved",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Deterministic JSON with selected profile metadata, source, env override, and normalized timing policy.",
        },
        relatedCommands: [
          { command: "pa policy setup", description: "Create roadmap/policy.json if missing" },
          { command: "pa policy check", description: "Run policy conflict detection" },
        ],
      }),
    )
    .action(async () => {
      const result = unwrap(await policy.policyResolved());
      console.log(JSON.stringify(result, null, 2));
    });

  command
    .command("setup")
    .description("Create roadmap/policy.json for already initialized projects")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa policy setup",
        description:
          "Create default roadmap/policy.json when missing. Safe to run repeatedly; existing files are left unchanged.",
        examples: [{ description: "Scaffold policy config", command: "pa policy setup" }],
        agentMetadata: {
          outputFormat: "JSON: { created: boolean, policyPath: string }",
        },
        relatedCommands: [
          { command: "pa policy resolved", description: "Inspect effective policy settings" },
          { command: "pa init", description: "Initialize full roadmap structure" },
        ],
      }),
    )
    .action(async () => {
      const result = unwrap(await policy.policySetup());
      console.log(JSON.stringify(result, null, 2));
    });

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
