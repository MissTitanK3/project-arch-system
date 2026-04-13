import fs from "fs-extra";
import path from "path";
import { describe, it, expect } from "vitest";
import { buildRuntimeScan } from "./runtimeScan";
import {
  createAgentRuntimeAdapterRegistry,
  createBootstrappedAgentRuntimeAdapterRegistry,
  registerAgentRuntimeAdapter,
} from "./adapters";
import type { AgentRuntimeAdapter, AgentRuntimeAdapterScanProbeFn } from "./adapters";
import { createTempDir } from "../../test/helpers";

const createMockLaunch = (runtime: string) => async () => ({
  schemaVersion: "2.0" as const,
  runtime,
  runId: "test-run",
  taskId: "001",
  status: "launch-dispatched" as const,
  runHandle: "handle",
  launchedAt: new Date().toISOString(),
  lifecycleBoundary: "prepare-first" as const,
});

describe("buildRuntimeScan", () => {
  it("returns failed scan when no adapters are registered", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("failed");
    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("no-adapters-registered");
  });

  it("aggregates candidates from successful scan probes", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const scanProbe: AgentRuntimeAdapterScanProbeFn = async () => ({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "found",
      candidates: [
        {
          displayName: "Codex CLI",
          confidence: "high",
          suggestedModel: "gpt-4",
        },
      ],
    });

    const adapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        runId: "test-run",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe,
    };

    registerAgentRuntimeAdapter(registry, adapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("success");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.runtime).toBe("codex-cli");
    expect(result.candidates[0]?.displayName).toBe("Codex CLI");
  });

  it("preserves explicit candidate source returned by adapter probe", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("codex-cli"),
      scanProbe: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        status: "found",
        candidates: [
          {
            displayName: "Codex CLI",
            confidence: "high",
            source: "system-path",
          },
        ],
      }),
    });

    const result = await buildRuntimeScan({ adapterRegistry: registry });
    expect(result.scanStatus).toBe("success");
    expect(result.candidates[0]?.source).toBe("system-path");
  });

  it("preserves config-file source returned by adapter probe", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    registerAgentRuntimeAdapter(registry, {
      availabilitySource: "config-file",
      registration: {
        schemaVersion: "2.0",
        runtime: "cursor-agent",
        displayName: "Cursor Agent",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("cursor-agent"),
      scanProbe: async () => ({
        schemaVersion: "2.0",
        runtime: "cursor-agent",
        status: "found",
        candidates: [
          {
            displayName: "Cursor Agent",
            confidence: "medium",
            source: "config-file",
          },
        ],
      }),
    });

    const result = await buildRuntimeScan({ adapterRegistry: registry });
    expect(result.scanStatus).toBe("success");
    expect(result.candidates[0]?.source).toBe("config-file");
  });

  it("discovers user-configured adapter candidates from bootstrapped registry", async () => {
    const context = await createTempDir();

    try {
      const configPath = path.join(context.tempDir, ".project-arch", "adapters.config.json");
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(
        configPath,
        {
          schemaVersion: "2.0",
          adapters: [
            {
              runtime: "cursor-agent",
              displayName: "Cursor Agent",
              probeType: "http-endpoint",
              probeTarget: "http://localhost:2050/v1/models",
              suggestedModel: "claude-3-7-sonnet",
            },
          ],
        },
        { spaces: 2 },
      );

      const registry = createBootstrappedAgentRuntimeAdapterRegistry({
        cwd: context.tempDir,
        builtInDependencies: {
          hasCommandInPath: () => false,
          probeHttpJson: async () => ({ ok: false }),
          readEnv: () => undefined,
        },
        userConfiguredDependencies: {
          hasCommandInPath: () => false,
          probeHttpJson: async (url) =>
            url === "http://localhost:2050/v1/models"
              ? { ok: true, status: 200, payload: { data: [{ id: "claude-3-7-sonnet" }] } }
              : { ok: false },
        },
      });

      const result = await buildRuntimeScan({ adapterRegistry: registry });
      expect(result.scanStatus).toBe("success");
      expect(result.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runtime: "cursor-agent",
            source: "config-file",
            suggestedModel: "claude-3-7-sonnet",
          }),
        ]),
      );
    } finally {
      await context.cleanup();
    }
  });

  it("handles adapters without scan probe gracefully", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        runId: "test-run",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("failed");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns partial scan when some adapters fail", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const successProbe: AgentRuntimeAdapterScanProbeFn = async () => ({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "found",
      candidates: [
        {
          displayName: "Codex CLI",
          confidence: "high",
        },
      ],
    });

    const errorProbe: AgentRuntimeAdapterScanProbeFn = async () => ({
      schemaVersion: "2.0",
      runtime: "ollama",
      status: "error",
      candidates: [],
      errorMessage: "Failed to detect Ollama",
    });

    const adapter1: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        runId: "test",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe: successProbe,
    };

    const adapter2: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "ollama",
        runId: "test",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe: errorProbe,
    };

    registerAgentRuntimeAdapter(registry, adapter1);
    registerAgentRuntimeAdapter(registry, adapter2);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("partial");
    expect(result.candidates).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.code === "scan-probe-error")).toBe(true);
  });

  it("reports not-found probe results as diagnostics", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const notFoundProbe: AgentRuntimeAdapterScanProbeFn = async () => ({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "not-found",
      candidates: [],
    });

    const adapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        runId: "test",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe: notFoundProbe,
    };

    registerAgentRuntimeAdapter(registry, adapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("failed");
    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === "runtime-not-found")).toBe(true);
  });

  it("handles adapter probe exceptions gracefully", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const failingProbe: AgentRuntimeAdapterScanProbeFn = async () => {
      throw new Error("Probe crashed");
    };

    const adapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        runId: "test",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe: failingProbe,
    };

    registerAgentRuntimeAdapter(registry, adapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("failed");
    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === "scan-probe-failed")).toBe(true);
  });

  it("aggregates multiple successful probes", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const codexProbe: AgentRuntimeAdapterScanProbeFn = async () => ({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      status: "found",
      candidates: [
        {
          displayName: "Codex CLI",
          confidence: "high",
          suggestedModel: "gpt-4",
        },
      ],
    });

    const ollamaProbe: AgentRuntimeAdapterScanProbeFn = async () => ({
      schemaVersion: "2.0",
      runtime: "ollama",
      status: "found",
      candidates: [
        {
          displayName: "Ollama",
          confidence: "high",
          suggestedModel: "llama2",
        },
      ],
    });

    const adapter1: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        runId: "test",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe: codexProbe,
    };

    const adapter2: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async () => ({
        schemaVersion: "2.0",
        runtime: "ollama",
        runId: "test",
        taskId: "001",
        status: "launch-dispatched",
        runHandle: "handle",
        launchedAt: new Date().toISOString(),
        lifecycleBoundary: "prepare-first",
      }),
      scanProbe: ollamaProbe,
    };

    registerAgentRuntimeAdapter(registry, adapter1);
    registerAgentRuntimeAdapter(registry, adapter2);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("success");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.runtime).sort()).toEqual(["codex-cli", "ollama"]);
  });

  it("deduplicates candidates discovered by multiple adapters", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter1: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama-detector",
        displayName: "Ollama Detector A",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("ollama-detector"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [
          {
            displayName: "Ollama",
            confidence: "high",
            suggestedModel: "llama2",
          },
        ],
      }),
    };

    const adapter2: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama-finder",
        displayName: "Ollama Finder B",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("ollama-finder"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [
          {
            displayName: "Ollama",
            confidence: "medium",
            suggestedModel: "neural-chat",
          },
        ],
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter1);
    registerAgentRuntimeAdapter(registry, adapter2);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("success");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.displayName).toBe("Ollama");
    expect(result.candidates[0]?.confidence).toBe("high");
    expect(result.diagnostics.some((d) => d.code === "ambiguous-candidate")).toBe(true);
  });

  it("preserves adapter discovery order in candidate list", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const ollamaAdapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("ollama"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [{ displayName: "Ollama Instance", confidence: "high" }],
      }),
    };

    const codexAdapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("codex-cli"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "codex-cli",
        status: "found",
        candidates: [{ displayName: "Codex CLI", confidence: "high" }],
      }),
    };

    registerAgentRuntimeAdapter(registry, ollamaAdapter);
    registerAgentRuntimeAdapter(registry, codexAdapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.runtime).toBe("codex-cli");
    expect(result.candidates[1]?.runtime).toBe("ollama");
  });

  it("includes ambiguous-candidate diagnostic when multiple probe results find same runtime", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter1: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "detector-a",
        displayName: "Detector A",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("ollama"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [{ displayName: "Ollama", confidence: "high" }],
      }),
    };

    const adapter2: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "detector-b",
        displayName: "Detector B",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("ollama"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [{ displayName: "Ollama", confidence: "low" }],
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter1);
    registerAgentRuntimeAdapter(registry, adapter2);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    const ambiguousDiagnostic = result.diagnostics.find((d) => d.code === "ambiguous-candidate");
    expect(ambiguousDiagnostic).toBeDefined();
    expect(ambiguousDiagnostic?.severity).toBe("warning");
    expect(ambiguousDiagnostic?.message).toContain("multiple probe results");
  });

  it("handles mixed success and failure probes with deduplication", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const successAdapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("ollama"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [{ displayName: "Ollama", confidence: "high" }],
      }),
    };

    const failureAdapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("codex-cli"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "codex-cli",
        status: "error",
        candidates: [],
        errorMessage: "Probe failed",
      }),
    };

    registerAgentRuntimeAdapter(registry, successAdapter);
    registerAgentRuntimeAdapter(registry, failureAdapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.scanStatus).toBe("partial");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.displayName).toBe("Ollama");
    expect(result.diagnostics.some((d) => d.code === "scan-probe-error")).toBe(true);
  });

  it("deterministically selects highest confidence variant when deduplicating", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const lowConfidenceAdapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "low-confidence-detector",
        displayName: "Low Confidence Detector",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("low-confidence-detector"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [
          {
            displayName: "Ollama",
            confidence: "low",
            suggestedModel: "orca",
          },
        ],
      }),
    };

    const highConfidenceAdapter: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "high-confidence-detector",
        displayName: "High Confidence Detector",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("high-confidence-detector"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [
          {
            displayName: "Ollama",
            confidence: "high",
            suggestedModel: "llama2",
          },
        ],
      }),
    };

    registerAgentRuntimeAdapter(registry, lowConfidenceAdapter);
    registerAgentRuntimeAdapter(registry, highConfidenceAdapter);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.confidence).toBe("high");
    expect(result.candidates[0]?.suggestedModel).toBe("llama2");
  });

  it("includes docsHint in ambiguous-candidate diagnostic", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter1: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "adapter-a",
        displayName: "Adapter A",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("adapter-a"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [{ displayName: "Ollama", confidence: "high" }],
      }),
    };

    const adapter2: AgentRuntimeAdapter = {
      registration: {
        schemaVersion: "2.0",
        runtime: "adapter-b",
        displayName: "Adapter B",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createMockLaunch("adapter-b"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found",
        candidates: [{ displayName: "Ollama", confidence: "high" }],
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter1);
    registerAgentRuntimeAdapter(registry, adapter2);

    const result = await buildRuntimeScan({
      adapterRegistry: registry,
    });

    const ambiguousDiagnostic = result.diagnostics.find((d) => d.code === "ambiguous-candidate");
    expect(ambiguousDiagnostic?.docsHint).toContain("overlapping runtime detection paths");
  });
});
