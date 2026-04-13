export const AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION = "2.0" as const;

export interface AgentRuntimeCommandResultBase {
  schemaVersion: typeof AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION;
  runId: string;
  taskId: string;
}
