import { describe, it, expect } from "vitest";
import {
  agentRuntimeAdapterScanProbeResultSchema,
  type AgentRuntimeAdapterScanProbeResult,
} from "../schemas/agentRuntimeAdapterScan";

describe("agentRuntimeAdapterScanProbeResultSchema", () => {
  it("accepts a successful scan probe with candidates", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "found",
      candidates: [
        {
          displayName: "Codex CLI",
          description: "OpenAI Codex adapter",
          confidence: "high",
          suggestedModel: "gpt-4",
          suggestedLabel: "Codex",
        },
      ],
    } satisfies AgentRuntimeAdapterScanProbeResult;

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).not.toThrow();
  });

  it("accepts a not-found result", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "not-found",
      candidates: [],
    } satisfies AgentRuntimeAdapterScanProbeResult;

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).not.toThrow();
  });

  it("accepts an error result with message", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "error",
      candidates: [],
      errorMessage: "Failed to find Codex installation",
    } satisfies AgentRuntimeAdapterScanProbeResult;

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).not.toThrow();
  });

  it("rejects found status without candidates", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "found",
      candidates: [],
    };

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).toThrow(
      /'found' status must include at least one candidate/,
    );
  });

  it("rejects error status without errorMessage", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "error",
      candidates: [],
    };

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).toThrow(
      /'error' status must include an errorMessage/,
    );
  });

  it("rejects not-found status with candidates", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "not-found",
      candidates: [
        {
          displayName: "Codex CLI",
          confidence: "high",
        },
      ],
    };

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).toThrow(
      /'not-found' status must not include candidates/,
    );
  });

  it("accepts minimal candidate fields", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "ollama",
      status: "found",
      candidates: [
        {
          displayName: "Ollama",
          confidence: "medium",
        },
      ],
    } satisfies AgentRuntimeAdapterScanProbeResult;

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).not.toThrow();
  });

  it("rejects candidate without displayName", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "ollama",
      status: "found",
      candidates: [
        {
          confidence: "high",
        },
      ],
    };

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).toThrow();
  });

  it("rejects invalid confidence level", () => {
    const result = {
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "found",
      candidates: [
        {
          displayName: "Codex",
          confidence: "very-high",
        },
      ],
    };

    expect(() => agentRuntimeAdapterScanProbeResultSchema.parse(result)).toThrow();
  });
});
