import path from "path";
import { readJson, pathExists } from "../../utils/fs";
import { agentTaskContractSchema, type AgentTaskContract } from "../../schemas/agentTaskContract";
import { agentResultBundleSchema, type AgentResultBundle } from "../../schemas/agentResultBundle";
import {
  reconciliationReportSchema,
  type ReconciliationReport,
} from "../../schemas/reconciliationReport";
import { agentEscalationDraftSchema } from "../../schemas/agentEscalationDraft";
import {
  readAgentRunRecord,
  agentRunRecordPath,
  deriveAgentRunReviewStatus,
  type AgentRunRecord,
  type AgentRunReviewStatus,
} from "./runRecord";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION, type AgentRuntimeCommandResultBase } from "./output";
import { agentContractPath, agentPromptPath, toPosixRelativePath } from "./paths";
import { appendAgentAuditEvent } from "./audit";
import {
  readOrchestrationRecord,
  orchestrationRecordPath,
  type AgentOrchestrationRecord,
} from "./orchestration";

export class RunReviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunReviewError";
  }
}

export interface GetAgentRunReviewOptions {
  runId: string;
  cwd?: string;
}

export interface AgentRunArtifactReference {
  path: string;
  exists: boolean;
}

export interface GetAgentRunReviewResult extends AgentRuntimeCommandResultBase {
  status: "review-ready";
  reviewStatus: AgentRunReviewStatus;
  runRecordPath: string;
  artifacts: {
    runRecord: AgentRunArtifactReference;
    contract?: AgentRunArtifactReference;
    prompt: AgentRunArtifactReference;
    result: AgentRunArtifactReference;
    escalationDrafts?: AgentRunArtifactReference[];
    reconciliationReport?: AgentRunArtifactReference;
    reconciliationMarkdown?: AgentRunArtifactReference;
    orchestrationRecord?: AgentRunArtifactReference;
  };
  missingArtifacts: string[];
  runRecord: AgentRunRecord;
  contract?: AgentTaskContract;
  prompt?: string;
  result?: AgentResultBundle;
  reconciliationReport?: ReconciliationReport;
  orchestrationRecord?: AgentOrchestrationRecord;
}

function resolveRepoPath(cwd: string, relativePath: string): string {
  return path.resolve(cwd, relativePath);
}

function markdownPathFromJson(reportPath: string): string {
  return reportPath.endsWith(".json") ? `${reportPath.slice(0, -5)}.md` : `${reportPath}.md`;
}

export async function getAgentRunReview(
  options: GetAgentRunReviewOptions,
): Promise<GetAgentRunReviewResult> {
  const cwd = options.cwd ?? process.cwd();

  try {
    let runRecord: AgentRunRecord;
    try {
      runRecord = await readAgentRunRecord(options.runId, cwd);
    } catch {
      throw new RunReviewError(
        "PAA002",
        `Run record not found for run ${options.runId}. Expected .project-arch/agent-runtime/runs/${options.runId}.json.`,
      );
    }

    const runRecordPathRel = toPosixRelativePath(cwd, agentRunRecordPath(options.runId, cwd));
    const promptPathRel = toPosixRelativePath(cwd, agentPromptPath(options.runId, cwd));
    const contractPathRel =
      runRecord.contractPath ?? toPosixRelativePath(cwd, agentContractPath(options.runId, cwd));
    const resultPathRel = runRecord.resultPath;
    const reconciliationReportPathRel = runRecord.reconciliationReportPath;
    const reconciliationMarkdownPathRel = reconciliationReportPathRel
      ? markdownPathFromJson(reconciliationReportPathRel)
      : undefined;
    const escalationDraftPathsRel = runRecord.escalationDraftPaths ?? [];
    const orchestrationPathRel = toPosixRelativePath(
      cwd,
      orchestrationRecordPath(options.runId, cwd),
    );

    const contractExists = await pathExists(resolveRepoPath(cwd, contractPathRel));
    const promptExists = await pathExists(resolveRepoPath(cwd, promptPathRel));
    const resultExists = await pathExists(resolveRepoPath(cwd, resultPathRel));
    const reconciliationReportExists = reconciliationReportPathRel
      ? await pathExists(resolveRepoPath(cwd, reconciliationReportPathRel))
      : false;
    const reconciliationMarkdownExists = reconciliationMarkdownPathRel
      ? await pathExists(resolveRepoPath(cwd, reconciliationMarkdownPathRel))
      : false;
    const escalationDrafts = await Promise.all(
      escalationDraftPathsRel.map(async (draftPath) => ({
        path: draftPath,
        exists: await pathExists(resolveRepoPath(cwd, draftPath)),
      })),
    );
    const orchestrationExists = await pathExists(resolveRepoPath(cwd, orchestrationPathRel));
    const invalidEscalationDrafts: string[] = [];
    for (const draft of escalationDrafts) {
      if (!draft.exists || !draft.path.endsWith(".json")) {
        continue;
      }
      try {
        agentEscalationDraftSchema.parse(await readJson<unknown>(resolveRepoPath(cwd, draft.path)));
      } catch {
        invalidEscalationDrafts.push(draft.path);
      }
    }

    const missingArtifacts: string[] = [];
    if (!contractExists) {
      missingArtifacts.push("contract");
    }
    if (!promptExists) {
      missingArtifacts.push("prompt");
    }
    if (!resultExists) {
      missingArtifacts.push("result");
    }
    if (reconciliationReportPathRel && !reconciliationReportExists) {
      missingArtifacts.push("reconciliation-report");
    }
    if (reconciliationMarkdownPathRel && !reconciliationMarkdownExists) {
      missingArtifacts.push("reconciliation-markdown");
    }
    for (const draft of escalationDrafts) {
      if (!draft.exists) {
        missingArtifacts.push(`escalation-draft:${draft.path}`);
      }
    }
    for (const invalidDraftPath of invalidEscalationDrafts) {
      missingArtifacts.push(`escalation-draft-invalid:${invalidDraftPath}`);
    }

    const contract = contractExists
      ? agentTaskContractSchema.parse(
          await readJson<unknown>(resolveRepoPath(cwd, contractPathRel)),
        )
      : undefined;
    const result = resultExists
      ? agentResultBundleSchema.parse(await readJson<unknown>(resolveRepoPath(cwd, resultPathRel)))
      : undefined;
    const reconciliationReport =
      reconciliationReportExists && reconciliationReportPathRel
        ? reconciliationReportSchema.parse(
            await readJson<unknown>(resolveRepoPath(cwd, reconciliationReportPathRel)),
          )
        : undefined;
    const prompt = promptExists
      ? await (
          await import("fs-extra")
        ).default.readFile(resolveRepoPath(cwd, promptPathRel), "utf8")
      : undefined;
    const orchestrationRecord = orchestrationExists
      ? await readOrchestrationRecord(options.runId, cwd)
      : undefined;

    const reviewResult: GetAgentRunReviewResult = {
      schemaVersion: AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION,
      runId: runRecord.runId,
      taskId: runRecord.taskId,
      status: "review-ready",
      reviewStatus: deriveAgentRunReviewStatus(runRecord),
      runRecordPath: runRecordPathRel,
      artifacts: {
        runRecord: { path: runRecordPathRel, exists: true },
        contract: { path: contractPathRel, exists: contractExists },
        prompt: { path: promptPathRel, exists: promptExists },
        result: { path: resultPathRel, exists: resultExists },
        escalationDrafts,
        reconciliationReport: reconciliationReportPathRel
          ? { path: reconciliationReportPathRel, exists: reconciliationReportExists }
          : undefined,
        reconciliationMarkdown: reconciliationMarkdownPathRel
          ? { path: reconciliationMarkdownPathRel, exists: reconciliationMarkdownExists }
          : undefined,
        orchestrationRecord: { path: orchestrationPathRel, exists: orchestrationExists },
      },
      missingArtifacts,
      runRecord,
      contract,
      prompt,
      result,
      reconciliationReport,
      orchestrationRecord,
    };

    await appendAgentAuditEvent(
      {
        command: "review",
        status: "success",
        runId: reviewResult.runId,
        taskId: reviewResult.taskId,
        metadata: {
          reviewStatus: reviewResult.reviewStatus,
          missingArtifacts: reviewResult.missingArtifacts.length,
        },
      },
      cwd,
    );

    return reviewResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendAgentAuditEvent(
      {
        command: "review",
        status: "error",
        runId: options.runId,
        message,
      },
      cwd,
    ).catch(() => undefined);
    throw error;
  }
}
