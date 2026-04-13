import type { TaskRecord } from "../validation/tasks";

export type AgentAuthorizationDenialCode =
  | "task-not-planned"
  | "task-backlog"
  | "task-discovered-requires-promotion"
  | "task-remediation-requires-promotion"
  | "task-explicitly-disabled"
  | "task-already-done"
  | "task-missing-code-targets";

export type AgentExecutionBoundary = "executable" | "approval-required" | "ineligible";

export interface AgentAuthorizationDecision {
  taskId: string;
  lane: TaskRecord["lane"];
  status: TaskRecord["frontmatter"]["status"];
  authorized: boolean;
  boundary: AgentExecutionBoundary;
  requiresPromotion: boolean;
  source: "task-frontmatter";
  reasonCode?: AgentAuthorizationDenialCode;
  reason?: string;
  nextStep?: string;
}

function deny(
  record: TaskRecord,
  reasonCode: AgentAuthorizationDenialCode,
  reason: string,
  input?: {
    boundary?: AgentExecutionBoundary;
    requiresPromotion?: boolean;
    nextStep?: string;
  },
): AgentAuthorizationDecision {
  const boundary = input?.boundary ?? "ineligible";
  return {
    taskId: record.frontmatter.id,
    lane: record.lane,
    status: record.frontmatter.status,
    authorized: false,
    boundary,
    requiresPromotion: input?.requiresPromotion ?? boundary === "approval-required",
    source: "task-frontmatter",
    reasonCode,
    reason,
    nextStep: input?.nextStep,
  };
}

function isRemediationTask(record: TaskRecord): boolean {
  return record.frontmatter.tags.some((tag) => tag.toLowerCase() === "remediation");
}

function hasDeclaredExecutionSurfaces(record: TaskRecord): boolean {
  return (
    record.frontmatter.codeTargets.length > 0 ||
    (record.frontmatter.publicDocs?.length ?? 0) > 0
  );
}

export function resolveAgentWorkAuthorization(record: TaskRecord): AgentAuthorizationDecision {
  const fm = record.frontmatter;
  const explicitlyExecutable = fm.agent?.executable === true;
  const explicitlyDisabled = fm.agent?.executable === false;

  if (fm.status === "done") {
    return deny(
      record,
      "task-already-done",
      `Task ${fm.id} is already done and cannot be prepared for a new run.`,
    );
  }

  if (!hasDeclaredExecutionSurfaces(record)) {
    return deny(
      record,
      "task-missing-code-targets",
      `Task ${fm.id} has no codeTargets or publicDocs. At least one declared execution surface is required to build an execution scope.`,
    );
  }

  if (record.lane === "planned") {
    if (explicitlyDisabled) {
      return deny(
        record,
        "task-explicitly-disabled",
        `Task ${fm.id} is explicitly marked as non-executable for agent execution (agent.executable=false).`,
      );
    }

    return {
      taskId: fm.id,
      lane: record.lane,
      status: fm.status,
      authorized: true,
      boundary: "executable",
      requiresPromotion: false,
      source: "task-frontmatter",
    };
  }

  if (record.lane === "discovered") {
    if (!explicitlyExecutable) {
      if (isRemediationTask(record)) {
        return deny(
          record,
          "task-remediation-requires-promotion",
          `Task ${fm.id} is remediation work in the 'discovered' lane and requires explicit promotion (agent.executable=true) before agent execution.`,
          {
            boundary: "approval-required",
            nextStep:
              "Promote this remediation task by setting agent.executable=true after approval.",
          },
        );
      }

      return deny(
        record,
        "task-discovered-requires-promotion",
        `Task ${fm.id} is in the 'discovered' lane and requires explicit promotion (agent.executable=true) before agent execution.`,
        {
          boundary: "approval-required",
          nextStep: "Promote this task by setting agent.executable=true after approval.",
        },
      );
    }

    return {
      taskId: fm.id,
      lane: record.lane,
      status: fm.status,
      authorized: true,
      boundary: "executable",
      requiresPromotion: false,
      source: "task-frontmatter",
    };
  }

  if (record.lane === "backlog") {
    return deny(
      record,
      "task-backlog",
      `Task ${fm.id} is in the 'backlog' lane and is not executable. Move it to planned before agent execution.`,
      {
        boundary: "ineligible",
        nextStep: "Move the task into planned lane before preparing an agent run.",
      },
    );
  }

  return deny(
    record,
    "task-not-planned",
    `Task ${fm.id} is not executable in lane '${record.lane}'.`,
  );
}
