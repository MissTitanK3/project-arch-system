import { z } from "zod";
import type { AgentRuntimeAdapterScanProbeResult } from "../../schemas/agentRuntimeAdapterScan";
import { agentRuntimeAdapterScanProbeResultSchema } from "../../schemas/agentRuntimeAdapterScan";

export function parseAgentRuntimeAdapterScanProbeResult(
  payload: unknown,
): AgentRuntimeAdapterScanProbeResult {
  return agentRuntimeAdapterScanProbeResultSchema.parse(payload);
}

export function safeParseAgentRuntimeAdapterScanProbeResult(
  payload: unknown,
): z.SafeParseReturnType<unknown, AgentRuntimeAdapterScanProbeResult> {
  return agentRuntimeAdapterScanProbeResultSchema.safeParse(payload);
}
