import { describe, expect, it } from "vitest";
import {
  AgentRuntimeAdapterRegistryError,
  buildAgentRuntimeLaunchInput,
  createAgentRuntimeAdapterRegistry,
  listAgentRuntimeAdapters,
  registerAgentRuntimeAdapter,
  resolveAgentRuntimeAdapter,
} from "./adapters";

function makePreparedResult(runId: string, taskId: string) {
  return {
    schemaVersion: "2.0" as const,
    runId,
    taskId,
    status: "prepared" as const,
    contractPath: `.project-arch/agent-runtime/contracts/${runId}.json`,
    promptPath: `.project-arch/agent-runtime/prompts/${runId}.md`,
    allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
  };
}

describe("core/agentRuntime/adapters", () => {
  it("keeps adapter registration deterministic by runtime id", () => {
    const registry = createAgentRuntimeAdapterRegistry();

    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "z-runtime",
        displayName: "Z Runtime",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        runId: input.runId,
        taskId: input.taskId,
        status: "launch-dispatched",
        runHandle: `z-runtime:${input.runId}`,
        launchedAt: "2026-04-01T20:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "a-runtime",
        displayName: "A Runtime",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        runId: input.runId,
        taskId: input.taskId,
        status: "launch-dispatched",
        runHandle: `a-runtime:${input.runId}`,
        launchedAt: "2026-04-01T20:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    expect(listAgentRuntimeAdapters(registry).map((entry) => entry.runtime)).toEqual([
      "a-runtime",
      "z-runtime",
    ]);
  });

  it("rejects duplicate adapter runtime registration", () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter = {
      registration: {
        schemaVersion: "2.0" as const,
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1" as const,
        ownership: "adapter-managed" as const,
      },
      launch: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "codex-cli",
        runId: "run-2026-04-01-200000",
        taskId: "001",
        status: "launch-dispatched" as const,
        runHandle: "codex-cli:run-2026-04-01-200000",
        launchedAt: "2026-04-01T20:00:00.000Z",
        lifecycleBoundary: "prepare-first" as const,
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter);
    expect(() => registerAgentRuntimeAdapter(registry, adapter)).toThrow(
      AgentRuntimeAdapterRegistryError,
    );
  });

  it("resolves registered adapters and errors for unknown runtimes", () => {
    const registry = createAgentRuntimeAdapterRegistry();
    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        runId: input.runId,
        taskId: input.taskId,
        status: "launch-dispatched",
        runHandle: `codex-cli:${input.runId}`,
        launchedAt: "2026-04-01T20:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    expect(resolveAgentRuntimeAdapter(registry, "codex-cli").registration.displayName).toBe(
      "Codex CLI",
    );
    expect(() => resolveAgentRuntimeAdapter(registry, "missing-runtime")).toThrow(
      AgentRuntimeAdapterRegistryError,
    );
  });

  it("maps prepared run artifacts into launch input contract", () => {
    const launchInput = buildAgentRuntimeLaunchInput({
      runtime: "codex-cli",
      prepared: makePreparedResult("run-2026-04-01-200001", "001"),
      requestedAt: "2026-04-01T20:00:01.000Z",
    });

    expect(launchInput.contractPath).toBe(
      ".project-arch/agent-runtime/contracts/run-2026-04-01-200001.json",
    );
    expect(launchInput.promptPath).toBe(
      ".project-arch/agent-runtime/prompts/run-2026-04-01-200001.md",
    );
    expect(launchInput.lifecycleBoundary).toBe("prepare-first");
  });

  it("preserves optional readiness and option-validation hooks on registered adapters", () => {
    const registry = createAgentRuntimeAdapterRegistry();

    registerAgentRuntimeAdapter(registry, {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        runId: input.runId,
        taskId: input.taskId,
        status: "launch-dispatched",
        runHandle: `codex-cli:${input.runId}`,
        launchedAt: "2026-04-01T20:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
      checkReadiness: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        profileId: input.profileId,
        status: "ready",
        diagnostics: [],
      }),
      validateOptions: async (input) => ({
        schemaVersion: "2.0",
        runtime: input.runtime,
        profileId: input.profileId,
        status: "valid",
        diagnostics: [],
      }),
    });

    const resolved = resolveAgentRuntimeAdapter(registry, "codex-cli");
    expect(resolved.checkReadiness).toBeDefined();
    expect(resolved.validateOptions).toBeDefined();
  });
});
