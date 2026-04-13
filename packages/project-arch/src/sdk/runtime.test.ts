import path from "path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { createTempDir, resultAssertions } from "../test/helpers";
import {
  runtimeCheck,
  runtimeConfigDefault,
  runtimeConfigInspect,
  runtimeConfigPath,
  runtimeConfigRead,
  runtimeConfigValidate,
  runtimeConfigWrite,
  runtimeDefault,
  runtimeDisable,
  runtimeEnable,
  runtimeLink,
  runtimeList,
  runtimeScan,
  runtimeUnlink,
  runtimeUpdate,
} from "./runtime";
import { createAgentRuntimeAdapterRegistry, registerAgentRuntimeAdapter } from "./agent";
import type { AgentRuntimeRegistryAdapter } from "./agent";

const createLaunch =
  (runtime: string): AgentRuntimeRegistryAdapter["launch"] =>
  async () => ({
    schemaVersion: "2.0",
    status: "launch-dispatched",
    runtime,
    runId: "run-1",
    taskId: "task-1",
    runHandle: "handle-1",
    launchedAt: new Date().toISOString(),
    lifecycleBoundary: "prepare-first",
  });

describe("sdk/runtime", () => {
  it("exposes canonical runtime config path and default shape", async () => {
    const context = await createTempDir();

    try {
      expect(runtimeConfigPath({ cwd: context.tempDir })).toBe(
        path.join(context.tempDir, ".project-arch/runtime.config.json"),
      );
      expect(runtimeConfigDefault()).toEqual({
        schemaVersion: "2.0",
        profiles: [],
      });
    } finally {
      await context.cleanup();
    }
  });

  it("writes and reads runtime config through SDK wrappers", async () => {
    const context = await createTempDir();

    try {
      const writeResult = await runtimeConfigWrite({
        cwd: context.tempDir,
        config: {
          schemaVersion: "2.0",
          defaultProfile: "codex-implementer",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
            },
          ],
        },
      });
      resultAssertions.assertSuccess(writeResult);

      const readResult = await runtimeConfigRead({ cwd: context.tempDir });
      resultAssertions.assertSuccess(readResult);
      expect(readResult.data).toEqual(writeResult.data);
    } finally {
      await context.cleanup();
    }
  });

  it("surfaces invalid existing runtime config through inspect and validate hooks", async () => {
    const context = await createTempDir();

    try {
      const configPath = runtimeConfigPath({ cwd: context.tempDir });
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(
        configPath,
        {
          schemaVersion: "2.0",
          defaultProfile: "missing-profile",
          profiles: [],
        },
        { spaces: 2 },
      );

      const inspectResult = await runtimeConfigInspect({ cwd: context.tempDir });
      resultAssertions.assertSuccess(inspectResult);
      expect(inspectResult.data).toEqual({
        status: "invalid",
        path: ".project-arch/runtime.config.json",
        issues: [
          {
            code: "invalid-schema",
            path: "defaultProfile",
            message: "defaultProfile must reference an id from profiles.",
          },
        ],
      });

      expect(
        runtimeConfigValidate({
          schemaVersion: "2.0",
          defaultProfile: "missing-profile",
          profiles: [],
        }),
      ).toEqual(inspectResult.data);
    } finally {
      await context.cleanup();
    }
  });

  it("returns structured failures for invalid runtime config read and write operations", async () => {
    const context = await createTempDir();

    try {
      const configPath = runtimeConfigPath({ cwd: context.tempDir });
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeFile(configPath, "{ invalid", "utf8");

      const readResult = await runtimeConfigRead({ cwd: context.tempDir });
      resultAssertions.assertErrorContains(readResult, "Failed to read runtime profile config");

      const writeResult = await runtimeConfigWrite({
        cwd: context.tempDir,
        config: {
          schemaVersion: "2.0",
          defaultProfile: "missing-profile",
          profiles: [],
        },
      });
      resultAssertions.assertErrorContains(writeResult, "Cannot persist runtime profile config");
    } finally {
      await context.cleanup();
    }
  });

  it("lists runtime inventory from SDK read surface", async () => {
    const context = await createTempDir();
    const registry = createAgentRuntimeAdapterRegistry();

    try {
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
          launchedAt: "2026-04-03T23:00:00.000Z",
          lifecycleBoundary: "prepare-first",
        }),
      });

      await runtimeConfigWrite({
        cwd: context.tempDir,
        config: {
          schemaVersion: "2.0",
          defaultProfile: "codex-implementer",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: true,
            },
          ],
        },
      });

      const listResult = await runtimeList({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      resultAssertions.assertSuccess(listResult);
      expect(listResult.data.status).toBe("runtime-inventory");
      expect(listResult.data.defaultProfile).toBe("codex-implementer");
      expect(listResult.data.profiles).toHaveLength(1);
      expect(listResult.data.profiles[0]?.readiness).toBe("ready");
    } finally {
      await context.cleanup();
    }
  });

  it("returns explicit empty inventory and readiness when config is missing", async () => {
    const context = await createTempDir();

    try {
      const registry = createAgentRuntimeAdapterRegistry();

      const listResult = await runtimeList({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });
      resultAssertions.assertSuccess(listResult);
      expect(listResult.data.profiles).toEqual([]);
      expect(listResult.data.runtimes).toEqual([]);

      const checkResult = await runtimeCheck({
        cwd: context.tempDir,
        adapterRegistry: registry,
        checkedAt: "2026-04-03T23:30:00.000Z",
      });
      resultAssertions.assertSuccess(checkResult);
      expect(checkResult.data.profiles).toEqual([]);
      expect(checkResult.data.status).toBe("runtime-readiness-check");
    } finally {
      await context.cleanup();
    }
  });

  it("surfaces unavailable runtime and unknown profile check errors at SDK boundary", async () => {
    const context = await createTempDir();

    try {
      await runtimeConfigWrite({
        cwd: context.tempDir,
        config: {
          schemaVersion: "2.0",
          defaultProfile: "claude-planner",
          profiles: [
            {
              id: "claude-planner",
              runtime: "claude-cli",
              model: "claude-opus-4",
              enabled: true,
            },
          ],
        },
      });

      const registry = createAgentRuntimeAdapterRegistry();
      const listResult = await runtimeList({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });
      resultAssertions.assertSuccess(listResult);
      expect(listResult.data.profiles[0]?.readiness).toBe("runtime-unavailable");
      expect(listResult.data.profiles[0]?.status).toBe("not-ready");

      const checkResult = await runtimeCheck({
        cwd: context.tempDir,
        adapterRegistry: registry,
        profileId: "missing-profile",
      });
      resultAssertions.assertErrorContains(
        checkResult,
        "Runtime profile 'missing-profile' is not linked in runtime.config.json.",
      );
    } finally {
      await context.cleanup();
    }
  });

  it("mutates runtime profiles through SDK mutation surfaces", async () => {
    const context = await createTempDir();

    try {
      const linkResult = await runtimeLink({
        cwd: context.tempDir,
        id: "codex-implementer",
        runtime: "codex-cli",
        model: "gpt-5.4",
      });
      resultAssertions.assertSuccess(linkResult);
      expect(linkResult.data.profiles[0]?.id).toBe("codex-implementer");

      const updateResult = await runtimeUpdate({
        cwd: context.tempDir,
        profileId: "codex-implementer",
        model: "gpt-5.5",
      });
      resultAssertions.assertSuccess(updateResult);
      expect(updateResult.data.profiles[0]?.model).toBe("gpt-5.5");

      const disableResult = await runtimeDisable({
        cwd: context.tempDir,
        profileId: "codex-implementer",
      });
      resultAssertions.assertSuccess(disableResult);
      expect(disableResult.data.profiles[0]?.enabled).toBe(false);

      const enableResult = await runtimeEnable({
        cwd: context.tempDir,
        profileId: "codex-implementer",
      });
      resultAssertions.assertSuccess(enableResult);
      expect(enableResult.data.profiles[0]?.enabled).toBe(true);

      const defaultResult = await runtimeDefault({
        cwd: context.tempDir,
        profileId: "codex-implementer",
      });
      resultAssertions.assertSuccess(defaultResult);
      expect(defaultResult.data.defaultProfile).toBe("codex-implementer");

      const unlinkResult = await runtimeUnlink({
        cwd: context.tempDir,
        profileId: "codex-implementer",
      });
      resultAssertions.assertSuccess(unlinkResult);
      expect(unlinkResult.data.profiles).toEqual([]);
      expect(unlinkResult.data.defaultProfile).toBeUndefined();
    } finally {
      await context.cleanup();
    }
  });

  it("exposes runtimeScan through SDK wrapper with canonical results", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter: AgentRuntimeRegistryAdapter = {
      registration: {
        runtime: "ollama",
        schemaVersion: "2.0",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createLaunch("ollama"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found" as const,
        candidates: [
          {
            displayName: "Ollama Instance",
            confidence: "high" as const,
            suggestedModel: "llama2",
          },
        ],
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter);

    const result = await runtimeScan({ adapterRegistry: registry });

    resultAssertions.assertSuccess(result);
    expect(result.data.scanStatus).toBe("success");
    expect(result.data.candidates).toHaveLength(1);
    expect(result.data.candidates[0]?.displayName).toBe("Ollama Instance");
  });

  it("returns failed scan result when no adapters registered through SDK", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const result = await runtimeScan({ adapterRegistry: registry });

    resultAssertions.assertSuccess(result);
    expect(result.data.scanStatus).toBe("failed");
    expect(result.data.candidates).toHaveLength(0);
    expect(result.data.diagnostics.some((d) => d.code === "no-adapters-registered")).toBe(true);
  });

  it("bootstraps built-in adapters when runtimeScan is called without a registry", async () => {
    const result = await runtimeScan({});

    resultAssertions.assertSuccess(result);
    expect(result.data.diagnostics.some((d) => d.code === "no-adapters-registered")).toBe(false);
  });

  it("handles partial scan results through SDK wrapper", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const successAdapter: AgentRuntimeRegistryAdapter = {
      registration: {
        runtime: "ollama",
        schemaVersion: "2.0",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createLaunch("ollama"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found" as const,
        candidates: [{ displayName: "Ollama", confidence: "high" as const }],
      }),
    };

    const failureAdapter: AgentRuntimeRegistryAdapter = {
      registration: {
        runtime: "codex-cli",
        schemaVersion: "2.0",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createLaunch("codex-cli"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "codex-cli",
        status: "error" as const,
        candidates: [],
        errorMessage: "Scan failed",
      }),
    };

    registerAgentRuntimeAdapter(registry, successAdapter);
    registerAgentRuntimeAdapter(registry, failureAdapter);

    const result = await runtimeScan({ adapterRegistry: registry });

    resultAssertions.assertSuccess(result);
    expect(result.data.scanStatus).toBe("partial");
    expect(result.data.candidates).toHaveLength(1);
    expect(result.data.diagnostics.some((d) => d.code === "scan-probe-error")).toBe(true);
  });

  it("deduplicates candidates through SDK when multiple adapters find same runtime", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const adapter1: AgentRuntimeRegistryAdapter = {
      registration: {
        runtime: "ollama-a",
        schemaVersion: "2.0",
        displayName: "Ollama A",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createLaunch("ollama-a"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found" as const,
        candidates: [{ displayName: "Ollama", confidence: "high" as const }],
      }),
    };

    const adapter2: AgentRuntimeRegistryAdapter = {
      registration: {
        runtime: "ollama-b",
        schemaVersion: "2.0",
        displayName: "Ollama B",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createLaunch("ollama-b"),
      scanProbe: async () => ({
        schemaVersion: "2.0" as const,
        runtime: "ollama",
        status: "found" as const,
        candidates: [{ displayName: "Ollama", confidence: "medium" as const }],
      }),
    };

    registerAgentRuntimeAdapter(registry, adapter1);
    registerAgentRuntimeAdapter(registry, adapter2);

    const result = await runtimeScan({ adapterRegistry: registry });

    resultAssertions.assertSuccess(result);
    expect(result.data.candidates).toHaveLength(1);
    expect(result.data.diagnostics.some((d) => d.code === "ambiguous-candidate")).toBe(true);
  });

  it("returns error result when scan throws an exception through SDK", async () => {
    const registry = createAgentRuntimeAdapterRegistry();

    const faultyAdapter: AgentRuntimeRegistryAdapter = {
      registration: {
        runtime: "ollama",
        schemaVersion: "2.0",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
      },
      launch: createLaunch("ollama"),
      scanProbe: async () => {
        throw new Error("Adapter probe crashed");
      },
    };

    registerAgentRuntimeAdapter(registry, faultyAdapter);

    const result = await runtimeScan({ adapterRegistry: registry });

    resultAssertions.assertSuccess(result);
    expect(result.data.scanStatus).toBe("failed");
    expect(result.data.diagnostics.some((d) => d.code === "scan-probe-failed")).toBe(true);
  });
});
