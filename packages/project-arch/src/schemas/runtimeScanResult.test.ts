import { describe, it, expect } from "vitest";
import {
  runtimeScanResultSchema,
  runtimeDiscoveredCandidateSchema,
  parseRuntimeScanResult,
} from "../schemas/runtimeScanResult";
import type { RuntimeScanResult, RuntimeDiscoveredCandidate } from "../schemas/runtimeScanResult";

describe("runtimeDiscoveredCandidateSchema", () => {
  it("accepts a valid discovered candidate with high confidence", () => {
    const candidate = {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      description: "OpenAI Codex adapter",
      confidence: "high",
      source: "adapter-probe",
      suggestedModel: "gpt-4",
      suggestedLabel: "Codex Production",
      diagnostics: [],
    } satisfies RuntimeDiscoveredCandidate;

    expect(() => runtimeDiscoveredCandidateSchema.parse(candidate)).not.toThrow();
  });

  it("accepts a candidate with minimum fields", () => {
    const candidate = {
      runtime: "ollama",
      displayName: "Ollama",
      confidence: "medium",
      source: "system-path",
      diagnostics: [],
    };

    expect(() => runtimeDiscoveredCandidateSchema.parse(candidate)).not.toThrow();
  });

  it("rejects a candidate without displayName", () => {
    const candidate = {
      runtime: "codex-cli",
      confidence: "high",
      source: "adapter-probe",
      diagnostics: [],
    };

    expect(() => runtimeDiscoveredCandidateSchema.parse(candidate)).toThrow();
  });

  it("rejects a candidate with invalid confidence", () => {
    const candidate = {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      confidence: "very-high",
      source: "adapter-probe",
      diagnostics: [],
    };

    expect(() => runtimeDiscoveredCandidateSchema.parse(candidate)).toThrow();
  });

  it("rejects a candidate with invalid source", () => {
    const candidate = {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      confidence: "high",
      source: "process-scrape",
      diagnostics: [],
    };

    expect(() => runtimeDiscoveredCandidateSchema.parse(candidate)).toThrow();
  });
});

describe("runtimeScanResultSchema", () => {
  it("accepts a successful scan result with candidates", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "success",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [
        {
          runtime: "codex-cli",
          displayName: "Codex CLI",
          confidence: "high",
          source: "adapter-probe",
          suggestedModel: "gpt-4",
          diagnostics: [],
        },
      ],
      diagnostics: [],
    } satisfies RuntimeScanResult;

    expect(() => runtimeScanResultSchema.parse(result)).not.toThrow();
  });

  it("accepts a partial scan result with candidates and diagnostics", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "partial",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [
        {
          runtime: "ollama",
          displayName: "Ollama",
          confidence: "high",
          source: "system-path",
          diagnostics: [],
        },
      ],
      diagnostics: [
        {
          code: "scan-probe-error",
          severity: "warning" as const,
          message: "Codex probe failed",
          nextStep: "Install Codex",
        },
      ],
    } satisfies RuntimeScanResult;

    expect(() => runtimeScanResultSchema.parse(result)).not.toThrow();
  });

  it("requires diagnostics in failed scan result", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "failed",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [],
      diagnostics: [],
    };

    expect(() => runtimeScanResultSchema.parse(result)).toThrow(/Failed scan results must include/);
  });

  it("rejects success status without candidates", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "success",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [],
      diagnostics: [],
    };

    expect(() => runtimeScanResultSchema.parse(result)).toThrow();
  });

  it("rejects partial status without candidates", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "partial",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [],
      diagnostics: [
        {
          code: "error",
          severity: "error" as const,
          message: "failed",
          nextStep: "retry",
        },
      ],
    };

    expect(() => runtimeScanResultSchema.parse(result)).toThrow();
  });

  it("requires non-high-confidence adapter-probe candidates to include diagnostics", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "partial",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [
        {
          runtime: "codex-cli",
          displayName: "Codex CLI",
          confidence: "medium",
          source: "adapter-probe",
          diagnostics: [],
        },
      ],
      diagnostics: [
        {
          code: "partial-detection",
          severity: "warning" as const,
          message: "detected with uncertainty",
          nextStep: "verify installation",
        },
      ],
    };

    expect(() => runtimeScanResultSchema.parse(result)).toThrow(
      /Non-high-confidence adapter-probe/,
    );
  });

  it("allows non-high-confidence non-adapter-probe candidates without diagnostics", () => {
    const result = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "partial",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [
        {
          runtime: "ollama",
          displayName: "Ollama",
          confidence: "low",
          source: "environment-variable",
          diagnostics: [],
        },
      ],
      diagnostics: [
        {
          code: "env-var-detected",
          severity: "warning" as const,
          message: "Found environment variable",
          nextStep: "verify",
        },
      ],
    } satisfies RuntimeScanResult;

    expect(() => runtimeScanResultSchema.parse(result)).not.toThrow();
  });
});

describe("parseRuntimeScanResult", () => {
  it("parses a valid scan result", () => {
    const payload = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "success",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [
        {
          runtime: "codex-cli",
          displayName: "Codex CLI",
          confidence: "high",
          source: "adapter-probe",
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const result = parseRuntimeScanResult(payload);
    expect(result.scanStatus).toBe("success");
    expect(result.candidates).toHaveLength(1);
  });

  it("throws on invalid payload", () => {
    const payload = {
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "invalid-status",
      scannedAt: "2026-04-03T20:00:00.000Z",
      candidates: [],
      diagnostics: [],
    };

    expect(() => parseRuntimeScanResult(payload)).toThrow();
  });
});
