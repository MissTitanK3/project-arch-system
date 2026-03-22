import path from "path";
import { readJson, pathExists } from "../../utils/fs";
import { DecisionRecord } from "../../core/validation/decisions";
import { TaskRecord } from "../../core/validation/tasks";
import type { DriftFinding } from "./runChecks";

interface DecisionNodesPayload {
  decisions?: Array<{ id?: unknown }>;
}

interface DomainNodesPayload {
  domains?: Array<{ name?: unknown }>;
}

interface DecisionToDomainEdgesPayload {
  edges?: Array<{ decision?: unknown; domain?: unknown }>;
}

export interface GraphCompletenessSummary {
  totalDecisionNodes: number;
  connectedDecisionNodes: number;
  score: number;
  threshold: number;
  sufficient: boolean;
}

export interface DisconnectedNodeReport {
  decisionsWithoutDomain: string[];
  decisionsWithoutTaskBackReferences: string[];
  domainsWithoutDecisions: string[];
  taskReferencesToMissingDecisions: Array<{ task: string; decision: string }>;
}

export interface DecisionCompletenessCheckResult {
  findings: DriftFinding[];
  summary: GraphCompletenessSummary;
  disconnected: DisconnectedNodeReport;
}

export async function checkDecisionCompleteness(
  cwd: string,
  taskRecords: TaskRecord[],
  decisionRecords: DecisionRecord[],
  threshold: number,
): Promise<DecisionCompletenessCheckResult> {
  const findings: DriftFinding[] = [];

  const decisionNodesPath = path.join(cwd, ".arch", "nodes", "decisions.json");
  const domainNodesPath = path.join(cwd, ".arch", "nodes", "domains.json");
  const decisionToDomainPath = path.join(cwd, ".arch", "edges", "decision_to_domain.json");

  const hasGraphArtifacts =
    (await pathExists(decisionNodesPath)) &&
    (await pathExists(domainNodesPath)) &&
    (await pathExists(decisionToDomainPath));

  if (!hasGraphArtifacts) {
    return {
      findings: [
        {
          severity: "warning",
          code: "DECISION_COMPLETENESS_SKIPPED",
          message:
            "Decision completeness checks skipped because graph artifacts are incomplete (.arch/nodes/decisions.json, .arch/nodes/domains.json, .arch/edges/decision_to_domain.json).",
        },
      ],
      summary: {
        totalDecisionNodes: 0,
        connectedDecisionNodes: 0,
        score: 100,
        threshold,
        sufficient: true,
      },
      disconnected: {
        decisionsWithoutDomain: [],
        decisionsWithoutTaskBackReferences: [],
        domainsWithoutDecisions: [],
        taskReferencesToMissingDecisions: [],
      },
    };
  }

  const decisionNodesRaw = await readJson<DecisionNodesPayload>(decisionNodesPath);
  const domainNodesRaw = await readJson<DomainNodesPayload>(domainNodesPath);
  const decisionToDomainRaw = await readJson<DecisionToDomainEdgesPayload>(decisionToDomainPath);

  const decisionNodeIds = (decisionNodesRaw.decisions ?? [])
    .map((decision) => (typeof decision.id === "string" ? decision.id : null))
    .filter((decisionId): decisionId is string => decisionId !== null)
    .sort((a, b) => a.localeCompare(b));

  const domainNames = (domainNodesRaw.domains ?? [])
    .map((domain) => (typeof domain.name === "string" ? domain.name : null))
    .filter((name): name is string => name !== null)
    .sort((a, b) => a.localeCompare(b));

  const decisionToDomainEdges = (decisionToDomainRaw.edges ?? [])
    .map((edge) =>
      typeof edge.decision === "string" && typeof edge.domain === "string"
        ? { decision: edge.decision, domain: edge.domain }
        : null,
    )
    .filter((edge): edge is { decision: string; domain: string } => edge !== null);

  const decisionIdsWithDomain = new Set(decisionToDomainEdges.map((edge) => edge.decision));
  const domainsWithDecisions = new Set(decisionToDomainEdges.map((edge) => edge.domain));

  const knownDecisionIds = new Set(decisionRecords.map((record) => record.frontmatter.id));
  const decisionsReferencedByTasks = new Set<string>();
  const taskReferencesToMissingDecisions: Array<{ task: string; decision: string }> = [];

  for (const task of taskRecords) {
    const taskRef = `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`;
    for (const decisionId of task.frontmatter.decisions) {
      decisionsReferencedByTasks.add(decisionId);
      if (!knownDecisionIds.has(decisionId)) {
        taskReferencesToMissingDecisions.push({ task: taskRef, decision: decisionId });
      }
    }
  }

  const decisionsWithoutDomain = decisionNodeIds.filter(
    (decisionId) => !decisionIdsWithDomain.has(decisionId),
  );
  const decisionsWithoutTaskBackReferences = decisionNodeIds.filter(
    (decisionId) => !decisionsReferencedByTasks.has(decisionId),
  );
  const domainsWithoutDecisions = domainNames.filter((domain) => !domainsWithDecisions.has(domain));

  const connectedDecisionNodes = decisionNodeIds.length - decisionsWithoutDomain.length;
  const totalDecisionNodes = decisionNodeIds.length;
  const score =
    totalDecisionNodes === 0
      ? 100
      : Number(((connectedDecisionNodes / totalDecisionNodes) * 100).toFixed(2));
  const sufficient = score >= threshold;

  if (decisionsWithoutDomain.length > 0) {
    findings.push({
      severity: "warning",
      code: "DECISION_DOMAIN_LINK_MISSING",
      message: `${decisionsWithoutDomain.length} decision node(s) are not linked to any domain: ${decisionsWithoutDomain.join(", ")}`,
    });
  }

  if (taskReferencesToMissingDecisions.length > 0) {
    const sample = taskReferencesToMissingDecisions
      .slice(0, 5)
      .map((entry) => `${entry.task} -> ${entry.decision}`)
      .join(", ");
    findings.push({
      severity: "warning",
      code: "TASK_DECISION_ID_UNRESOLVED",
      message: `${taskReferencesToMissingDecisions.length} task decision reference(s) do not resolve to known decision files: ${sample}${taskReferencesToMissingDecisions.length > 5 ? ", ..." : ""}`,
    });
  }

  if (decisionsWithoutTaskBackReferences.length > 0) {
    findings.push({
      severity: "warning",
      code: "DECISION_TASK_BACKREF_MISSING",
      message: `${decisionsWithoutTaskBackReferences.length} decision node(s) have no task back-references: ${decisionsWithoutTaskBackReferences.join(", ")}`,
    });
  }

  if (domainsWithoutDecisions.length > 0) {
    findings.push({
      severity: "warning",
      code: "DOMAIN_DECISION_LINK_MISSING",
      message: `${domainsWithoutDecisions.length} domain node(s) have no linked decisions: ${domainsWithoutDecisions.join(", ")}`,
    });
  }

  if (!sufficient) {
    findings.push({
      severity: "error",
      code: "GRAPH_COMPLETENESS_BELOW_THRESHOLD",
      message: `Decision-domain completeness ${score.toFixed(2)}% (${connectedDecisionNodes}/${totalDecisionNodes}) is below threshold ${threshold.toFixed(2)}%.`,
    });
  }

  return {
    findings,
    summary: {
      totalDecisionNodes,
      connectedDecisionNodes,
      score,
      threshold,
      sufficient,
    },
    disconnected: {
      decisionsWithoutDomain,
      decisionsWithoutTaskBackReferences,
      domainsWithoutDecisions,
      taskReferencesToMissingDecisions,
    },
  };
}
