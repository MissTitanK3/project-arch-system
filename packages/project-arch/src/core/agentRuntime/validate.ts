import { spawnSync } from "child_process";
import { agentTaskContractSchema, type AgentTaskContract } from "../../schemas/agentTaskContract";
import { agentResultBundleSchema, type AgentResultBundle } from "../../schemas/agentResultBundle";
import { readJson } from "../../utils/fs";
import { runRepositoryChecks } from "../validation/check";
import {
  agentValidationReportSchema,
  type AgentValidationFinding,
  type AgentValidationReport,
} from "./validationReport";
import { buildAgentRunRecord, writeAgentRunRecord } from "./runRecord";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";
import { agentContractPath, agentResultPath, toPosixRelativePath } from "./paths";
import { appendAgentAuditEvent } from "./audit";

export class ValidateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidateError";
  }
}

export interface ValidateAgentRunOptions {
  runId: string;
  cwd?: string;
  strict?: boolean;
  pathsOnly?: boolean;
}

export interface ValidateAgentRunResult extends AgentRuntimeCommandResultBase {
  ok: boolean;
  status: "validation-passed" | "validation-failed";
  validatedAt: string;
  violations: AgentValidationFinding[];
  warnings: AgentValidationFinding[];
  checksRun: string[];
  runRecordPath: string;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizePath(glob);
  const placeholder = "__DOUBLE_STAR__";
  const withPlaceholder = normalized.replace(/\*\*/g, placeholder);
  const escaped = escapeRegExp(withPlaceholder);
  const singleStar = escaped.replace(/\*/g, "[^/]*");
  const wildcard = singleStar.replace(new RegExp(placeholder, "g"), ".*");
  return new RegExp(`^${wildcard}$`);
}

function matchesScopePattern(targetPath: string, pattern: string): boolean {
  const filePath = normalizePath(targetPath);
  const scopePattern = normalizePath(pattern);

  if (!scopePattern.includes("*")) {
    if (scopePattern.endsWith("/")) {
      return filePath.startsWith(scopePattern);
    }
    return filePath === scopePattern || filePath.startsWith(`${scopePattern}/`);
  }

  return globToRegExp(scopePattern).test(filePath);
}

function checkScope(
  contract: AgentTaskContract,
  result: AgentResultBundle,
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];

  for (const changedFile of result.changedFiles) {
    const inAllowedPaths = contract.scope.allowedPaths.some((pattern) =>
      matchesScopePattern(changedFile, pattern),
    );
    if (!inAllowedPaths) {
      findings.push({
        code: "PAA003",
        severity: "error",
        message: "Changed file is outside allowed paths.",
        path: changedFile,
      });
    }

    const inBlockedPaths = contract.scope.blockedPaths.some((pattern) =>
      matchesScopePattern(changedFile, pattern),
    );
    if (inBlockedPaths) {
      findings.push({
        code: "PAA003",
        severity: "error",
        message: "Changed file falls under a blocked path.",
        path: changedFile,
      });
    }
  }

  return findings;
}

function checkBlockedOperations(
  contract: AgentTaskContract,
  result: AgentResultBundle,
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];
  for (const finding of result.policyFindings) {
    if (contract.scope.blockedOperations.includes(finding.code as never)) {
      findings.push({
        code: "PAA004",
        severity: "error",
        message: `Blocked operation reported by runtime: ${finding.code}`,
        path: finding.path,
      });
    }
  }
  return findings;
}

function classifyCommandOperation(
  command: string,
): "run-tests" | "run-lint" | "run-typecheck" | "install-dependency" | "unknown" {
  const normalized = command.toLowerCase();

  if (/(^|\s)(pnpm|npm|yarn|bun)\s+(add|install)\b|\bpip\s+install\b/.test(normalized)) {
    return "install-dependency";
  }

  if (/\b(vitest|jest|mocha|ava)\b|\b(pnpm|npm|yarn|bun)\s+test\b/.test(normalized)) {
    return "run-tests";
  }

  if (/\b(eslint|lint)\b/.test(normalized)) {
    return "run-lint";
  }

  if (/\btypecheck\b|\btsc\b/.test(normalized)) {
    return "run-typecheck";
  }

  return "unknown";
}

function checkCommandPolicy(
  contract: AgentTaskContract,
  result: AgentResultBundle,
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];

  for (const commandRun of result.commandsRun) {
    if (commandRun.exitCode !== 0) {
      findings.push({
        code: "PAA008",
        severity: "error",
        message: `Runtime command exited non-zero: ${commandRun.command}`,
      });
    }

    const operation = classifyCommandOperation(commandRun.command);

    if (
      operation === "install-dependency" &&
      contract.scope.blockedOperations.includes("install-dependency")
    ) {
      findings.push({
        code: "PAA008",
        severity: "error",
        message: `Blocked operation reported by runtime command: ${commandRun.command}`,
      });
      continue;
    }

    if (operation !== "unknown" && operation !== "install-dependency") {
      if (!contract.scope.allowedOperations.includes(operation)) {
        findings.push({
          code: "PAA008",
          severity: "error",
          message: `Command class '${operation}' is not allowed by contract scope: ${commandRun.command}`,
        });
      }
    }
  }

  return findings;
}

function trustLevelAllowsOperation(contract: AgentTaskContract, operation: string): boolean {
  if (contract.trustLevel === "t0-readonly") {
    return ["read", "run-tests", "run-lint", "run-typecheck"].includes(operation);
  }

  if (contract.trustLevel === "t1-scoped-edit") {
    return ["read", "write", "create", "run-tests", "run-lint", "run-typecheck"].includes(
      operation,
    );
  }

  return true;
}

function checkTrustLevel(
  contract: AgentTaskContract,
  result: AgentResultBundle,
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];

  for (const operation of contract.scope.allowedOperations) {
    if (!trustLevelAllowsOperation(contract, operation)) {
      findings.push({
        code: "PAA009",
        severity: "error",
        message: `Trust level '${contract.trustLevel}' cannot authorize operation '${operation}'.`,
      });
    }
  }

  if (contract.trustLevel === "t0-readonly" && result.changedFiles.length > 0) {
    findings.push({
      code: "PAA009",
      severity: "error",
      message: "Readonly trust level cannot accept changed files in runtime result.",
    });
  }

  return findings;
}

function hasRequiredEvidence(result: AgentResultBundle, requirement: string): boolean {
  if (requirement === "diff-summary") {
    return (
      typeof result.evidence.diffSummary === "string" && result.evidence.diffSummary.length > 0
    );
  }
  if (requirement === "changed-files") {
    return Array.isArray(result.changedFiles) && result.changedFiles.length > 0;
  }
  if (requirement === "command-results") {
    return Array.isArray(result.commandsRun) && result.commandsRun.length > 0;
  }
  return requirement in result.evidence;
}

function checkRequiredEvidence(
  contract: AgentTaskContract,
  result: AgentResultBundle,
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];
  for (const requirement of contract.verification.requiredEvidence) {
    if (!hasRequiredEvidence(result, requirement)) {
      findings.push({
        code: "PAA005",
        severity: "error",
        message: `Required evidence is missing: ${requirement}`,
      });
    }
  }
  return findings;
}

function checkEscalation(
  contract: AgentTaskContract,
  result: AgentResultBundle,
  strict: boolean,
): AgentValidationFinding[] {
  const requiresEscalation =
    (result.decisionRequests?.length ?? 0) > 0 ||
    result.policyFindings.some((finding) =>
      contract.escalationRules.includes(finding.code as never),
    );

  if (!requiresEscalation) {
    return [];
  }

  return [
    {
      code: "PAA007",
      severity: strict ? "error" : "warning",
      message: "Escalation is required before validation can pass reconciliation review.",
    },
  ];
}

function runVerificationCommands(
  contract: AgentTaskContract,
  cwd: string,
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];

  for (const command of contract.verification.commands) {
    const result = spawnSync(command, {
      cwd,
      shell: true,
      encoding: "utf8",
    });

    if ((result.status ?? 1) !== 0) {
      findings.push({
        code: "PAA006",
        severity: "error",
        message: `Verification command failed: ${command}`,
      });
    }
  }

  return findings;
}

async function runRepositoryValidation(cwd: string): Promise<AgentValidationFinding[]> {
  const findings: AgentValidationFinding[] = [];
  const repoCheck = await runRepositoryChecks(cwd);

  for (const diagnostic of repoCheck.diagnostics) {
    if (diagnostic.severity !== "error") {
      continue;
    }
    findings.push({
      code: "PAA006",
      severity: "error",
      message: `Repository validation failed: [${diagnostic.code}] ${diagnostic.message}`,
      path: diagnostic.path ?? undefined,
    });
  }

  return findings;
}

export async function loadValidationInputs(
  runId: string,
  cwd = process.cwd(),
): Promise<{ contract: AgentTaskContract; result: AgentResultBundle }> {
  const contractFile = agentContractPath(runId, cwd);
  const resultFile = agentResultPath(runId, cwd);

  let rawContract: unknown;
  try {
    rawContract = await readJson<unknown>(contractFile);
  } catch {
    throw new ValidateError(
      "PAA002",
      `Prepared contract not found for run ${runId}. Expected ${toPosixRelativePath(cwd, contractFile)}.`,
    );
  }

  let rawResult: unknown;
  try {
    rawResult = await readJson<unknown>(resultFile);
  } catch {
    throw new ValidateError(
      "PAA002",
      `Imported result not found for run ${runId}. Expected ${toPosixRelativePath(cwd, resultFile)}.`,
    );
  }

  return {
    contract: agentTaskContractSchema.parse(rawContract),
    result: agentResultBundleSchema.parse(rawResult),
  };
}

export async function validateAgentRun(
  options: ValidateAgentRunOptions,
): Promise<ValidateAgentRunResult> {
  const cwd = options.cwd ?? process.cwd();
  try {
    const strict = options.strict === true;
    const pathsOnly = options.pathsOnly === true;

    const { contract, result } = await loadValidationInputs(options.runId, cwd);

    if (contract.runId !== result.runId || contract.taskId !== result.taskId) {
      throw new ValidateError(
        "PAA002",
        `Contract/result identity mismatch for run ${options.runId}.`,
      );
    }

    const violations: AgentValidationFinding[] = [];
    const warnings: AgentValidationFinding[] = [];
    const checksRun = [
      "scope",
      "blocked-operations",
      "required-evidence",
      "command-policy",
      "trust-level",
    ];

    violations.push(...checkScope(contract, result));
    violations.push(...checkBlockedOperations(contract, result));
    violations.push(...checkRequiredEvidence(contract, result));
    violations.push(...checkCommandPolicy(contract, result));
    violations.push(...checkTrustLevel(contract, result));

    const escalationFindings = checkEscalation(contract, result, strict);
    if (strict) {
      violations.push(...escalationFindings);
    } else {
      warnings.push(...escalationFindings);
    }

    if (!pathsOnly) {
      checksRun.push("verification-commands");
      violations.push(...runVerificationCommands(contract, cwd));

      checksRun.push("pa-check");
      violations.push(...(await runRepositoryValidation(cwd)));
    }

    const report: AgentValidationReport = agentValidationReportSchema.parse({
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: contract.runId,
      taskId: contract.taskId,
      ok: violations.length === 0,
      status: violations.length === 0 ? "validation-passed" : "validation-failed",
      validatedAt: new Date().toISOString(),
      violations,
      warnings,
      checksRun,
    });

    const runRecord = buildAgentRunRecord({
      validationReport: report,
      resultPath: toPosixRelativePath(cwd, agentResultPath(report.runId, cwd)),
      contractPath: toPosixRelativePath(cwd, agentContractPath(report.runId, cwd)),
    });
    const runRecordPath = await writeAgentRunRecord(runRecord, cwd);

    await appendAgentAuditEvent(
      {
        command: "validate",
        status: "success",
        runId: report.runId,
        taskId: report.taskId,
        metadata: {
          ok: report.ok,
          status: report.status,
          violations: report.violations.length,
          warnings: report.warnings.length,
        },
      },
      cwd,
    );

    return {
      ...report,
      runRecordPath: toPosixRelativePath(cwd, runRecordPath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendAgentAuditEvent(
      {
        command: "validate",
        status: "error",
        runId: options.runId,
        message,
      },
      cwd,
    ).catch(() => undefined);
    throw error;
  }
}
