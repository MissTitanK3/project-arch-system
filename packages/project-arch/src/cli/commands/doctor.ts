import { Command } from "commander";
import { spawnSync } from "child_process";
import { lint, check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { toCheckDiagnosticsPayload } from "../../core/validation/check";
import { runDoctorHealth } from "../../core/doctor/health";
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

  const command = program
    .command("doctor")
    .description("Run holistic health sweep and summarise all issues by severity")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa doctor",
        description:
          "Run all validation steps regardless of individual failures: frontmatter lint, " +
          "markdown lint, and architecture check. Summarises all issues by severity at the end. " +
          "Exits with code 1 if any step produced errors.",
        examples: [
          { description: "Run full preflight", command: "pa doctor" },
          {
            description: "Get machine-readable diagnostics after the sweep",
            command: "pa doctor; pa check --json",
          },
        ],
        agentMetadata: {
          outputFormat:
            "Step-by-step output with per-step issue counts and a final severity summary. " +
            "Exits with code 1 if any step had errors.",
        },
        relatedCommands: [
          { command: "pa lint frontmatter", description: "Frontmatter lint details" },
          { command: "pa check --json", description: "Machine-readable diagnostics" },
          { command: "pa explain <code>", description: "Explain a diagnostic code" },
        ],
      }),
    );

  command
    .command("health")
    .description("Run structural health checks with optional safe repair actions")
    .option("--repair", "Apply safe repair actions for repairable issues", false)
    .option("--json", "Output machine-readable JSON")
    .action(async (options: { repair?: boolean; json?: boolean }) => {
      const result = await runDoctorHealth({ repair: options.repair === true });

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              schemaVersion: "2.0",
              status: result.status,
              checkedAt: result.checkedAt,
              summary: {
                issueCount: result.issues.length,
                repairedCount: result.repairedCount,
              },
              issues: result.issues,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`status: ${result.status}`);
        console.log(`issues: ${result.issues.length}`);
        if (options.repair) {
          console.log(`repaired: ${result.repairedCount}`);
        }

        for (const issue of result.issues) {
          const prefix = issue.severity === "error" ? "ERROR" : "WARNING";
          const pathSuffix = issue.path ? ` (${issue.path})` : "";
          console.log(`${prefix}: [${issue.code}] ${issue.message}${pathSuffix}`);
          console.log(`  fix: ${issue.fix}`);
          console.log(`  repairable: ${issue.repairable ? "yes" : "no"}`);
        }

        if (result.issues.length === 0) {
          console.log("OK");
        }
      }

      if (result.status === "broken") {
        process.exitCode = 1;
      }
    });

  command.action(async () => {
    const failedSteps: string[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    // ── Step 1: Frontmatter lint ──────────────────────────────────────────────
    console.log("Step 1/3: pa lint frontmatter --fix");
    const lintResult = unwrap(await lint.lintFrontmatterRun({ fix: true }));

    for (const diagnostic of lintResult.diagnostics) {
      const prefix = diagnostic.severity === "error" ? "ERROR" : "WARNING";
      const output = `${prefix}: ${diagnostic.path}:${diagnostic.line} [${diagnostic.code}] ${diagnostic.message}`;
      if (diagnostic.severity === "error") {
        console.error(output);
        totalErrors += 1;
      } else {
        console.warn(output);
        totalWarnings += 1;
      }
    }

    if (!lintResult.ok) {
      console.error("ERROR: Step 1 failed (pa lint frontmatter --fix).");
      failedSteps.push("Step 1 (pa lint frontmatter --fix)");
    } else if (lintResult.fixedFiles > 0) {
      console.log(`INFO: Step 1 fixed ${lintResult.fixedFiles} file(s).`);
    }

    // ── Step 2: Markdown lint ─────────────────────────────────────────────────
    console.log("Step 2/3: pnpm lint:md");
    const markdownLintResult = runMarkdownLint();
    if (!markdownLintResult.ok) {
      const reasonSuffix = markdownLintResult.reason ? ` (${markdownLintResult.reason})` : "";
      console.error(`ERROR: Step 2 failed (pnpm lint:md)${reasonSuffix}.`);
      failedSteps.push("Step 2 (pnpm lint:md)");
      totalErrors += 1;
    }

    // ── Step 3: Architecture check ────────────────────────────────────────────
    console.log("Step 3/3: pa check --json");
    const checkResult = unwrap(await check.checkRun());
    const payload = toCheckDiagnosticsPayload(checkResult);
    console.log(JSON.stringify(payload, null, 2));

    if (!checkResult.ok) {
      console.error("ERROR: Step 3 failed (pa check --json). See diagnostics above.");
      failedSteps.push("Step 3 (pa check --json)");
      totalErrors += checkResult.errors.length;
      totalWarnings += checkResult.warnings.length;
    } else {
      totalWarnings += checkResult.warnings.length;
    }

    // ── Final summary ─────────────────────────────────────────────────────────
    console.log("");
    console.log(`Summary: ${totalErrors} error(s), ${totalWarnings} warning(s) across 3 step(s).`);

    if (failedSteps.length > 0) {
      console.error(`ERROR: doctor sweep found issues in: ${failedSteps.join(", ")}.`);
      process.exitCode = 1;
    } else {
      console.log("OK (doctor sweep passed)");
    }
  });
}
