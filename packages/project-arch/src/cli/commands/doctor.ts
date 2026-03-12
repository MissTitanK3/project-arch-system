import { Command } from "commander";
import { spawnSync } from "child_process";
import { lint, check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { toCheckDiagnosticsPayload } from "../../core/validation/check";
import { formatEnhancedHelp } from "../help/format";

export function runMarkdownLintStep(cwd = process.cwd()): { ok: boolean; reason?: string } {
  const result = spawnSync("pnpm", ["lint:md"], {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    return { ok: false, reason: result.error.message };
  }

  if (typeof result.status === "number" && result.status !== 0) {
    return { ok: false, reason: `exit code ${result.status}` };
  }

  return { ok: true };
}

export interface DoctorCommandDependencies {
  runMarkdownLintStep?: (cwd?: string) => { ok: boolean; reason?: string };
}

export function registerDoctorCommand(
  program: Command,
  dependencies: DoctorCommandDependencies = {},
): void {
  const runMarkdownLint = dependencies.runMarkdownLintStep ?? runMarkdownLintStep;

  program
    .command("doctor")
    .description("Run canonical preflight validation pipeline")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa doctor",
        description:
          "Run canonical preflight in order: frontmatter lint --fix, markdown lint, then check --json.",
        examples: [
          { description: "Run full preflight", command: "pa doctor" },
          {
            description: "Run preflight then inspect diagnostics only",
            command: "pa doctor && pa check --json",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Step-by-step pipeline output with explicit step attribution. Exits with code 1 on first failing step.",
        },
        relatedCommands: [
          { command: "pa lint frontmatter --fix", description: "Frontmatter preflight" },
          { command: "pa check --json", description: "Machine-readable diagnostics" },
        ],
      }),
    )
    .action(async () => {
      console.log("Step 1/3: pa lint frontmatter --fix");
      const lintResult = unwrap(await lint.lintFrontmatterRun({ fix: true }));

      for (const diagnostic of lintResult.diagnostics) {
        const prefix = diagnostic.severity === "error" ? "ERROR" : "WARNING";
        const output = `${prefix}: ${diagnostic.path}:${diagnostic.line} [${diagnostic.code}] ${diagnostic.message}`;
        if (diagnostic.severity === "error") {
          console.error(output);
        } else {
          console.warn(output);
        }
      }

      if (!lintResult.ok) {
        console.error("ERROR: Step 1 failed (pa lint frontmatter --fix).");
        process.exitCode = 1;
        return;
      }

      if (lintResult.fixedFiles > 0) {
        console.log(`INFO: Step 1 fixed ${lintResult.fixedFiles} file(s).`);
      }

      console.log("Step 2/3: pnpm lint:md");
      const markdownLintResult = runMarkdownLint();
      if (!markdownLintResult.ok) {
        const reasonSuffix = markdownLintResult.reason ? ` (${markdownLintResult.reason})` : "";
        console.error(`ERROR: Step 2 failed (pnpm lint:md)${reasonSuffix}.`);
        process.exitCode = 1;
        return;
      }

      console.log("Step 3/3: pa check --json");
      const checkResult = unwrap(await check.checkRun());
      const payload = toCheckDiagnosticsPayload(checkResult);
      console.log(JSON.stringify(payload, null, 2));

      if (!checkResult.ok) {
        console.error("ERROR: Step 3 failed (pa check --json). See diagnostics above.");
        process.exitCode = 1;
        return;
      }

      console.log("OK (doctor pipeline passed)");
    });
}
