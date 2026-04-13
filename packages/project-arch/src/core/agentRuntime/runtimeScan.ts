import { z } from "zod";
import type { AgentRuntimeAdapterRegistry } from "./adapters";
import {
  parseRuntimeScanResult,
  runtimeScanResultSchema,
  type RuntimeScanResult,
  type RuntimeDiscoveredCandidate,
  type RuntimeScanResultStatus,
} from "../../schemas/runtimeScanResult";
import { parseAgentRuntimeAdapterScanProbeResult } from "../agentRuntime/adapterScan";
import type {
  AgentRuntimeAdapterScanProbeInput,
  AgentRuntimeAdapterScanProbeCandidateResult,
} from "../../schemas/agentRuntimeAdapterScan";
import { listAgentRuntimeAdapters } from "./adapters";

export interface BuildRuntimeScanOptions {
  cwd?: string;
  adapterRegistry: AgentRuntimeAdapterRegistry;
}

export class RuntimeScanError extends Error {
  constructor(
    public readonly code: "PAA031" | "PAA032",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeScanError";
  }
}

function buildScanProbeInput(runtime: string): AgentRuntimeAdapterScanProbeInput {
  return {
    schemaVersion: "2.0" as const,
    runtime,
  };
}

async function executeScanProbe(input: {
  runtime: string;
  adapterRegistry: AgentRuntimeAdapterRegistry;
}): Promise<{
  foundCandidates: RuntimeDiscoveredCandidate[];
  diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    nextStep: string;
    docsHint?: string;
  }>;
}> {
  const adapter = input.adapterRegistry.adapters.get(input.runtime);

  if (!adapter) {
    return {
      foundCandidates: [],
      diagnostics: [],
    };
  }

  if (!adapter.scanProbe) {
    return {
      foundCandidates: [],
      diagnostics: [],
    };
  }

  try {
    const probeInput = buildScanProbeInput(input.runtime);
    const probeResult = parseAgentRuntimeAdapterScanProbeResult(
      await adapter.scanProbe(probeInput),
    );

    if (probeResult.status === "not-found") {
      return {
        foundCandidates: [],
        diagnostics: [
          {
            code: "runtime-not-found",
            severity: "warning" as const,
            message: `Runtime adapter '${input.runtime}' is registered but no candidate was discovered in this environment.`,
            nextStep: `Install or configure '${input.runtime}', then re-run scan.`,
          },
        ],
      };
    }

    if (probeResult.status === "error") {
      return {
        foundCandidates: [],
        diagnostics: [
          {
            code: "scan-probe-error",
            severity: "warning" as const,
            message: `Error scanning for runtime '${input.runtime}': ${probeResult.errorMessage ?? "unknown error"}`,
            nextStep: `Verify runtime installation and environment, then re-run scan.`,
          },
        ],
      };
    }

    return {
      foundCandidates: probeResult.candidates.map(
        (candidate: AgentRuntimeAdapterScanProbeCandidateResult) => {
          const diagnostics = [];
          if (candidate.confidence !== "high") {
            diagnostics.push({
              code: "low-confidence-discovery",
              severity: "warning" as const,
              message: `Runtime candidate "${candidate.displayName}" was discovered with ${candidate.confidence} confidence.`,
              nextStep:
                "Verify this is the correct runtime installation, or provide more specific configuration.",
              docsHint:
                "Higher confidence discoveries are more reliable. Consider comparing with other adapter results.",
            });
          }
          return {
            runtime: probeResult.runtime,
            displayName: candidate.displayName,
            description: candidate.description,
            confidence: candidate.confidence,
            source: candidate.source ?? ("adapter-probe" as const),
            suggestedModel: candidate.suggestedModel,
            suggestedLabel: candidate.suggestedLabel,
            diagnostics,
          };
        },
      ),
      diagnostics: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      foundCandidates: [],
      diagnostics: [
        {
          code: "scan-probe-failed",
          severity: "warning" as const,
          message: `Runtime adapter scan probe for '${input.runtime}' failed unexpectedly: ${message}`,
          nextStep: `Check logs and verify the adapter implementation, then re-run scan.`,
        },
      ],
    };
  }
}

/**
 * Creates a canonical key for duplicate detection.
 * Two candidates with the same key are considered duplicates.
 * Key format: "runtime:displayName" (lowercase for case-insensitive comparison)
 */
function createCandidateKey(candidate: RuntimeDiscoveredCandidate): string {
  return `${candidate.runtime}:${candidate.displayName}`.toLowerCase();
}

/**
 * Deduplicates candidates deterministically.
 * Keeps the first candidate by adapter order, prefers high confidence variants.
 * Returns deduplicated candidates and diagnostics for ambiguous cases.
 */
function deduplicateCandidates(candidates: RuntimeDiscoveredCandidate[]): {
  deduplicated: RuntimeDiscoveredCandidate[];
  diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    nextStep: string;
    docsHint?: string;
  }>;
} {
  const candidatesByKey = new Map<
    string,
    { candidate: RuntimeDiscoveredCandidate; sourceRuntimes: string[] }
  >();
  const diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    nextStep: string;
    docsHint?: string;
  }> = [];

  // Track candidates by key, preferring high-confidence variants
  for (const candidate of candidates) {
    const key = createCandidateKey(candidate);
    const existing = candidatesByKey.get(key);

    if (!existing) {
      candidatesByKey.set(key, {
        candidate,
        sourceRuntimes: [candidate.runtime],
      });
    } else {
      // If candidate already exists, note the duplicate source
      existing.sourceRuntimes.push(candidate.runtime);

      // Prefer high confidence over existing if this one is higher
      const existingConfidenceOrder = {
        high: 3,
        medium: 2,
        low: 1,
      };
      const newConfidenceOrder = existingConfidenceOrder;
      if (
        newConfidenceOrder[candidate.confidence] > newConfidenceOrder[existing.candidate.confidence]
      ) {
        existing.candidate = candidate;
      }
    }
  }

  // Build deduplicated list - include only unique candidates
  const deduplicated: RuntimeDiscoveredCandidate[] = Array.from(candidatesByKey.values()).map(
    (entry) => entry.candidate,
  );

  // Add diagnostics for ambiguous candidates (found by multiple adapters)
  for (const entry of candidatesByKey.values()) {
    if (entry.sourceRuntimes.length > 1) {
      diagnostics.push({
        code: "ambiguous-candidate",
        severity: "warning",
        message: `Candidate "${entry.candidate.displayName}" (${entry.candidate.runtime}) was discovered by multiple probe results: ${entry.sourceRuntimes.join(", ")}. Using the highest-confidence variant.`,
        nextStep:
          "Review the candidate details and verify it matches your environment configuration.",
        docsHint:
          "Multiple probe results for the same candidate may indicate overlapping runtime detection paths.",
      });
    }
  }

  return {
    deduplicated,
    diagnostics,
  };
}

export async function buildRuntimeScan(
  options: BuildRuntimeScanOptions,
): Promise<RuntimeScanResult> {
  const adapterRuntimes = listAgentRuntimeAdapters(options.adapterRegistry);

  if (adapterRuntimes.length === 0) {
    return runtimeScanResultSchema.parse({
      schemaVersion: "2.0",
      status: "runtime-scan",
      scanStatus: "failed" as RuntimeScanResultStatus,
      scannedAt: new Date().toISOString(),
      candidates: [],
      diagnostics: [
        {
          code: "no-adapters-registered",
          severity: "error",
          message: "No runtime adapters are registered in this project-arch instance.",
          nextStep: "Register at least one runtime adapter before scanning.",
        },
      ],
    });
  }

  const allCandidates: RuntimeDiscoveredCandidate[] = [];
  const allDiagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    nextStep: string;
    docsHint?: string;
  }> = [];
  const failedProbes: string[] = [];

  for (const adapterRuntime of adapterRuntimes) {
    const probeResult = await executeScanProbe({
      runtime: adapterRuntime.runtime,
      adapterRegistry: options.adapterRegistry,
    });

    allCandidates.push(...probeResult.foundCandidates);
    allDiagnostics.push(...probeResult.diagnostics);

    if (
      probeResult.diagnostics.some((d) => d.code === "scan-probe-error") ||
      probeResult.diagnostics.some((d) => d.code === "scan-probe-failed")
    ) {
      failedProbes.push(adapterRuntime.runtime);
    }
  }

  // Deduplicate candidates with deterministic ordering
  const { deduplicated, diagnostics: deduplicationDiagnostics } =
    deduplicateCandidates(allCandidates);
  allDiagnostics.push(...deduplicationDiagnostics);

  let scanStatus: RuntimeScanResultStatus;
  if (deduplicated.length > 0 && failedProbes.length === 0) {
    scanStatus = "success";
  } else if (deduplicated.length > 0 && failedProbes.length > 0) {
    scanStatus = "partial";
  } else {
    scanStatus = "failed";
  }

  // If scan failed and no diagnostics were collected, add a generic failure reason
  if (scanStatus === "failed" && allDiagnostics.length === 0) {
    allDiagnostics.push({
      code: "no-scan-results",
      severity: "warning",
      message: "No runtime candidates were discovered during the scan.",
      nextStep:
        "Verify that runtime adapters are configured and have scan capabilities, then try again.",
    });
  }

  return runtimeScanResultSchema.parse({
    schemaVersion: "2.0",
    status: "runtime-scan",
    scanStatus,
    scannedAt: new Date().toISOString(),
    candidates: deduplicated,
    diagnostics: allDiagnostics,
  });
}

export function parseRuntimeScanResultPayload(input: unknown): RuntimeScanResult {
  return parseRuntimeScanResult(input);
}

export function safeParseRuntimeScanResultPayload(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeScanResult> {
  return runtimeScanResultSchema.safeParse(input);
}
