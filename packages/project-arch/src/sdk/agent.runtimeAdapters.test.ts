import { describe, expect, it } from "vitest";
import {
  buildAgentRuntimeLaunchInput,
  createAgentRuntimeAdapterRegistry,
  listAgentRuntimeAdapters,
  registerAgentRuntimeAdapter,
  resolveAgentRuntimeAdapter,
} from "./agent";

describe("sdk/agent runtime adapters", () => {
  it("exposes deterministic registry helpers for runtime adapters", () => {
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
        launchedAt: "2026-04-01T21:00:00.000Z",
        lifecycleBoundary: "prepare-first",
      }),
    });

    expect(listAgentRuntimeAdapters(registry).map((entry) => entry.runtime)).toEqual(["codex-cli"]);
    expect(resolveAgentRuntimeAdapter(registry, "codex-cli").registration.displayName).toBe(
      "Codex CLI",
    );
  });

  it("maps prepared artifacts into launch contracts for future run command surfaces", () => {
    const launch = buildAgentRuntimeLaunchInput({
      runtime: "codex-cli",
      prepared: {
        schemaVersion: "2.0",
        runId: "run-2026-04-01-210001",
        taskId: "001",
        status: "prepared",
        contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-210001.json",
        promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-210001.md",
        allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      },
      requestedAt: "2026-04-01T21:00:01.000Z",
    });

    expect(launch.runtime).toBe("codex-cli");
    expect(launch.lifecycleBoundary).toBe("prepare-first");
    expect(launch.contractPath).toContain("contracts/run-2026-04-01-210001.json");
  });
});
