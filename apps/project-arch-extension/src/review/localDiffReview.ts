import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
} from "../integration/projectArchBoundary";
import { LOCAL_WORKFLOW_STATE_KEY } from "../activation";
import type { LocalTaskWorkflowState } from "../workflows/localTaskWorkflow";

export interface DiffFirstReviewModel {
  taskRef: string;
  runId: string;
  changedFiles: string[];
  reportPath?: string;
  reportMarkdownPath?: string;
  runRecordPath?: string;
}

export async function buildDiffFirstReviewModel(input: {
  context: Pick<{ workspaceState: { get<T>(key: string): T | undefined } }, "workspaceState">;
  boundary?: ProjectArchBoundary;
  cwd?: string;
}): Promise<DiffFirstReviewModel> {
  const boundary = input.boundary ?? createProjectArchBoundary();
  const cwd = input.cwd ?? process.cwd();

  const workflow =
    input.context.workspaceState.get<LocalTaskWorkflowState>(LOCAL_WORKFLOW_STATE_KEY);
  if (!workflow) {
    throw new Error("No local workflow state is available. Run Implement Task first.");
  }

  if (workflow.action !== "implement") {
    throw new Error("Latest local workflow is not an implement run. Run Implement Task first.");
  }

  const resultPath = workflow.artifacts.resultPath;
  if (!resultPath) {
    throw new Error("Result artifact path is missing from local workflow state.");
  }

  const absoluteResultPath = path.resolve(cwd, resultPath);
  const rawResult = await fs.readFile(absoluteResultPath, "utf8");
  const parsedResult = boundary.parseResultBundle(JSON.parse(rawResult));

  return {
    taskRef: workflow.taskRef,
    runId: workflow.runId,
    changedFiles: [...new Set(parsedResult.changedFiles)],
    reportPath: workflow.artifacts.reportPath,
    reportMarkdownPath: workflow.artifacts.reportMarkdownPath,
    runRecordPath: workflow.artifacts.runRecordPath,
  };
}
