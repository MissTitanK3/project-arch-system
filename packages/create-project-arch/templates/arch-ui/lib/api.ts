import {
  ApiResult,
  ArchitectureMapData,
  CheckData,
  DomainDocsData,
  FileTraceData,
  GraphDatasetResponse,
  NodeFilesData,
  PhaseListData,
  SearchResultData,
  TaskDocumentData,
  TaskNode,
  TaskTraceData,
} from "./types";

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function unwrap<T>(value: ApiResult<T> | T): T {
  if (typeof value === "object" && value !== null && "success" in value) {
    const result = value as ApiResult<T>;
    if (result.success === false) {
      throw new Error(result.errors?.join("; ") ?? "Request failed");
    }
    if (result.data === undefined) {
      throw new Error("Missing data payload");
    }
    return result.data;
  }
  return value as T;
}

export async function getHealth(): Promise<CheckData> {
  return unwrap(await readJson<ApiResult<CheckData>>("/api/health"));
}

export async function getArchitectureMap(): Promise<ArchitectureMapData> {
  return await readJson<ArchitectureMapData>("/api/architecture/map");
}

export async function getDomains(): Promise<{
  domains: Array<{ name: string; description?: string; ownedPackages?: string[] }>;
}> {
  return await readJson<{
    domains: Array<{ name: string; description?: string; ownedPackages?: string[] }>;
  }>("/api/domains");
}

export async function getPhases(): Promise<PhaseListData> {
  return unwrap(await readJson<ApiResult<PhaseListData>>("/api/phases"));
}

export async function getTasks(): Promise<{ tasks: TaskNode[] }> {
  return await readJson<{ tasks: TaskNode[] }>("/api/tasks");
}

export async function getTaskTrace(taskId: string): Promise<TaskTraceData> {
  return await readJson<TaskTraceData>(`/api/trace/task/${encodeURIComponent(taskId)}`);
}

export async function getFileTrace(filePath: string): Promise<FileTraceData> {
  return await readJson<FileTraceData>(`/api/trace/file?path=${encodeURIComponent(filePath)}`);
}

export async function getTaskDocument(taskId: string): Promise<TaskDocumentData> {
  return await readJson<TaskDocumentData>(`/api/task-doc/${encodeURIComponent(taskId)}`);
}

export async function getNodeFiles(
  type: "phase" | "milestone" | "task" | "domain" | "file",
  id: string,
): Promise<NodeFilesData> {
  return await readJson<NodeFilesData>(
    `/api/node-files?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
  );
}

export async function searchWorkspace(query: string): Promise<SearchResultData> {
  return await readJson<SearchResultData>(`/api/search?q=${encodeURIComponent(query)}`);
}

export async function getDomainDocs(): Promise<DomainDocsData> {
  return await readJson<DomainDocsData>("/api/domain-docs");
}

export async function getGraphDataset(): Promise<GraphDatasetResponse> {
  return await readJson<GraphDatasetResponse>("/api/graph");
}
