import { Command } from "commander";
import { decisions } from "../../sdk";
import type { NewDecisionOptions } from "../../sdk/decisions";
import { unwrap } from "../../sdk/_utils";
import { scanLegacyDecisions, migrateAllLegacyDecisions } from "../../core/decisions/migrateLegacy";
import { formatEnhancedHelp } from "../help/format";

export function registerDecisionCommand(program: Command): void {
  const command = program.command("decision");

  command
    .command("new")
    .option("--scope <scope>", "project | phase | milestone", "project")
    .option("--phase <phaseId>")
    .option("--milestone <milestoneId>")
    .option("--slug <slug>", "decision")
    .option("--title <title>", "Decision")
    .description("Create a new architecture decision record")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa decision new [options]",
        description: "Create a new architecture decision record with the specified scope.",
        options: [
          {
            flag: "--scope <scope>",
            description: "Decision scope: project|phase|milestone (default: project)",
          },
          {
            flag: "--phase <phaseId>",
            description: "Phase ID (required if scope is phase or milestone)",
          },
          {
            flag: "--milestone <milestoneId>",
            description: "Milestone ID (required if scope is milestone)",
          },
          { flag: "--slug <slug>", description: "URL-friendly identifier (default: decision)" },
          { flag: "--title <title>", description: "Decision title (default: Decision)" },
        ],
        examples: [
          {
            description: "Create a project-wide decision",
            command: 'pa decision new --scope project --slug tech-stack --title "Technology Stack"',
          },
          {
            description: "Create a phase-specific decision",
            command: "pa decision new --scope phase --phase phase-1 --slug auth-approach",
          },
          {
            description: "Create a milestone-specific decision",
            command:
              "pa decision new --scope milestone --phase phase-1 --milestone m1 --slug api-design",
          },
        ],
        agentMetadata: {
          inputValidation: {
            scope: "project|phase|milestone",
            phaseId: "string matching /^phase-\\d+$/ (required for phase/milestone scope)",
            milestoneId: "string matching /^milestone-[\\w-]+$/ (required for milestone scope)",
          },
          outputFormat: "Decision file path",
          fileLocation: "roadmap/decisions/{scope}/{id}-{slug}.md",
          schemaReference: "packages/project-arch/src/schemas/decision.ts",
        },
        relatedCommands: [
          { command: "pa decision link --help", description: "Link decision to tasks/code" },
          { command: "pa decision status --help", description: "Update decision status" },
          { command: "pa help decisions", description: "Learn about decision management" },
        ],
      }),
    )
    .action(async (options: NewDecisionOptions) => {
      const created = unwrap(await decisions.decisionCreate(options)).path;
      console.log(created);
    });

  command
    .command("link")
    .argument("<decisionId>")
    .option("--task <taskRef>", "phase-id/milestone-id/task-id")
    .option("--code <codeTarget>")
    .option("--doc <publicDocPath>")
    .description("Link decision to tasks, code, or documentation")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa decision link <decisionId> [options]",
        description:
          "Link an architecture decision to related tasks, code files, or documentation.",
        options: [
          {
            flag: "--task <taskRef>",
            description: "Task reference: phase-id/milestone-id/task-id",
          },
          { flag: "--code <codeTarget>", description: "Code file path" },
          { flag: "--doc <publicDocPath>", description: "Documentation file path" },
        ],
        examples: [
          {
            description: "Link decision to a task",
            command: "pa decision link 001 --task phase-1/milestone-1-auth/001",
          },
          {
            description: "Link decision to code",
            command: "pa decision link 001 --code src/auth/index.ts",
          },
          {
            description: "Link multiple targets",
            command: "pa decision link 001 --task phase-1/m1/001 --code src/auth.ts",
          },
        ],
        agentMetadata: {
          inputValidation: {
            decisionId: "string matching /^\\d{3}$/",
            taskRef: "format: phase-id/milestone-id/task-id",
          },
          outputFormat: "Success message with decision ID",
        },
        relatedCommands: [
          { command: "pa decision new --help", description: "Create a decision" },
          { command: "pa help decisions", description: "Learn about decisions" },
        ],
      }),
    )
    .action(async (decisionId: string, options: { task?: string; code?: string; doc?: string }) => {
      unwrap(await decisions.decisionLink({ decisionId, ...options }));
      console.log(`Updated links for ${decisionId}`);
    });

  command
    .command("status")
    .argument("<decisionId>")
    .argument("<status>")
    .description("Update decision status")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa decision status <decisionId> <status>",
        description: "Update the status of an architecture decision.",
        examples: [
          { description: "Mark decision as accepted", command: "pa decision status 001 accepted" },
          { description: "Mark decision as rejected", command: "pa decision status 002 rejected" },
        ],
        agentMetadata: {
          inputValidation: {
            decisionId: "string matching /^\\d{3}$/",
            status: "proposed|accepted|rejected|superseded",
          },
          outputFormat: "Decision ID and new status",
        },
        relatedCommands: [
          { command: "pa decision supersede --help", description: "Supersede a decision" },
          { command: "pa decision list", description: "List all decisions" },
        ],
      }),
    )
    .action(async (decisionId: string, status: string) => {
      const nextStatus = unwrap(await decisions.decisionStatus({ decisionId, status })).status;
      console.log(`${decisionId} -> ${nextStatus}`);
    });

  command
    .command("supersede")
    .argument("<decisionId>")
    .argument("<supersededDecisionId>")
    .description("Mark one decision as superseding another")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa decision supersede <decisionId> <supersededDecisionId>",
        description: "Mark that one decision supersedes (replaces) another decision.",
        examples: [
          { description: "Decision 002 supersedes 001", command: "pa decision supersede 002 001" },
        ],
        agentMetadata: {
          inputValidation: {
            decisionId: "string matching /^\\d{3}$/",
            supersededDecisionId: "string matching /^\\d{3}$/",
          },
          outputFormat: "Success message showing supersession relationship",
        },
        relatedCommands: [
          { command: "pa decision status --help", description: "Update decision status" },
        ],
      }),
    )
    .action(async (decisionId: string, supersededDecisionId: string) => {
      unwrap(await decisions.decisionSupersede({ decisionId, supersededDecisionId }));
      console.log(`${decisionId} supersedes ${supersededDecisionId}`);
    });

  command
    .command("list")
    .description("List all architecture decisions")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa decision list",
        description: "List all architecture decisions with their IDs and statuses.",
        examples: [{ description: "List all decisions", command: "pa decision list" }],
        agentMetadata: {
          outputFormat: "One decision per line: <id> | <status>",
        },
        relatedCommands: [{ command: "pa decision new --help", description: "Create a decision" }],
      }),
    )
    .action(async () => {
      const all = unwrap(await decisions.decisionList());
      for (const decision of all) {
        console.log(`${decision.id} | ${decision.status}`);
      }
    });

  command
    .command("migrate")
    .description("Scan and migrate legacy decision files to current schema")
    .option("--scan-only", "Only scan for issues without migrating")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa decision migrate [--scan-only]",
        description:
          "Scan decision files for schema issues and optionally auto-migrate them to the current schema.",
        options: [
          { flag: "--scan-only", description: "Only scan for issues without modifying files" },
        ],
        examples: [
          { description: "Scan for legacy decisions", command: "pa decision migrate --scan-only" },
          { description: "Migrate all legacy decisions", command: "pa decision migrate" },
        ],
        agentMetadata: {
          outputFormat: "Migration report with counts of valid/invalid/migrated/failed decisions",
        },
        commonIssues: [
          {
            issue: "Missing fields",
            solution: "Migration adds default values - review and update placeholders",
          },
        ],
        relatedCommands: [
          { command: "pa decision list", description: "List all decisions" },
          { command: "pa check", description: "Validate architecture consistency" },
        ],
      }),
    )
    .action(async (options: { scanOnly?: boolean }) => {
      console.log("Scanning decision files...\n");

      const scan = await scanLegacyDecisions();

      console.log(`Total decisions: ${scan.total}`);
      console.log(`Valid: ${scan.valid}`);
      console.log(`Invalid: ${scan.invalid}\n`);

      if (scan.invalid === 0) {
        console.log("✓ All decision files are valid!");
        return;
      }

      // Show issues
      for (const issue of scan.issues) {
        console.log(`✗ ${issue.relativePath}`);
        if (issue.missingFields.length > 0) {
          console.log(`  Missing fields: ${issue.missingFields.join(", ")}`);
        }
        console.log();
      }

      if (options.scanOnly) {
        console.log("Run without --scan-only to auto-migrate these files.");
        return;
      }

      // Perform migration
      console.log("Migrating invalid decisions...\n");
      const result = await migrateAllLegacyDecisions();

      console.log(`✓ Migrated: ${result.migrated}`);
      console.log(`✗ Failed: ${result.failed}`);

      if (result.errors.length > 0) {
        console.log("\nErrors:");
        for (const error of result.errors) {
          console.log(`  ${error.file}: ${error.error}`);
        }
      }

      if (result.migrated > 0) {
        console.log(
          "\n✓ Migration complete! Review the migrated files and fill in placeholder content.",
        );
      }
    });
}
