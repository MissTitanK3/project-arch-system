import path from "path";
import { Command } from "commander";
import { agents } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function registerAgentsCommand(program: Command): void {
  const command = program.command("agents").description("Manage agent skills and registry");

  command
    .command("list")
    .description("List resolved agent skills")
    .option("--json", "Output machine-readable JSON")
    .action(async (options: { json?: boolean }) => {
      const result = unwrap(await agents.agentsList());

      if (options.json) {
        printJson({ schemaVersion: "2.0", skills: result.skills });
        return;
      }

      if (result.skills.length === 0) {
        console.log("No skills found.");
        return;
      }

      for (const skill of result.skills) {
        console.log(`${skill.id} (${skill.source}) - ${skill.summary}`);
      }
    });

  command
    .command("show")
    .argument("<id>")
    .description("Show details for one skill")
    .option("--json", "Output machine-readable JSON")
    .action(async (id: string, options: { json?: boolean }) => {
      try {
        const result = unwrap(await agents.agentsShow({ id }));
        if (options.json) {
          printJson({ schemaVersion: "2.0", skill: result.skill });
          return;
        }

        console.log(`${result.skill.id} (${result.skill.source})`);
        console.log(`name: ${result.skill.name}`);
        console.log(`version: ${result.skill.version}`);
        console.log(`summary: ${result.skill.summary}`);
        console.log(`directory: ${result.skill.directory}`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ERROR: ${message}`);
        process.exitCode = 1;
      }
    });

  command
    .command("new")
    .argument("<id>")
    .description("Scaffold a new user skill")
    .option("--title <title>", "Optional display name")
    .option("--summary <summary>", "Optional summary")
    .option("--override", "Mark skill as override for a builtin skill", false)
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output machine-readable JSON")
    .action(
      async (
        id: string,
        options: {
          title?: string;
          summary?: string;
          override?: boolean;
          tags?: string;
          json?: boolean;
        },
      ) => {
        const tags = (options.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);

        try {
          const created = unwrap(
            await agents.agentsNew({
              id,
              title: options.title,
              summary: options.summary,
              overrides: options.override,
              tags,
            }),
          );

          const payload = {
            skillDir: path.relative(process.cwd(), created.skillDir).replace(/\\/g, "/"),
            manifestPath: path.relative(process.cwd(), created.manifestPath).replace(/\\/g, "/"),
            systemPath: path.relative(process.cwd(), created.systemPath).replace(/\\/g, "/"),
            checklistPath: path.relative(process.cwd(), created.checklistPath).replace(/\\/g, "/"),
          };

          if (options.json) {
            printJson({ schemaVersion: "2.0", ...payload });
            return;
          }

          console.log(payload.skillDir);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`ERROR: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  command
    .command("sync")
    .description("Sync derived skills registry")
    .option("--check", "Check whether registry is stale without writing", false)
    .option("--json", "Output machine-readable JSON")
    .action(async (options: { check?: boolean; json?: boolean }) => {
      const result = unwrap(await agents.agentsSync({ check: options.check }));
      const payload = {
        stale: result.stale,
        changed: result.changed,
        skillCount: result.skillCount,
        registryPath: path.relative(process.cwd(), result.registryPath).replace(/\\/g, "/"),
      };

      if (options.json) {
        printJson({ schemaVersion: "2.0", ...payload });
      } else if (options.check) {
        console.log(result.stale ? "STALE" : "OK");
      } else {
        console.log(payload.registryPath);
      }

      if (options.check && result.stale) {
        process.exitCode = 1;
      }
    });

  command
    .command("check")
    .description("Run focused linter for agent skills")
    .option("--json", "Output machine-readable JSON")
    .action(async (options: { json?: boolean }) => {
      try {
        const result = unwrap(await agents.agentsCheck());
        const payload = {
          schemaVersion: "2.0",
          status: result.ok ? "valid" : "invalid",
          summary: {
            errorCount: result.errors.length,
            warningCount: result.warnings.length,
            diagnosticCount: result.diagnostics.length,
          },
          diagnostics: result.diagnostics,
        };

        if (options.json) {
          printJson(payload);
        } else if (result.ok) {
          console.log("OK");
        } else {
          for (const error of result.errors) {
            console.error(`ERROR: ${error}`);
          }
        }

        if (!result.ok) {
          process.exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ERROR: ${message}`);
        process.exitCode = 1;
      }
    });
}
