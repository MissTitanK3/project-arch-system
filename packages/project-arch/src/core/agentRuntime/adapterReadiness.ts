import { z } from "zod";
import {
  agentRuntimeAdapterOptionValidationInputSchema,
  agentRuntimeAdapterOptionValidationResultSchema,
  agentRuntimeAdapterReadinessInputSchema,
  agentRuntimeAdapterReadinessResultSchema,
  type AgentRuntimeAdapterOptionValidationInput,
  type AgentRuntimeAdapterOptionValidationResult,
  type AgentRuntimeAdapterReadinessInput,
  type AgentRuntimeAdapterReadinessResult,
} from "../../schemas/agentRuntimeAdapterReadiness";

export function parseAgentRuntimeAdapterReadinessInput(
  input: unknown,
): AgentRuntimeAdapterReadinessInput {
  return agentRuntimeAdapterReadinessInputSchema.parse(input);
}

export function safeParseAgentRuntimeAdapterReadinessInput(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentRuntimeAdapterReadinessInput> {
  return agentRuntimeAdapterReadinessInputSchema.safeParse(input);
}

export function parseAgentRuntimeAdapterReadinessResult(
  input: unknown,
): AgentRuntimeAdapterReadinessResult {
  return agentRuntimeAdapterReadinessResultSchema.parse(input);
}

export function safeParseAgentRuntimeAdapterReadinessResult(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentRuntimeAdapterReadinessResult> {
  return agentRuntimeAdapterReadinessResultSchema.safeParse(input);
}

export function parseAgentRuntimeAdapterOptionValidationInput(
  input: unknown,
): AgentRuntimeAdapterOptionValidationInput {
  return agentRuntimeAdapterOptionValidationInputSchema.parse(input);
}

export function safeParseAgentRuntimeAdapterOptionValidationInput(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentRuntimeAdapterOptionValidationInput> {
  return agentRuntimeAdapterOptionValidationInputSchema.safeParse(input);
}

export function parseAgentRuntimeAdapterOptionValidationResult(
  input: unknown,
): AgentRuntimeAdapterOptionValidationResult {
  return agentRuntimeAdapterOptionValidationResultSchema.parse(input);
}

export function safeParseAgentRuntimeAdapterOptionValidationResult(
  input: unknown,
): z.SafeParseReturnType<unknown, AgentRuntimeAdapterOptionValidationResult> {
  return agentRuntimeAdapterOptionValidationResultSchema.safeParse(input);
}
