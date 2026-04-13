import {
  type AgentAllowedOperation,
  type AgentBlockedOperation,
  type AgentEscalationRule,
  type AgentTaskContract,
  agentTaskContractSchema,
} from "../../schemas/agentTaskContract";
import { pathExists, writeJsonDeterministic } from "../../utils/fs";
import { collectTaskRecords, type TaskRecord } from "../validation/tasks";
import {
  loadPhaseManifest,
  resolvePhaseProjectId,
  preferredMilestoneOverviewPath,
  preferredPhaseOverviewPath,
  loadProjectManifest,
} from "../manifests";
import { collectDecisionRecords } from "../validation/decisions";
import {
  agentContractPath,
  agentPromptPath,
  agentPromptsDirPath,
  toPosixRelativePath,
} from "./paths";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";
import { resolveAgentWorkAuthorization } from "./authorization";

// ---------------------------------------------------------------------------
// Run ID generation
// ---------------------------------------------------------------------------

/**
 * Generates a run-scoped identifier formatted as `run-YYYY-MM-DD-HHmmss`.
 * Accepts an optional `date` to allow deterministic generation in tests.
 */
export function generateRunId(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `run-${year}-${month}-${day}-${hh}${mm}${ss}`;
}

// ---------------------------------------------------------------------------
// Task resolution
// ---------------------------------------------------------------------------

function formatScopedTaskRef(record: TaskRecord): string {
  return `${record.phaseId}/${record.milestoneId}/${record.frontmatter.id}`;
}

function parseScopedTaskRef(taskRef: string):
  | {
      phaseId: string;
      milestoneId: string;
      taskId: string;
    }
  | undefined {
  const parts = taskRef.split("/");
  if (parts.length !== 3) {
    return undefined;
  }

  const [phaseId, milestoneId, taskId] = parts;
  if (!phaseId || !milestoneId || !/^\d{3}$/.test(taskId)) {
    return undefined;
  }

  return { phaseId, milestoneId, taskId };
}

/**
 * Resolve a task record from either a bare 3-digit task id or a fully scoped
 * `phase-id/milestone-id/task-id` reference.
 *
 * Bare ids remain supported only when they resolve to exactly one task record.
 * Ambiguous ids throw a `PrepareError` with the scoped alternatives.
 */
export async function findTaskById(
  taskRef: string,
  cwd = process.cwd(),
): Promise<TaskRecord | null> {
  const records = await collectTaskRecords(cwd, { onError: () => undefined });
  const scoped = parseScopedTaskRef(taskRef);

  if (scoped) {
    return (
      records.find(
        (record) =>
          record.phaseId === scoped.phaseId &&
          record.milestoneId === scoped.milestoneId &&
          record.frontmatter.id === scoped.taskId,
      ) ?? null
    );
  }

  const matches = records.filter((record) => record.frontmatter.id === taskRef);
  if (matches.length <= 1) {
    return matches[0] ?? null;
  }

  const scopedRefs = matches.map(formatScopedTaskRef).sort((left, right) => left.localeCompare(right));
  throw new PrepareError(
    "PAA019",
    `Task reference '${taskRef}' is ambiguous. Use a scoped task reference: ${scopedRefs.join(", ")}.`,
  );
}

// ---------------------------------------------------------------------------
// Executability check
// ---------------------------------------------------------------------------

/** Errors thrown when a task cannot be prepared */
export class PrepareError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PrepareError";
  }
}

/**
 * Verifies that a task can be prepared for agent execution.
 * Throws a `PrepareError` if any policy check fails.
 */
export function checkTaskExecutable(record: TaskRecord): void {
  const authorization = resolveAgentWorkAuthorization(record);
  if (!authorization.authorized) {
    const reason =
      authorization.reason ??
      `Task ${record.frontmatter.id} is not authorized for agent execution.`;
    const nextStep = authorization.nextStep ? ` Next step: ${authorization.nextStep}` : "";

    if (authorization.boundary === "approval-required") {
      throw new PrepareError("PAA013", `Approval required: ${reason}${nextStep}`);
    }

    throw new PrepareError("PAA001", `${reason}${nextStep}`);
  }
}

// ---------------------------------------------------------------------------
// Contract assembly
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED_OPERATIONS: AgentAllowedOperation[] = [
  "read",
  "write",
  "create",
  "run-tests",
  "run-lint",
  "run-typecheck",
];

const DEFAULT_BLOCKED_OPERATIONS: AgentBlockedOperation[] = [
  "install-dependency",
  "modify-ci",
  "change-public-api-without-decision",
];

const DEFAULT_BLOCKED_PATHS = [".github/**", "infra/**"];

const DEFAULT_ESCALATION_RULES: AgentEscalationRule[] = [
  "requires-new-dependency",
  "public-contract-change",
  "undocumented-cross-domain-dependency",
];

const DEFAULT_VERIFICATION_COMMANDS = ["pnpm test", "pnpm typecheck"];
const DEFAULT_REQUIRED_EVIDENCE = ["diff-summary", "changed-files", "command-results"];

interface PrepareContextEnrichment {
  allowedPaths: string[];
  relatedDecisions: string[];
  relevantDocs: string[];
  externalStandards?: string[];
  verificationCommands: string[];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function declaredExecutionPaths(record: TaskRecord): string[] {
  return uniqueSorted([
    ...(record.frontmatter.codeTargets ?? []),
    ...(record.frontmatter.publicDocs ?? []),
  ]);
}

function decisionLinksTask(input: {
  links: string[];
  taskId: string;
  phaseId: string;
  milestoneId: string;
}): boolean {
  const scopedRef = `${input.phaseId}/${input.milestoneId}/${input.taskId}`;
  return input.links.some(
    (link) =>
      link === input.taskId || link.endsWith(`/${input.taskId}`) || link.includes(scopedRef),
  );
}

function extractExternalStandards(record: TaskRecord): string[] | undefined {
  const candidates = record.frontmatter.traceLinks ?? [];
  const standards = candidates.filter((entry) =>
    /(owasp|nist|iso|cwe|asvs|cheatsheet|standard)/i.test(entry),
  );
  if (standards.length === 0) {
    return undefined;
  }
  return uniqueSorted(standards);
}

export async function resolvePrepareContextEnrichment(
  record: TaskRecord,
  cwd = process.cwd(),
): Promise<PrepareContextEnrichment> {
  const phaseManifest = await loadPhaseManifest(cwd);
  const projectId = resolvePhaseProjectId(phaseManifest, record.phaseId);

  let project;
  try {
    project = await loadProjectManifest(projectId, cwd);
  } catch {
    throw new PrepareError(
      "PAA012",
      `Project manifest missing for project '${projectId}'. Expected roadmap/projects/${projectId}/manifest.json.`,
    );
  }

  const phaseOverviewAbs = await preferredPhaseOverviewPath(record.phaseId, cwd);
  const milestoneOverviewAbs = await preferredMilestoneOverviewPath(
    record.phaseId,
    record.milestoneId,
    cwd,
  );

  const phaseOverviewExists = await pathExists(phaseOverviewAbs);
  const milestoneOverviewExists = await pathExists(milestoneOverviewAbs);

  if (!phaseOverviewExists) {
    throw new PrepareError(
      "PAA012",
      `Phase overview missing for phase '${record.phaseId}'. Expected ${toPosixRelativePath(cwd, phaseOverviewAbs)}.`,
    );
  }

  if (!milestoneOverviewExists) {
    throw new PrepareError(
      "PAA012",
      `Milestone overview missing for ${record.phaseId}/${record.milestoneId}. Expected ${toPosixRelativePath(cwd, milestoneOverviewAbs)}.`,
    );
  }

  const decisions = await collectDecisionRecords(cwd);
  const relatedDecisionRecords = decisions.filter((decision) =>
    decisionLinksTask({
      links: decision.frontmatter.links.tasks,
      taskId: record.frontmatter.id,
      phaseId: record.phaseId,
      milestoneId: record.milestoneId,
    }),
  );

  const relatedDecisionIds = uniqueSorted(
    relatedDecisionRecords.map((decision) => decision.frontmatter.id),
  );
  const declaredDecisionIds = uniqueSorted(record.frontmatter.decisions ?? []);
  const missingDeclaredDecisions = declaredDecisionIds.filter(
    (id) => !relatedDecisionIds.includes(id),
  );

  if (missingDeclaredDecisions.length > 0) {
    throw new PrepareError(
      "PAA012",
      `Task ${record.frontmatter.id} references decisions that are not linked from canonical decision records: ${missingDeclaredDecisions.join(", ")}.`,
    );
  }

  const decisionDocs = relatedDecisionRecords.flatMap(
    (decision) => decision.frontmatter.links.publicDocs,
  );
  const relevantDocs = uniqueSorted([
    ...(record.frontmatter.publicDocs ?? []),
    ...decisionDocs,
    toPosixRelativePath(cwd, phaseOverviewAbs),
    toPosixRelativePath(cwd, milestoneOverviewAbs),
  ]);

  const allowedPaths = uniqueSorted([...declaredExecutionPaths(record), ...project.ownedPaths]);
  const verificationCommands = uniqueSorted([...DEFAULT_VERIFICATION_COMMANDS, "pa check --json"]);

  return {
    allowedPaths,
    relatedDecisions: relatedDecisionIds,
    relevantDocs,
    externalStandards: extractExternalStandards(record),
    verificationCommands,
  };
}

/**
 * Build a valid agent task contract from a task record and a generated runId.
 * Uses the task frontmatter for all available context and applies
 * policy-inferred defaults for fields not stored in task metadata.
 */
export function buildTaskContract(
  record: TaskRecord,
  runId: string,
  cwd = process.cwd(),
  context?: PrepareContextEnrichment,
): AgentTaskContract {
  const fm = record.frontmatter;

  const taskRelPath = toPosixRelativePath(cwd, record.filePath);

  const allowedPaths =
    context?.allowedPaths ?? (declaredExecutionPaths(record).length > 0
      ? declaredExecutionPaths(record)
      : ["."]);
  const successCriteria =
    fm.completionCriteria.length > 0
      ? fm.completionCriteria
      : [`Complete task ${fm.id}: ${fm.title}`];

  const relatedDecisions = context?.relatedDecisions ?? fm.decisions ?? [];
  const relevantDocs = context?.relevantDocs ?? fm.publicDocs ?? [];

  const objective = fm.scope ?? fm.title;

  const preparedAt = new Date().toISOString();

  return agentTaskContractSchema.parse({
    schemaVersion: "2.0",
    runId,
    taskId: fm.id,
    status: "authorized",
    title: fm.title,
    objective,
    lane: fm.lane,
    trustLevel: "t1-scoped-edit",
    scope: {
      allowedPaths,
      blockedPaths: DEFAULT_BLOCKED_PATHS,
      allowedOperations: DEFAULT_ALLOWED_OPERATIONS,
      blockedOperations: DEFAULT_BLOCKED_OPERATIONS,
    },
    architectureContext: {
      projectId: record.projectId,
      phaseId: record.phaseId,
      milestoneId: record.milestoneId,
      taskPath: taskRelPath,
      relatedDecisions,
      relevantDocs,
      relevantSkills: [],
      externalStandards: context?.externalStandards,
    },
    successCriteria,
    verification: {
      commands: context?.verificationCommands ?? DEFAULT_VERIFICATION_COMMANDS,
      requiredEvidence: DEFAULT_REQUIRED_EVIDENCE,
    },
    escalationRules: DEFAULT_ESCALATION_RULES,
    preparedAt,
  });
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

/**
 * Render a human- and agent-readable markdown prompt from a prepared contract.
 */
export function buildPromptContent(contract: AgentTaskContract): string {
  const lines: string[] = [];

  lines.push(`# Agent Task Prompt: ${contract.title}`);
  lines.push("");
  lines.push(`**Run ID:** \`${contract.runId}\``);
  lines.push(`**Task ID:** \`${contract.taskId}\``);
  lines.push(`**Phase:** \`${contract.architectureContext.phaseId}\``);
  lines.push(`**Milestone:** \`${contract.architectureContext.milestoneId}\``);
  lines.push(`**Prepared at:** \`${contract.preparedAt}\``);
  lines.push("");
  lines.push("## Objective");
  lines.push("");
  lines.push(contract.objective);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("**Allowed paths:**");
  for (const p of contract.scope.allowedPaths) {
    lines.push(`- \`${p}\``);
  }
  lines.push("");
  if (contract.scope.blockedPaths.length > 0) {
    lines.push("**Blocked paths:**");
    for (const p of contract.scope.blockedPaths) {
      lines.push(`- \`${p}\``);
    }
    lines.push("");
  }
  lines.push(`**Allowed operations:** ${contract.scope.allowedOperations.join(", ")}`);
  lines.push(`**Blocked operations:** ${contract.scope.blockedOperations.join(", ")}`);
  lines.push("");
  lines.push("## Architecture Context");
  lines.push("");
  lines.push(`**Project:** \`${contract.architectureContext.projectId}\``);
  lines.push(`**Task file:** \`${contract.architectureContext.taskPath}\``);
  if (contract.architectureContext.relatedDecisions.length > 0) {
    lines.push("");
    lines.push("**Related decisions:**");
    for (const d of contract.architectureContext.relatedDecisions) {
      lines.push(`- ${d}`);
    }
  }
  if (contract.architectureContext.relevantDocs.length > 0) {
    lines.push("");
    lines.push("**Relevant docs:**");
    for (const doc of contract.architectureContext.relevantDocs) {
      lines.push(`- \`${doc}\``);
    }
  }
  if (
    contract.architectureContext.externalStandards &&
    contract.architectureContext.externalStandards.length > 0
  ) {
    lines.push("");
    lines.push("**External standards:**");
    for (const s of contract.architectureContext.externalStandards) {
      if (typeof s === "string") {
        lines.push(`- ${s}`);
      } else {
        const label = s.title ? `${s.title} (${s.id})` : s.id;
        lines.push(`- ${label}${s.url ? ` — ${s.url}` : ""}`);
      }
    }
  }
  lines.push("");
  lines.push("## Success Criteria");
  lines.push("");
  for (const criterion of contract.successCriteria) {
    lines.push(`- [ ] ${criterion}`);
  }
  lines.push("");
  lines.push("## Verification");
  lines.push("");
  lines.push("**Commands:**");
  lines.push("```");
  for (const cmd of contract.verification.commands) {
    lines.push(cmd);
  }
  lines.push("```");
  lines.push("");
  lines.push(`**Required evidence:** ${contract.verification.requiredEvidence.join(", ")}`);
  lines.push("");
  lines.push("## Escalation Rules");
  lines.push("");
  for (const rule of contract.escalationRules) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main prepare flow
// ---------------------------------------------------------------------------

export interface PrepareAgentRunOptions {
  taskId: string;
  /** Resolve paths relative to this directory. Defaults to process.cwd(). */
  cwd?: string;
  /** When true, validate and build artifacts without writing files to disk. */
  check?: boolean;
}

export interface PrepareAgentRunResult extends AgentRuntimeCommandResultBase {
  runId: string;
  taskId: string;
  status: "prepared";
  contractPath: string;
  promptPath: string;
  allowedPaths: string[];
}

/**
 * Inner prepare flow that operates on an already-resolved `TaskRecord`.
 * This is the testable core of the prepare flow and is also called by
 * `prepareAgentRun` after loading the task by id.
 */
export async function prepareAgentRunFromRecord(
  record: TaskRecord,
  options: Omit<PrepareAgentRunOptions, "taskId"> & { runId?: string },
): Promise<PrepareAgentRunResult> {
  const cwd = options.cwd ?? process.cwd();

  checkTaskExecutable(record);

  const shouldEnrichFromCanonicalState = await pathExists(record.filePath);
  const enrichedContext = shouldEnrichFromCanonicalState
    ? await resolvePrepareContextEnrichment(record, cwd)
    : undefined;

  const runId = options.runId ?? generateRunId();
  const contract = buildTaskContract(record, runId, cwd, enrichedContext);
  const promptContent = buildPromptContent(contract);

  const contractFilePath = agentContractPath(runId, cwd);
  const promptFilePath = agentPromptPath(runId, cwd);

  if (!options.check) {
    await writeJsonDeterministic(contractFilePath, contract);

    const fsExtra = await import("fs-extra");
    await fsExtra.default.ensureDir(agentPromptsDirPath(cwd));
    await fsExtra.default.writeFile(promptFilePath, promptContent, "utf8");
  }

  return {
    schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
    runId: contract.runId,
    taskId: contract.taskId,
    status: "prepared",
    contractPath: toPosixRelativePath(cwd, contractFilePath),
    promptPath: toPosixRelativePath(cwd, promptFilePath),
    allowedPaths: contract.scope.allowedPaths,
  };
}

/**
 * Main prepare-run entry point.  Loads the task by reference, verifies it is
 * executable, builds contract and prompt artifacts, writes them to their
 * run-scoped paths, and returns a summary of what was prepared.
 *
 * When `check: true` no files are written - the function validates that
 * prepare would succeed and returns the paths that would be written.
 */
export async function prepareAgentRun(
  options: PrepareAgentRunOptions,
): Promise<PrepareAgentRunResult> {
  const cwd = options.cwd ?? process.cwd();

  const record = await findTaskById(options.taskId, cwd);

  if (!record) {
    throw new PrepareError(
      "PAA001",
      `Task ${options.taskId} was not found in the project. Check that the reference is a valid 3-digit task id or phase-id/milestone-id/task-id, and that the task file exists in a planned lane.`,
    );
  }

  return prepareAgentRunFromRecord(record, options);
}
