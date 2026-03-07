export type ApiResult<T> = {
  success?: boolean;
  data?: T;
  errors?: string[];
};

export type TaskNode = {
  id: string;
  title: string;
  milestone: string;
  domain: string | null;
  status: string;
  lane: string;
};

export type CheckData = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type PhaseListData = Array<{
  id: string;
  active: boolean;
}>;

export type ArchitectureMapData = {
  summary: {
    schemaVersion: string;
    nodes: Record<string, number>;
    edges: Record<string, number>;
  };
  nodes: {
    domains: Array<{ name: string; description?: string }>;
    decisions: Array<{ id: string; title?: string; status?: string }>;
    milestones: Array<{ id: string; phaseId: string; milestoneId: string }>;
    tasks: TaskNode[];
    modules: Array<{ name: string; type?: string; description?: string }>;
  };
  edges: {
    taskToDecision: Array<{ task: string; decision: string }>;
    taskToModule: Array<{ task: string; module: string }>;
    decisionToDomain: Array<{ decision: string; domain: string }>;
    milestoneToTask: Array<{ milestone: string; task: string }>;
  };
};

export type TaskTraceData = {
  task: string;
  decisionRefs?: string[];
  moduleRefs?: string[];
  files?: string[];
};

export type FileTraceData = {
  file: string;
  module: string;
  tasks: string[];
  decisions: string[];
};

export type TaskDocumentData = {
  id: string;
  lane: string;
  path: string;
  markdown: string;
};

export type NodeFilesData = {
  type: "phase" | "milestone" | "task" | "domain" | "file";
  id: string;
  files: Array<{ path: string; content: string }>;
};

export type SearchResultItem = {
  id: string;
  kind: "task" | "decision" | "domain" | "module";
  title: string;
  subtitle?: string;
  route: string;
};

export type SearchResultData = {
  query: string;
  results: SearchResultItem[];
};

export type DomainDocsData = {
  docs: Array<{
    id: string;
    scope: "arch-domains" | "arch-model" | "architecture" | "roadmap";
    file: string;
    path: string;
    title: string;
  }>;
};

export type GraphValidationIssueData = {
  ruleId: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type GraphValidationData = {
  valid: boolean;
  errors: GraphValidationIssueData[];
  warnings: GraphValidationIssueData[];
};

export type GraphDatasetResponse = {
  dataset: GraphDataset;
  validation: GraphValidationData;
};
import type { GraphDataset } from "./graph-schema";
