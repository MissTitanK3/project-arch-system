import { Command } from "commander";
import { agent } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function isMissingInputError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes(" is missing") ||
    normalized.includes("missing for run")
  );
}

function handlePostRunError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exitCode = isMissingInputError(message) ? 2 : 1;
}

function printPrepareError(message: string): void {
  const kind = agent.classifyAgentPrepareFailure(message);

  if (kind === "approval-required") {
    console.error(`APPROVAL REQUIRED: ${message}`);
    return;
  }

  if (kind === "ineligible") {
    console.error(`NOT AUTHORIZED: ${message}`);
    return;
  }

  console.error(`ERROR: ${message}`);
}

export function registerAgentCommand(program: Command): void {
  const command = program.command("agent").description("Prepare and review agent runtime work");

  command
    .command("audit")
    .argument("[runId]")
    .description("Inspect runtime-local agent audit history")
    .option("--json", "Output machine-readable JSON")
    .option("--limit <count>", "Limit number of returned events", (value: string) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--limit must be a positive integer.");
      }
      return parsed;
    })
    .action(async (runId: string | undefined, options: { json?: boolean; limit?: number }) => {
      try {
        const auditResult = await agent.agentAuditHistory({
          runId,
          limit: options.limit,
        });

        if (options.json) {
          printJson(auditResult);
          if (!auditResult.success) {
            const message = auditResult.errors?.join("; ") ?? "Audit history failed";
            process.exitCode = isMissingInputError(message) ? 2 : 1;
          }
          return;
        }

        const result = unwrap(auditResult);

        console.log(`Audit log: ${result.logPath}`);
        console.log("boundary: runtime-local history; promotion is explicit");
        console.log(`events: ${result.events.length}/${result.total}`);
        for (const event of result.events) {
          const run = event.runId ? ` run=${event.runId}` : "";
          const task = event.taskId ? ` task=${event.taskId}` : "";
          const message = event.message ? ` ${event.message}` : "";
          console.log(
            `${event.occurredAt} ${event.command} ${event.status}${run}${task}${message}`,
          );
        }
      } catch (error) {
        handlePostRunError(error);
      }
    });

  command
    .command("orchestrate")
    .argument("<taskRef>")
    .description("Run planner->implementer->reviewer->reconciler orchestration for a task")
    .requiredOption("--runtime <runtime>", "Runtime adapter id to launch")
    .option("--json", "Output machine-readable JSON")
    .option("--strict", "Treat escalation-required findings as validation failures", false)
    .option(
      "--paths-only",
      "Skip verification commands and repository checks; validate scope/policy/evidence only",
      false,
    )
    .option("--apply", "Apply approved non-destructive reconciliation updates", false)
    .option(
      "--create-discovered",
      "Create discovered-task draft outputs for accepted drift findings",
      false,
    )
    .option("--timeout-ms <ms>", "Adapter launch timeout in milliseconds", (value: string) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--timeout-ms must be a positive integer.");
      }
      return parsed;
    })
    .action(
      async (
        taskRef: string,
        options: {
          runtime: string;
          json?: boolean;
          strict?: boolean;
          pathsOnly?: boolean;
          apply?: boolean;
          createDiscovered?: boolean;
          timeoutMs?: number;
        },
      ) => {
        try {
          const orchestrationResult = await agent.agentOrchestrate({
            taskId: taskRef,
            runtime: options.runtime,
            strict: options.strict,
            pathsOnly: options.pathsOnly,
            apply: options.apply,
            createDiscovered: options.createDiscovered,
            timeoutMs: options.timeoutMs,
          });

          if (options.json) {
            printJson(orchestrationResult);
            if (!orchestrationResult.success) {
              const message = orchestrationResult.errors?.join("; ") ?? "Orchestration failed";
              process.exitCode = isMissingInputError(message) ? 2 : 1;
            }
            return;
          }

          const result = unwrap(orchestrationResult);
          const consumerState = agent.classifyAgentOrchestrateOutcome(result);

          if (consumerState === "role-failure") {
            console.log(
              `Orchestration failed for run ${result.runId} (task ${result.taskId}) at role ${result.failedRole ?? "unknown"}`,
            );
          } else if (consumerState === "follow-up-review") {
            console.log(
              `Orchestration paused for follow-up review on run ${result.runId} (task ${result.taskId})`,
            );
          } else if (consumerState === "orchestration-completed") {
            console.log(`Orchestration completed for run ${result.runId} (task ${result.taskId})`);
          } else {
            console.log(
              `Orchestrated run ${result.runId} for task ${result.taskId} (${result.orchestrationStatus})`,
            );
          }

          console.log(`orchestration: ${result.orchestrationPath}`);
          console.log(`orchestration-status: ${result.orchestrationStatus}`);
          console.log(`roles: ${result.completedRoles.join(", ") || "none"}`);
          if (result.failedRole) {
            console.log(`failed-role: ${result.failedRole}`);
          }
          if (result.nextAction) {
            console.log(`next: ${result.nextAction}`);
          }
          if (consumerState === "role-failure" || consumerState === "follow-up-review") {
            console.log(
              "fallback: pa result import <path> -> pa agent validate <runId> -> pa agent reconcile <runId>",
            );
          }
          if (result.runRecordPath) {
            console.log(`run: ${result.runRecordPath}`);
          }
          if (result.reconciliationReportPath) {
            console.log(`report: ${result.reconciliationReportPath}`);
          }

          if (result.orchestrationStatus === "failed") {
            process.exitCode = 1;
          }
        } catch (error) {
          handlePostRunError(error);
        }
      },
    );

  command
    .command("run")
    .argument("<taskRef>")
    .description("Prepare and launch an authorized task through a registered runtime adapter")
    .requiredOption("--runtime <runtime>", "Runtime adapter id to launch")
    .option("--json", "Output machine-readable JSON")
    .option("--timeout-ms <ms>", "Adapter launch timeout in milliseconds", (value: string) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--timeout-ms must be a positive integer.");
      }
      return parsed;
    })
    .action(
      async (taskRef: string, options: { runtime: string; json?: boolean; timeoutMs?: number }) => {
        try {
          const runResult = await agent.agentRun({
            taskId: taskRef,
            runtime: options.runtime,
            timeoutMs: options.timeoutMs,
          });

          if (options.json) {
            printJson(runResult);
            if (!runResult.success) {
              const message = runResult.errors?.join("; ") ?? "Run failed";
              process.exitCode = isMissingInputError(message) ? 2 : 1;
            }
            return;
          }

          const result = unwrap(runResult);
          console.log(
            `Launched agent run ${result.runId} for task ${result.taskId} via ${result.runtime}`,
          );
          console.log(`handle: ${result.runHandle}`);
          console.log(`contract: ${result.contractPath}`);
          console.log(`prompt: ${result.promptPath}`);
          console.log(`launch: ${result.launchRecordPath}`);
        } catch (error) {
          handlePostRunError(error);
        }
      },
    );

  command
    .command("status")
    .argument("<runId>")
    .description("Inspect the launch-phase status of an agent run")
    .option("--json", "Output machine-readable JSON")
    .action(async (runId: string, options: { json?: boolean }) => {
      try {
        const statusResult = await agent.agentRunStatus({ runId });

        if (options.json) {
          printJson(statusResult);
          if (!statusResult.success) {
            const message = statusResult.errors?.join("; ") ?? "Status lookup failed";
            process.exitCode = isMissingInputError(message) ? 2 : 1;
          }
          return;
        }

        const result = unwrap(statusResult);
        console.log(`run: ${result.runId}`);
        console.log(`phase: ${result.phase}`);
        if (result.runHandle) {
          console.log(`handle: ${result.runHandle}`);
        }
        if (result.runReviewStatus) {
          console.log(`review-status: ${result.runReviewStatus}`);
        }
        if (result.orchestrationRecordExists) {
          if (result.orchestrationStatus) {
            console.log(`orchestration-status: ${result.orchestrationStatus}`);
          }
          if (result.orchestrationPath) {
            console.log(`orchestration: ${result.orchestrationPath}`);
          }
          if (result.orchestrationCompletedRoles) {
            console.log(
              `orchestration-roles: ${result.orchestrationCompletedRoles.join(", ") || "none"}`,
            );
          }
          if (result.orchestrationStatus === "failed") {
            console.log(
              "orchestration-note: role failure captured; continue with fallback import/validate/reconcile flow",
            );
          }
          if (result.orchestrationStatus === "waiting-for-result-import") {
            console.log(
              "orchestration-note: waiting for runtime result import before validate/reconcile follow-up",
            );
          }
        } else {
          console.log("orchestration-status: none (single-agent run or pre-orchestration state)");
        }
        if (result.launchRecordPath) {
          console.log(`launch-record: ${result.launchRecordPath}`);
        }
        console.log("boundary: launch-phase advisory; run-record is authoritative downstream");
      } catch (error) {
        handlePostRunError(error);
      }
    });

  command
    .command("reconcile")
    .argument("<runId>")
    .description("Generate reconciliation outputs for a validated run")
    .option("--json", "Output machine-readable JSON")
    .option("--apply", "Apply approved non-destructive reconciliation updates", false)
    .option(
      "--create-discovered",
      "Create discovered-task draft outputs for accepted drift findings",
      false,
    )
    .action(
      async (
        runId: string,
        options: { json?: boolean; apply?: boolean; createDiscovered?: boolean },
      ) => {
        try {
          const reconcileResult = await agent.agentReconcile({
            runId,
            apply: options.apply,
            createDiscovered: options.createDiscovered,
          });

          if (options.json) {
            printJson(reconcileResult);
            if (!reconcileResult.success) {
              const message = reconcileResult.errors?.join("; ") ?? "Reconcile failed";
              process.exitCode = isMissingInputError(message) ? 2 : 1;
            }
            return;
          }

          const result = unwrap(reconcileResult);

          console.log(`Reconciled run ${result.runId} (task ${result.taskId})`);
          console.log(`report: ${result.reportPath}`);
          console.log(`report-md: ${result.reportMarkdownPath}`);
          console.log(`run: ${result.runRecordPath}`);
          if (result.discoveredDraftPath) {
            console.log(`discovered: ${result.discoveredDraftPath}`);
          }
          for (const escalationPath of result.escalationDraftPaths) {
            console.log(`escalation: ${escalationPath}`);
          }
        } catch (error) {
          handlePostRunError(error);
        }
      },
    );

  command
    .command("validate")
    .argument("<runId>")
    .description("Validate an imported run against scope, policy, and repository checks")
    .option("--json", "Output machine-readable JSON")
    .option("--strict", "Treat escalation-required findings as validation failures", false)
    .option(
      "--paths-only",
      "Skip verification commands and repository checks; validate scope/policy/evidence only",
      false,
    )
    .action(
      async (runId: string, options: { json?: boolean; strict?: boolean; pathsOnly?: boolean }) => {
        try {
          const validateResult = await agent.agentValidate({
            runId,
            strict: options.strict,
            pathsOnly: options.pathsOnly,
          });

          if (options.json) {
            printJson(validateResult);
            if (!validateResult.success) {
              const message = validateResult.errors?.join("; ") ?? "Validate failed";
              process.exitCode = isMissingInputError(message) ? 2 : 1;
            }
            return;
          }

          const result = unwrap(validateResult);
          const state = agent.classifyAgentValidateOutcome(result);

          if (state === "validation-failed") {
            console.log(`Validation failed for run ${result.runId} (task ${result.taskId})`);
          } else if (state === "escalation-ready") {
            console.log(
              `Validation passed with escalation review required for run ${result.runId} (task ${result.taskId})`,
            );
          } else {
            console.log(`Validation passed for run ${result.runId} (task ${result.taskId})`);
          }
          console.log(`run: ${result.runRecordPath}`);

          if (!result.ok) {
            process.exitCode = 1;
          }
        } catch (error) {
          handlePostRunError(error);
        }
      },
    );

  command
    .command("prepare")
    .argument("<taskRef>")
    .description("Prepare a run-scoped contract and prompt for an authorized task")
    .option("--json", "Output machine-readable JSON")
    .option("--prompt-only", "Render the prepared runtime prompt to stdout without writing files")
    .option("--check", "Validate prepare generation without creating files", false)
    .action(
      async (
        taskRef: string,
        options: { json?: boolean; promptOnly?: boolean; check?: boolean },
      ) => {
        try {
          const prepareResult = await agent.agentPrepare({
            taskId: taskRef,
            promptOnly: options.promptOnly,
            check: options.check,
          });

          if (options.json) {
            printJson(prepareResult);
            if (!prepareResult.success) {
              const message = prepareResult.errors?.join("; ") ?? "Prepare failed";
              process.exitCode = agent.getAgentPrepareExitCode(message);
            }
            return;
          }

          const result = unwrap(prepareResult);

          if (options.promptOnly) {
            console.log(result.prompt ?? "");
            return;
          }

          console.log(
            options.check
              ? `Prepare check passed for task ${result.taskId} (${result.runId})`
              : `Prepared agent run ${result.runId} for task ${result.taskId}`,
          );
          console.log(`contract: ${result.contractPath}`);
          console.log(`prompt: ${result.promptPath}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          printPrepareError(message);
          process.exitCode = agent.getAgentPrepareExitCode(message);
        }
      },
    );
}
