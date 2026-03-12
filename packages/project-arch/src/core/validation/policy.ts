import path from "path";
import { collectDecisionRecords } from "./decisions";
import { collectTaskRecords } from "./tasks";
import { loadPhaseManifest } from "../manifests";
import { pathExists, readJson } from "../../fs";
import {
  resolvePolicyProfile,
  type CompletionMode,
  type TimingScopePolicy,
} from "../governance/policy";
import { readMarkdownWithFrontmatter } from "../../utils/fs";

export type PolicySeverity = "error" | "warning";
export type PolicyConfidence = "high" | "medium" | "low";

export interface PolicyConflict {
  ruleId: string;
  severity: PolicySeverity;
  confidence: PolicyConfidence;
  taskRef: string;
  taskFilePath: string;
  claimA: string;
  claimB: string;
  rationale: string;
  remediation: string;
}

export interface PolicyCheckResult {
  ok: boolean;
  conflicts: PolicyConflict[];
}

interface DecisionSummary {
  id: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  scope:
    | { kind: "project" }
    | { kind: "phase"; phaseId: string }
    | { kind: "milestone"; phaseId: string; milestoneId: string };
}

interface DomainSpec {
  name: string;
  ownedPackages: string[];
}

interface ModuleSpec {
  name: string;
}

export async function runPolicyChecks(cwd = process.cwd()): Promise<PolicyCheckResult> {
  const taskRecords = await collectTaskRecords(cwd);
  const decisionRecords = await collectDecisionRecords(cwd);
  const manifest = await loadPhaseManifest(cwd);
  const policyProfile = await resolvePolicyProfile(cwd);

  const declaredModules = await loadDeclaredModules(cwd);
  const domains = await loadDomains(cwd);

  const decisionMap = new Map<string, DecisionSummary>();
  for (const record of decisionRecords) {
    decisionMap.set(record.frontmatter.id, {
      id: record.frontmatter.id,
      status: record.frontmatter.status,
      scope: record.frontmatter.scope,
    });
  }

  const domainMap = new Map<string, DomainSpec>(
    domains.map((domain) => [domain.name.toLowerCase(), domain]),
  );

  const conflicts: PolicyConflict[] = [];
  const completionCache = {
    phases: new Map<string, boolean>(),
    milestones: new Map<string, boolean>(),
  };

  for (const task of taskRecords) {
    const taskRef = `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`;
    const taskFilePath = path.relative(cwd, task.filePath).replace(/\\/g, "/");
    const runtimeModules = unique(
      task.frontmatter.codeTargets
        .map((target) => toRuntimeModule(target))
        .filter((value): value is string => value !== null),
    );

    const linkedDecisions = unique(task.frontmatter.decisions)
      .map((decisionId) => decisionMap.get(decisionId))
      .filter((value): value is DecisionSummary => value !== undefined);

    for (const decisionId of unique(task.frontmatter.decisions)) {
      const decision = decisionMap.get(decisionId);
      if (!decision) {
        continue;
      }

      if (decision.status === "rejected" || decision.status === "superseded") {
        conflicts.push({
          ruleId: "DECISION_STATUS_CONTRADICTION",
          severity: "error",
          confidence: "high",
          taskRef,
          taskFilePath,
          claimA: `Task links decision '${decision.id}' as governing input`,
          claimB: `Decision '${decision.id}' has status '${decision.status}'`,
          rationale:
            "Tasks should not rely on rejected or superseded decisions because they are no longer valid architecture authority.",
          remediation:
            "Replace or remove the decision link in task frontmatter, or link an accepted/proposed replacement decision.",
        });
      }

      if (decision.scope.kind === "phase" && decision.scope.phaseId !== task.phaseId) {
        conflicts.push({
          ruleId: "DECISION_SCOPE_CONTRADICTION",
          severity: "error",
          confidence: "high",
          taskRef,
          taskFilePath,
          claimA: `Task is scoped to phase '${task.phaseId}'`,
          claimB: `Linked decision '${decision.id}' is scoped to phase '${decision.scope.phaseId}'`,
          rationale: "Phase-scoped decisions must only govern tasks within the same phase.",
          remediation: `Relink to a decision scoped to '${task.phaseId}' (or project scope), or move the task to '${decision.scope.phaseId}'.`,
        });
      }

      if (
        decision.scope.kind === "milestone" &&
        (decision.scope.phaseId !== task.phaseId || decision.scope.milestoneId !== task.milestoneId)
      ) {
        conflicts.push({
          ruleId: "DECISION_SCOPE_CONTRADICTION",
          severity: "error",
          confidence: "high",
          taskRef,
          taskFilePath,
          claimA: `Task is scoped to '${task.phaseId}/${task.milestoneId}'`,
          claimB: `Linked decision '${decision.id}' is scoped to '${decision.scope.phaseId}/${decision.scope.milestoneId}'`,
          rationale: "Milestone-scoped decisions must only govern tasks in the same milestone.",
          remediation:
            "Relink to a decision in the same milestone (or broader valid scope), or move the task to the decision milestone.",
        });
      }
    }

    for (const moduleName of runtimeModules) {
      if (!declaredModules.has(moduleName)) {
        conflicts.push({
          ruleId: "ARCHITECTURE_BOUNDARY_VIOLATION",
          severity: "error",
          confidence: "high",
          taskRef,
          taskFilePath,
          claimA: `Task targets module '${moduleName}'`,
          claimB: `Module '${moduleName}' is not declared in arch-model/modules.json`,
          rationale:
            "Code targets outside the declared architecture model violate boundary governance and bypass architecture review.",
          remediation:
            "Declare the module in arch-model/modules.json before implementation, or update task codeTargets to declared modules.",
        });
      }
    }

    const hasLinkedArchitectureDecision = linkedDecisions.some(
      (decision) => decision.status === "accepted" || decision.status === "proposed",
    );

    for (const moduleName of runtimeModules) {
      if (!declaredModules.has(moduleName) && !hasLinkedArchitectureDecision) {
        conflicts.push({
          ruleId: "CONCEPT_CREATION_WITHOUT_DECISION",
          severity: "error",
          confidence: "high",
          taskRef,
          taskFilePath,
          claimA: `Task introduces undeclared module '${moduleName}'`,
          claimB: "Task has no linked accepted/proposed architecture decision",
          rationale:
            "Creating new architecture concepts (such as a new module) requires an explicit decision trail.",
          remediation:
            "Create and link an architecture decision, then declare the module in arch-model/modules.json before execution.",
        });
      }
    }

    const domainTags = unique(
      task.frontmatter.tags
        .map((tag) => parseDomainTag(tag))
        .filter((value): value is string => value !== null),
    );

    for (const domainName of domainTags) {
      const domain = domainMap.get(domainName.toLowerCase());
      if (!domain) {
        continue;
      }

      for (const moduleName of runtimeModules) {
        if (!domain.ownedPackages.includes(moduleName)) {
          conflicts.push({
            ruleId: "DOMAIN_OWNERSHIP_VIOLATION",
            severity: "error",
            confidence: "high",
            taskRef,
            taskFilePath,
            claimA: `Task tagged domain '${domain.name}' targets module '${moduleName}'`,
            claimB: `Domain '${domain.name}' owns: ${domain.ownedPackages.join(", ") || "(none)"}`,
            rationale:
              "Domain tags must align with declared ownership boundaries to prevent cross-domain implementation drift.",
            remediation: `Retag the task with the correct domain or update arch-domains/domains.json ownership for '${domain.name}'.`,
          });
        }
      }
    }

    if (
      manifest.activePhase &&
      shouldEnforceTiming(
        task.frontmatter.status,
        policyProfile.timing.phase,
        await isCompletedPhase(
          task.phaseId,
          taskRecords,
          cwd,
          policyProfile.timing.phase.completionMode,
          completionCache.phases,
        ),
      ) &&
      task.phaseId !== manifest.activePhase
    ) {
      conflicts.push({
        ruleId: "TIMING_CONFLICT",
        severity: "warning",
        confidence: "medium",
        taskRef,
        taskFilePath,
        claimA: `Task status is '${task.frontmatter.status}' in phase '${task.phaseId}'`,
        claimB: `Active phase is '${manifest.activePhase}'`,
        rationale:
          "Execution timing policy expects configured in-scope work to align with the active phase unless explicitly staged.",
        remediation:
          "Activate the matching phase or move the task to the currently active phase before continuing execution.",
      });
    }

    if (
      manifest.activePhase === task.phaseId &&
      manifest.activeMilestone &&
      shouldEnforceTiming(
        task.frontmatter.status,
        policyProfile.timing.milestone,
        await isCompletedMilestone(
          task.phaseId,
          task.milestoneId,
          taskRecords,
          cwd,
          policyProfile.timing.milestone.completionMode,
          completionCache.milestones,
        ),
      ) &&
      task.milestoneId !== manifest.activeMilestone
    ) {
      conflicts.push({
        ruleId: "TIMING_CONFLICT",
        severity: "warning",
        confidence: "medium",
        taskRef,
        taskFilePath,
        claimA: `Task status is '${task.frontmatter.status}' in milestone '${task.milestoneId}'`,
        claimB: `Active milestone is '${manifest.activeMilestone}'`,
        rationale:
          "Execution timing policy expects configured in-scope work to align with the active milestone to preserve deterministic sequencing.",
        remediation:
          "Activate the matching milestone or return task status to 'todo' until the milestone becomes active.",
      });
    }
  }

  const deduped = dedupeConflicts(conflicts).sort(compareConflicts);
  return {
    ok: deduped.length === 0,
    conflicts: deduped,
  };
}

function shouldEnforceTiming(
  status: string,
  scopePolicy: TimingScopePolicy,
  isCompletedContainer: boolean,
): boolean {
  if (
    !scopePolicy.enforceStatuses.includes(status as TimingScopePolicy["enforceStatuses"][number])
  ) {
    return false;
  }

  if (status === "done" && scopePolicy.skipDoneIfCompletedContainer && isCompletedContainer) {
    return false;
  }

  return true;
}

async function isCompletedPhase(
  phaseId: string,
  taskRecords: Array<{ phaseId: string; frontmatter: { status: string } }>,
  cwd: string,
  completionMode: CompletionMode,
  cache: Map<string, boolean>,
): Promise<boolean> {
  if (cache.has(phaseId)) {
    return cache.get(phaseId) ?? false;
  }

  const metadataComplete = await isOverviewCompleted(
    path.join(cwd, "roadmap", "phases", phaseId, "overview.md"),
  );
  const tasksComplete = areAllTasksDone(taskRecords.filter((task) => task.phaseId === phaseId));
  const completed = evaluateCompletionMode(completionMode, metadataComplete, tasksComplete);
  cache.set(phaseId, completed);
  return completed;
}

async function isCompletedMilestone(
  phaseId: string,
  milestoneId: string,
  taskRecords: Array<{
    phaseId: string;
    milestoneId: string;
    frontmatter: { status: string };
  }>,
  cwd: string,
  completionMode: CompletionMode,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const key = `${phaseId}/${milestoneId}`;
  if (cache.has(key)) {
    return cache.get(key) ?? false;
  }

  const metadataComplete = await isOverviewCompleted(
    path.join(cwd, "roadmap", "phases", phaseId, "milestones", milestoneId, "overview.md"),
  );
  const tasksComplete = areAllTasksDone(
    taskRecords.filter((task) => task.phaseId === phaseId && task.milestoneId === milestoneId),
  );
  const completed = evaluateCompletionMode(completionMode, metadataComplete, tasksComplete);
  cache.set(key, completed);
  return completed;
}

async function isOverviewCompleted(filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) {
    return false;
  }

  try {
    const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);
    return parsed.data.status === "completed";
  } catch {
    return false;
  }
}

function areAllTasksDone(tasks: Array<{ frontmatter: { status: string } }>): boolean {
  if (tasks.length === 0) {
    return false;
  }

  return tasks.every((task) => task.frontmatter.status === "done");
}

function evaluateCompletionMode(
  completionMode: CompletionMode,
  metadataComplete: boolean,
  allTasksDone: boolean,
): boolean {
  if (completionMode === "metadata_only") {
    return metadataComplete;
  }
  if (completionMode === "all_tasks_done") {
    return allTasksDone;
  }
  return metadataComplete || allTasksDone;
}

export function renderPolicyExplanation(conflicts: PolicyConflict[]): string {
  if (conflicts.length === 0) {
    return "No policy conflicts detected.";
  }

  const lines: string[] = [];
  lines.push("Policy Conflict Analysis");
  lines.push("");

  for (const conflict of conflicts) {
    lines.push(`[${conflict.severity.toUpperCase()}] ${conflict.ruleId} (${conflict.confidence})`);
    lines.push(`  Task: ${conflict.taskRef}`);
    lines.push(`  File: ${conflict.taskFilePath}`);
    lines.push(`  Claim A: ${conflict.claimA}`);
    lines.push(`  Claim B: ${conflict.claimB}`);
    lines.push(`  Rationale: ${conflict.rationale}`);
    lines.push(`  Remediation: ${conflict.remediation}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function loadDeclaredModules(cwd: string): Promise<Set<string>> {
  const modulesPath = path.join(cwd, "arch-model", "modules.json");
  if (!(await pathExists(modulesPath))) {
    return new Set();
  }

  const raw = await readJson<{ modules?: unknown }>(modulesPath);
  const modules = Array.isArray(raw.modules)
    ? raw.modules
        .filter(
          (item): item is ModuleSpec =>
            !!item && typeof item === "object" && typeof (item as ModuleSpec).name === "string",
        )
        .map((item) => item.name)
    : [];

  return new Set(modules);
}

async function loadDomains(cwd: string): Promise<DomainSpec[]> {
  const domainsPath = path.join(cwd, "arch-domains", "domains.json");
  if (!(await pathExists(domainsPath))) {
    return [];
  }

  const raw = await readJson<{ domains?: unknown }>(domainsPath);
  if (!Array.isArray(raw.domains)) {
    return [];
  }

  return raw.domains
    .filter(
      (item): item is { name: string; ownedPackages?: unknown } =>
        !!item && typeof item === "object" && typeof item.name === "string",
    )
    .map((item) => ({
      name: item.name,
      ownedPackages: Array.isArray(item.ownedPackages)
        ? item.ownedPackages.filter((value): value is string => typeof value === "string")
        : [],
    }));
}

function parseDomainTag(tag: string): string | null {
  const normalized = tag.toLowerCase();
  if (!normalized.startsWith("domain:")) {
    return null;
  }
  const value = normalized.slice("domain:".length).trim();
  return value.length > 0 ? value : null;
}

function toRuntimeModule(target: string): string | null {
  const normalized = target.replace(/\\/g, "/");
  if (!normalized.startsWith("apps/") && !normalized.startsWith("packages/")) {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function dedupeConflicts(conflicts: PolicyConflict[]): PolicyConflict[] {
  const seen = new Set<string>();
  const deduped: PolicyConflict[] = [];

  for (const conflict of conflicts) {
    const key = [
      conflict.ruleId,
      conflict.taskRef,
      conflict.claimA,
      conflict.claimB,
      conflict.remediation,
    ].join("||");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(conflict);
  }

  return deduped;
}

function compareConflicts(left: PolicyConflict, right: PolicyConflict): number {
  return (
    left.ruleId.localeCompare(right.ruleId) ||
    left.taskRef.localeCompare(right.taskRef) ||
    left.claimA.localeCompare(right.claimA) ||
    left.claimB.localeCompare(right.claimB)
  );
}
