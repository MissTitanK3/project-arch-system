import { z } from "zod";

import {
  agentRoleOrchestrationContractSchema,
  agentEscalationRequestSchema,
  agentRuntimeAdapterRegistrationSchema,
  agentRuntimeLaunchInputSchema,
  agentRuntimeLaunchRecordSchema,
  agentRuntimeLaunchResultSchema,
  agentResultBundleSchema,
  agentTaskContractSchema,
  runtimeInventoryListResultSchema,
  runtimeReadinessCheckResultSchema,
  type AgentRoleOrchestrationContract,
  type AgentEscalationRequest,
  type AgentRuntimeAdapterRegistration,
  type AgentRuntimeLaunchInput,
  type AgentRuntimeLaunchRecord,
  type AgentRuntimeLaunchResult,
  type AgentResultBundle,
  type AgentTaskContract,
  type RuntimeInventoryListResult,
  type RuntimeReadinessCheckResult,
} from "../schemas/agentContracts";

export * from "../schemas/agentContracts";

export const agentContractArtifactKindSchema = z.enum([
  "task-contract",
  "result-bundle",
  "escalation-request",
  "runtime-adapter-registration",
  "runtime-launch-input",
  "runtime-launch-record",
  "runtime-launch-result",
  "role-orchestration-contract",
  "runtime-inventory-list-result",
  "runtime-readiness-check-result",
]);
export type AgentContractArtifactKind = z.infer<typeof agentContractArtifactKindSchema>;

export type AgentContractArtifactByKind = {
  "task-contract": AgentTaskContract;
  "result-bundle": AgentResultBundle;
  "escalation-request": AgentEscalationRequest;
  "runtime-adapter-registration": AgentRuntimeAdapterRegistration;
  "runtime-launch-input": AgentRuntimeLaunchInput;
  "runtime-launch-record": AgentRuntimeLaunchRecord;
  "runtime-launch-result": AgentRuntimeLaunchResult;
  "role-orchestration-contract": AgentRoleOrchestrationContract;
  "runtime-inventory-list-result": RuntimeInventoryListResult;
  "runtime-readiness-check-result": RuntimeReadinessCheckResult;
};

export type AgentContractArtifact = AgentContractArtifactByKind[AgentContractArtifactKind];

export const agentContractArtifactKinds = agentContractArtifactKindSchema.options;

export const agentContractAdditiveTaskContextFieldPathSchema = z.enum([
  "architectureContext.externalStandards",
]);
export type AgentContractAdditiveTaskContextFieldPath = z.infer<
  typeof agentContractAdditiveTaskContextFieldPathSchema
>;

export const agentContractAdditiveTaskContextFieldPaths =
  agentContractAdditiveTaskContextFieldPathSchema.options;

export const agentContractConsumptionSchemas = {
  "task-contract": agentTaskContractSchema,
  "result-bundle": agentResultBundleSchema,
  "escalation-request": agentEscalationRequestSchema,
  "runtime-adapter-registration": agentRuntimeAdapterRegistrationSchema,
  "runtime-launch-input": agentRuntimeLaunchInputSchema,
  "runtime-launch-record": agentRuntimeLaunchRecordSchema,
  "runtime-launch-result": agentRuntimeLaunchResultSchema,
  "role-orchestration-contract": agentRoleOrchestrationContractSchema,
  "runtime-inventory-list-result": runtimeInventoryListResultSchema,
  "runtime-readiness-check-result": runtimeReadinessCheckResultSchema,
} as const;

export function parseAgentContractArtifact<K extends AgentContractArtifactKind>(
  kind: K,
  input: unknown,
): AgentContractArtifactByKind[K] {
  return agentContractConsumptionSchemas[kind].parse(input) as AgentContractArtifactByKind[K];
}

export function parseAgentExtensionCliJsonArtifact<K extends AgentContractArtifactKind>(
  kind: K,
  input: unknown,
): AgentContractArtifactByKind[K] {
  return parseAgentContractArtifact(kind, input);
}

export function safeParseAgentContractArtifact<K extends AgentContractArtifactKind>(
  kind: K,
  input: unknown,
): z.SafeParseReturnType<unknown, AgentContractArtifactByKind[K]> {
  return agentContractConsumptionSchemas[kind].safeParse(input) as z.SafeParseReturnType<
    unknown,
    AgentContractArtifactByKind[K]
  >;
}

export function isAgentContractArtifact<K extends AgentContractArtifactKind>(
  kind: K,
  input: unknown,
): input is AgentContractArtifactByKind[K] {
  return safeParseAgentContractArtifact(kind, input).success;
}

export function parseAgentTaskContract(input: unknown): AgentTaskContract {
  return parseAgentContractArtifact("task-contract", input);
}

export function safeParseAgentTaskContract(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentTaskContract> {
  return safeParseAgentContractArtifact("task-contract", input);
}

export function isAgentTaskContract(input: unknown): input is AgentTaskContract {
  return isAgentContractArtifact("task-contract", input);
}

export function parseAgentResultBundle(input: unknown): AgentResultBundle {
  return parseAgentContractArtifact("result-bundle", input);
}

export function safeParseAgentResultBundle(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentResultBundle> {
  return safeParseAgentContractArtifact("result-bundle", input);
}

export function isAgentResultBundle(input: unknown): input is AgentResultBundle {
  return isAgentContractArtifact("result-bundle", input);
}

export function parseAgentEscalationRequest(input: unknown): AgentEscalationRequest {
  return parseAgentContractArtifact("escalation-request", input);
}

export function safeParseAgentEscalationRequest(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentEscalationRequest> {
  return safeParseAgentContractArtifact("escalation-request", input);
}

export function isAgentEscalationRequest(input: unknown): input is AgentEscalationRequest {
  return isAgentContractArtifact("escalation-request", input);
}

export function parseAgentRuntimeLaunchRecord(input: unknown): AgentRuntimeLaunchRecord {
  return parseAgentContractArtifact("runtime-launch-record", input);
}

export function safeParseAgentRuntimeLaunchRecord(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentRuntimeLaunchRecord> {
  return safeParseAgentContractArtifact("runtime-launch-record", input);
}

export function isAgentRuntimeLaunchRecord(input: unknown): input is AgentRuntimeLaunchRecord {
  return isAgentContractArtifact("runtime-launch-record", input);
}

export function parseAgentRoleOrchestrationContract(
  input: unknown,
): AgentRoleOrchestrationContract {
  return parseAgentContractArtifact("role-orchestration-contract", input);
}

export function safeParseAgentRoleOrchestrationContract(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentRoleOrchestrationContract> {
  return safeParseAgentContractArtifact("role-orchestration-contract", input);
}

export function isAgentRoleOrchestrationContract(
  input: unknown,
): input is AgentRoleOrchestrationContract {
  return isAgentContractArtifact("role-orchestration-contract", input);
}

export function parseRuntimeInventoryListResult(input: unknown): RuntimeInventoryListResult {
  return parseAgentContractArtifact("runtime-inventory-list-result", input);
}

export function safeParseRuntimeInventoryListResult(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeInventoryListResult> {
  return safeParseAgentContractArtifact("runtime-inventory-list-result", input);
}

export function isRuntimeInventoryListResult(input: unknown): input is RuntimeInventoryListResult {
  return isAgentContractArtifact("runtime-inventory-list-result", input);
}

export function parseRuntimeReadinessCheckResult(input: unknown): RuntimeReadinessCheckResult {
  return parseAgentContractArtifact("runtime-readiness-check-result", input);
}

export function safeParseRuntimeReadinessCheckResult(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeReadinessCheckResult> {
  return safeParseAgentContractArtifact("runtime-readiness-check-result", input);
}

export function isRuntimeReadinessCheckResult(
  input: unknown,
): input is RuntimeReadinessCheckResult {
  return isAgentContractArtifact("runtime-readiness-check-result", input);
}

export const agentContractConsumptionHooks = {
  kinds: agentContractArtifactKinds,
  schemas: agentContractConsumptionSchemas,
  parseAgentContractArtifact,
  parseAgentExtensionCliJsonArtifact,
  safeParseAgentContractArtifact,
  isAgentContractArtifact,
  parseTaskContract: parseAgentTaskContract,
  safeParseTaskContract: safeParseAgentTaskContract,
  isTaskContract: isAgentTaskContract,
  parseResultBundle: parseAgentResultBundle,
  safeParseResultBundle: safeParseAgentResultBundle,
  isResultBundle: isAgentResultBundle,
  parseEscalationRequest: parseAgentEscalationRequest,
  safeParseEscalationRequest: safeParseAgentEscalationRequest,
  isEscalationRequest: isAgentEscalationRequest,
  parseRuntimeLaunchRecord: parseAgentRuntimeLaunchRecord,
  safeParseRuntimeLaunchRecord: safeParseAgentRuntimeLaunchRecord,
  isRuntimeLaunchRecord: isAgentRuntimeLaunchRecord,
  parseRoleOrchestrationContract: parseAgentRoleOrchestrationContract,
  safeParseRoleOrchestrationContract: safeParseAgentRoleOrchestrationContract,
  isRoleOrchestrationContract: isAgentRoleOrchestrationContract,
  parseRuntimeInventoryListResult,
  safeParseRuntimeInventoryListResult,
  isRuntimeInventoryListResult,
  parseRuntimeReadinessCheckResult,
  safeParseRuntimeReadinessCheckResult,
  isRuntimeReadinessCheckResult,
} as const;

export const agentContractIntegrationBoundary = {
  extension: {
    consumesArtifactKinds: agentContractArtifactKinds,
    runtimeLocalArtifacts: [
      "orchestration-record",
      "orchestration-audit-trail",
      "runtime-audit-log",
    ],
    coupling: "shared-sdk-contracts-only",
    transport: "json-artifacts-by-run-id",
    mvpCommandSurface: [
      "pa agent prepare",
      "pa agent run",
      "pa agent status",
      "pa agent orchestrate",
      "pa result import",
      "pa agent validate",
      "pa agent reconcile",
      "pa agent audit",
    ],
    deferredCommands: ["pa agent escalate"],
  },
  standards: {
    additiveTaskContextFieldPaths: agentContractAdditiveTaskContextFieldPaths,
    supportedTaskContextRepresentations: ["string-id", "structured-reference"],
    commandSurface: "deferred",
    validationProfiles: "deferred",
  },
  versioning: {
    additiveGrowth: "optional-fields-and-sdk-hook-metadata-only",
    breakingChange: "requires-major-schema-version",
  },
} as const;
