import path from "path";
import { Command } from "commander";
import { runReconcile } from "../../core/reconciliation/runReconcile";
import { formatEnhancedHelp } from "../help/format";

export function registerReconcileCommand(program: Command): void {
  const command = program.command("reconcile").description("Run reconciliation workflows");

  command
    .command("task")
    .argument("<taskId>", "Three-digit task ID (e.g. 001) or full slug (e.g. 001-my-task)")
    .option(
      "--files <paths>",
      "Comma-separated additional changed file paths to include in analysis",
    )
    .description("Run a post-implementation reconciliation pass for a specific task")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa reconcile task <taskId> [options]",
        description:
          "Inspects a completed task's code targets, trace links, and architecture areas. " +
          "Determines reconciliation status based on RFC trigger criteria and writes JSON and Markdown reports to .project-arch/reconcile/.",
        options: [
          {
            flag: "--files <paths>",
            description: "Comma-separated additional changed file paths to include in analysis",
          },
        ],
        examples: [
          {
            description: "Reconcile task 001",
            command: "pa reconcile task 001",
          },
          {
            description: "Reconcile task 008 with additional changed files",
            command:
              "pa reconcile task 008 --files arch-model/modules.json,architecture/workflows/export.md",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Summary lines: status, affected areas count, missing updates count, decision candidates count. " +
            "Report files written to .project-arch/reconcile/<taskId>-<date>.{json,md}",
          schemaReference: "packages/project-arch/src/schemas/reconciliationReport.ts",
        },
        relatedCommands: [
          { command: "pa check", description: "Validate architecture consistency" },
          { command: "pa report", description: "Generate architecture report" },
        ],
      }),
    )
    .action(async (taskId: string, options: { files?: string }) => {
      const additionalChangedFiles = options.files
        ? options.files
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean)
        : [];

      const { report, jsonPath, markdownPath } = await runReconcile({
        taskId,
        additionalChangedFiles,
      });

      const cwd = process.cwd();
      const relJson = path.relative(cwd, jsonPath);
      const relMd = path.relative(cwd, markdownPath);

      console.log(`status:             ${report.status}`);
      console.log(`affected areas:     ${report.affectedAreas.length}`);
      console.log(`missing updates:    ${report.missingUpdates.length}`);
      console.log(`decision candidates:${report.decisionCandidates.length}`);
      console.log(`json report:        ${relJson}`);
      console.log(`markdown report:    ${relMd}`);

      if (report.status === "reconciliation required") {
        process.exitCode = 1;
      }
    });
}
