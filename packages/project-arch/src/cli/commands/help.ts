import { Command } from "commander";
import { getHelpTopic, listTopics } from "../help/topics";

export function registerHelpCommand(program: Command): void {
  const command = program.command("help");

  command
    .description("Get detailed help on specific topics")
    .argument(
      "[topic]",
      "help topic (commands, workflows, lanes, decisions, architecture, standards)",
    )
    .action((topic?: string) => {
      if (!topic) {
        // Show list of topics
        console.log(listTopics());
        return;
      }

      if (topic === "topics") {
        console.log(listTopics());
        return;
      }

      const content = getHelpTopic(topic);
      if (!content) {
        console.error(`Unknown help topic: ${topic}`);
        console.error("");
        console.log(listTopics());
        process.exitCode = 1;
        return;
      }

      console.log(content);
    });
}
