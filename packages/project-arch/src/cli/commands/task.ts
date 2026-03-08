import path from "path";
import { Command } from "commander";
import { tasks } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { getLaneRangesTable } from "../../core/ids/task";
import { getLaneUsage } from "../../core/tasks/laneUsage";
import { formatEnhancedHelp } from "../help/format";

const LANE_HELP = `

${getLaneRangesTable()}
`;

export function registerTaskCommand(program: Command): void {
  const command = program.command("task");

  command
    .command("new")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .description(`Create a new planned task\n${LANE_HELP}`)
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa task new <phaseId> <milestoneId>",
        description: "Create a new planned task in the 001-099 range.",
        examples: [
          {
            description: "Create a planned task",
            command: "pa task new phase-1 milestone-1-setup",
          },
          {
            description: "Create multiple tasks for a sprint",
            command: "pa task new phase-1 m1  # Creates 001\npa task new phase-1 m1  # Creates 002",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat: "Relative path to created task file",
          fileLocation:
            "roadmap/phases/{phase}/milestones/{milestone}/tasks/planned/{id}-{slug}.md",
          schemaReference: "packages/project-arch/src/schemas/task.ts",
        },
        commonIssues: [
          { issue: "Milestone does not exist", solution: "Run 'pa milestone new' first" },
          { issue: "Task already exists", solution: "Check existing tasks with 'pa task lanes'" },
        ],
        relatedCommands: [
          { command: "pa task discover --help", description: "Create discovered task" },
          { command: "pa task lanes", description: "Show lane usage" },
          { command: "pa help lanes", description: "Learn about task lanes" },
        ],
      }),
    )
    .action(async (phaseId: string, milestoneId: string) => {
      const result = await tasks.taskCreate({ phase: phaseId, milestone: milestoneId });
      const created = unwrap(result).path;
      console.log(path.relative(process.cwd(), created));
    });

  command
    .command("discover")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .requiredOption("--from <taskId>", "source task id")
    .description(`Create a discovered task\n${LANE_HELP}`)
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa task discover <phaseId> <milestoneId> --from <taskId>",
        description:
          "Create a discovered task linked to an existing planned task. Discovered tasks are in the 101-199 range.",
        options: [
          {
            flag: "--from <taskId>",
            description: "Source task ID (required, format: 3-digit number)",
          },
        ],
        examples: [
          {
            description: "Discover a task from planned task 001",
            command: "pa task discover phase-1 milestone-1-setup --from 001",
          },
          {
            description: "Typical workflow",
            command:
              "pa task new phase-1 m1           # Creates 001\npa task discover phase-1 m1 --from 001  # Creates 101",
          },
        ],
        extraSections: [
          {
            title: "Task Lanes",
            content:
              "  Planned     001-099   Upfront defined tasks\n  Discovered  101-199   Found during work on planned tasks\n  Backlog     901-999   Ideas for future consideration",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
            taskId: "string matching /^\\d{3}$/",
          },
          outputFormat: "Relative path to created task file",
          fileLocation:
            "roadmap/phases/{phase}/milestones/{milestone}/tasks/discovered/{id}-{slug}.md",
          schemaReference:
            "packages/project-arch/src/schemas/task.ts (discoveredFromTask field required)",
        },
        commonIssues: [
          { issue: "Milestone does not exist", solution: "Run 'pa milestone new' first" },
          { issue: "--from must be a 3-digit task id", solution: "Use format: 001, not 1" },
          {
            issue: "Task already exists",
            solution: "Choose a different milestone or check existing tasks",
          },
        ],
        relatedCommands: [
          { command: "pa task new --help", description: "Create a planned task" },
          { command: "pa task lanes", description: "Show lane usage for a milestone" },
          { command: "pa help workflows", description: "Task creation workflows" },
        ],
      }),
    )
    .action(async (phaseId: string, milestoneId: string, options: { from: string }) => {
      if (!/^\d{3}$/.test(options.from)) {
        console.error("ERROR: --from must be a 3-digit task id (e.g., 001)");
        console.error("Hint: Try 'pa task discover --help' for usage information");
        process.exitCode = 1;
        return;
      }
      const result = await tasks.taskDiscover({
        phase: phaseId,
        milestone: milestoneId,
        from: options.from,
      });
      const created = unwrap(result).path;
      console.log(path.relative(process.cwd(), created));
    });

  command
    .command("idea")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .description(`Create a backlog idea\n${LANE_HELP}`)
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa task idea <phaseId> <milestoneId>",
        description: "Create a backlog idea in the 901-999 range for future work.",
        examples: [
          {
            description: "Capture a future idea",
            command: "pa task idea phase-1 milestone-1-setup",
          },
          {
            description: "Document technical debt",
            command: "pa task idea phase-1 m1  # For refactoring ideas",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat: "Relative path to created task file",
          fileLocation:
            "roadmap/phases/{phase}/milestones/{milestone}/tasks/backlog/{id}-{slug}.md",
        },
        relatedCommands: [
          { command: "pa task new --help", description: "Create a planned task" },
          { command: "pa help lanes", description: "Learn about task lanes" },
        ],
      }),
    )
    .action(async (phaseId: string, milestoneId: string) => {
      const result = await tasks.taskIdea({ phase: phaseId, milestone: milestoneId });
      const created = unwrap(result).path;
      console.log(path.relative(process.cwd(), created));
    });

  command
    .command("status")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .argument("<taskId>")
    .description("Get current status of a task")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa task status <phaseId> <milestoneId> <taskId>",
        description: "Get the current status of a task.",
        examples: [
          {
            description: "Check task status",
            command: "pa task status phase-1 milestone-1-setup 001",
          },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
            taskId: "string matching /^\\d{3}$/",
          },
          outputFormat: "Status string (todo|in-progress|blocked|done)",
        },
        relatedCommands: [{ command: "pa task lanes", description: "Show lane usage" }],
      }),
    )
    .action(async (phaseId: string, milestoneId: string, taskId: string) => {
      const status = unwrap(
        await tasks.taskStatus({ phase: phaseId, milestone: milestoneId, taskId }),
      ).status;
      console.log(status);
    });

  command
    .command("lanes")
    .argument("<phaseId>")
    .argument("<milestoneId>")
    .description("Show task lane usage and next available IDs")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa task lanes <phaseId> <milestoneId>",
        description: "Show task lane usage, used IDs, and next available IDs for a milestone.",
        examples: [
          { description: "Check lane usage", command: "pa task lanes phase-1 milestone-1-setup" },
        ],
        agentMetadata: {
          inputValidation: {
            phaseId: "string matching /^phase-\\d+$/",
            milestoneId: "string matching /^milestone-[\\w-]+$/",
          },
          outputFormat: "Table with lane name, range, used count, used IDs, and next available ID",
        },
        relatedCommands: [
          { command: "pa task new --help", description: "Create a planned task" },
          { command: "pa help lanes", description: "Learn about task lanes" },
        ],
      }),
    )
    .action(async (phaseId: string, milestoneId: string) => {
      const usages = await getLaneUsage(phaseId, milestoneId);

      console.log(`\nTask Lane Usage for ${phaseId}/${milestoneId}\n`);

      for (const usage of usages) {
        console.log(`${usage.lane.padEnd(12)} ${usage.range}`);
        console.log(`  Used: ${usage.used}/${usage.total}`);

        if (usage.usedIds.length > 0) {
          const idsDisplay = usage.usedIds.join(", ");
          console.log(`  IDs: ${idsDisplay}`);
        } else {
          console.log(`  IDs: (none)`);
        }

        if (usage.nextAvailableId) {
          console.log(`  Next: ${usage.nextAvailableId}`);
        } else {
          console.log(`  Next: (none available)`);
        }
        console.log();
      }
    });
}
