import { describe, expect, it, vi } from "vitest";
import {
  buildRuntimeInventory,
  buildRuntimeReadinessCheck,
  parseRuntimeInventoryListResult,
  parseRuntimeReadinessCheckResult,
  RuntimeInventoryBuildError,
  safeParseRuntimeInventoryListResult,
  safeParseRuntimeReadinessCheckResult,
} from "./runtimeInventoryReadiness";
import { createAgentRuntimeAdapterRegistry, registerAgentRuntimeAdapter } from "./adapters";
import { createTempDir } from "../../test/helpers";
import { writeRuntimeProfileConfig } from "./runtimeProfiles";

describe("core/agentRuntime/runtimeInventoryReadiness", () => {
  it("parses valid runtime inventory list payloads", () => {
    const parsed = parseRuntimeInventoryListResult({
      schemaVersion: "2.0",
      status: "runtime-inventory",
      runtimes: [
        {
          runtime: "codex-cli",
          displayName: "Codex CLI",
          available: true,
          availabilitySource: "adapter-registry",
          profiles: ["codex-implementer"],
        },
      ],
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          enabled: true,
          default: true,
          linked: true,
          available: true,
          readiness: "ready",
          status: "ready",
          diagnostics: [],
        },
      ],
      defaultProfile: "codex-implementer",
    });

    expect(parsed.status).toBe("runtime-inventory");
  });

  it("returns unsuccessful safe parse for invalid inventory payloads", () => {
    const parsed = safeParseRuntimeInventoryListResult({
      schemaVersion: "2.0",
      status: "runtime-inventory",
      defaultProfile: "missing",
      runtimes: [],
      profiles: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("parses valid runtime readiness check payloads", () => {
    const parsed = parseRuntimeReadinessCheckResult({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-03T21:00:00.000Z",
      profiles: [
        {
          id: "claude-planner",
          runtime: "claude-cli",
          enabled: true,
          default: false,
          linked: true,
          available: true,
          readiness: "missing-auth",
          status: "not-ready",
          diagnostics: [
            {
              code: "missing-auth",
              severity: "error",
              message: "No authenticated runtime session is available.",
              nextStep: "Authenticate runtime credentials.",
            },
          ],
        },
      ],
    });

    expect(parsed.status).toBe("runtime-readiness-check");
  });

  it("returns unsuccessful safe parse for invalid readiness payloads", () => {
    const parsed = safeParseRuntimeReadinessCheckResult({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-03T21:00:00.000Z",
      profileId: "codex-implementer",
      profiles: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("assembles explicit empty inventory when config is missing", async () => {
    const context = await createTempDir();

    try {
      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: createAgentRuntimeAdapterRegistry(),
      });

      expect(inventory.defaultProfile).toBeUndefined();
      expect(inventory.runtimes).toEqual([]);
      expect(inventory.profiles).toEqual([]);
    } finally {
      await context.cleanup();
    }
  });

  it("merges available unlinked runtimes and linked unavailable profiles", async () => {
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

      await writeRuntimeProfileConfig(
        {
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
        context.tempDir,
      );

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      expect(
        inventory.runtimes.map((entry) => [entry.runtime, entry.available, entry.profiles]),
      ).toEqual([
        ["claude-cli", false, ["claude-planner"]],
        ["codex-cli", true, []],
      ]);
      expect(inventory.profiles).toEqual([
        expect.objectContaining({
          id: "claude-planner",
          linked: true,
          available: false,
          readiness: "runtime-unavailable",
          status: "not-ready",
        }),
      ]);
    } finally {
      await context.cleanup();
    }
  });

  it("surfaces config-file availability source for user-declared adapters", async () => {
    const context = await createTempDir();
    const registry = createAgentRuntimeAdapterRegistry();

    try {
      registerAgentRuntimeAdapter(registry, {
        availabilitySource: "config-file",
        registration: {
          schemaVersion: "2.0",
          runtime: "cursor-agent",
          displayName: "Cursor Agent",
          launchContract: "agent-runtime-launch-v1",
          ownership: "adapter-managed",
        },
        launch: async (input) => ({
          schemaVersion: "2.0",
          runtime: input.runtime,
          runId: input.runId,
          taskId: input.taskId,
          status: "launch-dispatched",
          runHandle: `cursor-agent:${input.runId}`,
          launchedAt: "2026-04-03T23:00:00.000Z",
          lifecycleBoundary: "prepare-first",
        }),
      });

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      expect(inventory.runtimes).toEqual([
        expect.objectContaining({
          runtime: "cursor-agent",
          availabilitySource: "config-file",
        }),
      ]);
    } finally {
      await context.cleanup();
    }
  });

  it("projects disabled profiles into disabled readiness and status", async () => {
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

      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: false,
            },
          ],
        },
        context.tempDir,
      );

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });
      expect(inventory.profiles).toEqual([
        expect.objectContaining({
          id: "codex-implementer",
          enabled: false,
          readiness: "disabled",
          status: "disabled",
        }),
      ]);
    } finally {
      await context.cleanup();
    }
  });

  it("builds readiness check results for all profiles or one selected profile", async () => {
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

      await writeRuntimeProfileConfig(
        {
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
        context.tempDir,
      );

      const allProfiles = await buildRuntimeReadinessCheck({
        cwd: context.tempDir,
        adapterRegistry: registry,
        checkedAt: "2026-04-03T23:10:00.000Z",
      });
      expect(allProfiles.profiles).toHaveLength(1);
      expect(allProfiles.profileId).toBeUndefined();

      const oneProfile = await buildRuntimeReadinessCheck({
        cwd: context.tempDir,
        adapterRegistry: registry,
        profileId: "codex-implementer",
        checkedAt: "2026-04-03T23:10:00.000Z",
      });
      expect(oneProfile.profileId).toBe("codex-implementer");
      expect(oneProfile.profiles).toHaveLength(1);
      expect(oneProfile.profiles[0]?.id).toBe("codex-implementer");
    } finally {
      await context.cleanup();
    }
  });

  it("throws explicit error when profile-scoped readiness check references an unknown profile", async () => {
    const context = await createTempDir();

    try {
      await expect(
        buildRuntimeReadinessCheck({
          cwd: context.tempDir,
          adapterRegistry: createAgentRuntimeAdapterRegistry(),
          profileId: "missing-profile",
          checkedAt: "2026-04-03T23:20:00.000Z",
        }),
      ).rejects.toMatchObject({
        name: "RuntimeInventoryBuildError",
        code: "PAA023",
      } satisfies Partial<RuntimeInventoryBuildError>);
    } finally {
      await context.cleanup();
    }
  });

  it("surfaces invalid-config when adapter option validation fails before readiness checks", async () => {
    const context = await createTempDir();
    const registry = createAgentRuntimeAdapterRegistry();
    const checkReadiness = vi.fn(async (input: { runtime: string; profileId: string }) => ({
      schemaVersion: "2.0" as const,
      runtime: input.runtime,
      profileId: input.profileId,
      status: "ready" as const,
      diagnostics: [],
    }));

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
        validateOptions: async (input) => ({
          schemaVersion: "2.0",
          runtime: input.runtime,
          profileId: input.profileId,
          status: "invalid",
          diagnostics: [
            {
              code: "invalid-config",
              severity: "error",
              message: "approvalMode is invalid.",
              nextStep: "Use a supported approvalMode value.",
            },
          ],
        }),
        checkReadiness,
      });

      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: true,
              adapterOptions: {
                approvalMode: "unknown",
              },
            },
          ],
        },
        context.tempDir,
      );

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      expect(inventory.profiles[0]).toEqual(
        expect.objectContaining({
          id: "codex-implementer",
          readiness: "invalid-config",
          status: "not-ready",
        }),
      );
      expect(inventory.profiles[0]?.diagnostics[0]?.code).toBe("invalid-config");
      expect(checkReadiness).not.toHaveBeenCalled();
    } finally {
      await context.cleanup();
    }
  });

  it("surfaces adapter-backed missing-auth and missing-binary statuses", async () => {
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
        checkReadiness: async (input) => ({
          schemaVersion: "2.0",
          runtime: input.runtime,
          profileId: input.profileId,
          status: "missing-auth",
          diagnostics: [
            {
              code: "missing-auth",
              severity: "error",
              message: "No authenticated runtime session is available.",
              nextStep: "Authenticate runtime credentials.",
            },
          ],
        }),
      });

      registerAgentRuntimeAdapter(registry, {
        registration: {
          schemaVersion: "2.0",
          runtime: "claude-cli",
          displayName: "Claude CLI",
          launchContract: "agent-runtime-launch-v1",
          ownership: "adapter-managed",
        },
        launch: async (input) => ({
          schemaVersion: "2.0",
          runtime: input.runtime,
          runId: input.runId,
          taskId: input.taskId,
          status: "launch-dispatched",
          runHandle: `claude-cli:${input.runId}`,
          launchedAt: "2026-04-03T23:00:00.000Z",
          lifecycleBoundary: "prepare-first",
        }),
        checkReadiness: async (input) => ({
          schemaVersion: "2.0",
          runtime: input.runtime,
          profileId: input.profileId,
          status: "missing-binary",
          diagnostics: [
            {
              code: "missing-binary",
              severity: "error",
              message: "Runtime executable is missing from PATH.",
              nextStep: "Install runtime binary and retry.",
            },
          ],
        }),
      });

      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: true,
            },
            {
              id: "claude-planner",
              runtime: "claude-cli",
              model: "claude-opus-4",
              enabled: true,
            },
          ],
        },
        context.tempDir,
      );

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      expect(inventory.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "codex-implementer",
            readiness: "missing-auth",
            status: "not-ready",
          }),
          expect.objectContaining({
            id: "claude-planner",
            readiness: "missing-binary",
            status: "not-ready",
          }),
        ]),
      );
    } finally {
      await context.cleanup();
    }
  });

  it("surfaces adapter-check-failed when adapter readiness check throws", async () => {
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
        checkReadiness: async () => {
          throw new Error("runtime probe timed out");
        },
      });

      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: true,
            },
          ],
        },
        context.tempDir,
      );

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      expect(inventory.profiles[0]).toEqual(
        expect.objectContaining({
          id: "codex-implementer",
          readiness: "adapter-check-failed",
          status: "not-ready",
        }),
      );
      expect(inventory.profiles[0]?.diagnostics[0]?.code).toBe("adapter-check-failed");
      expect(inventory.profiles[0]?.diagnostics[0]?.message).toContain("runtime probe timed out");
    } finally {
      await context.cleanup();
    }
  });

  it("runs adapter-backed hooks only for enabled linked profiles with available runtime", async () => {
    const context = await createTempDir();
    const registry = createAgentRuntimeAdapterRegistry();
    const validateOptions = vi.fn(async (input: { runtime: string; profileId: string }) => ({
      schemaVersion: "2.0" as const,
      runtime: input.runtime,
      profileId: input.profileId,
      status: "valid" as const,
      diagnostics: [],
    }));
    const checkReadiness = vi.fn(async (input: { runtime: string; profileId: string }) => ({
      schemaVersion: "2.0" as const,
      runtime: input.runtime,
      profileId: input.profileId,
      status: "ready" as const,
      diagnostics: [],
    }));

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
        validateOptions,
        checkReadiness,
      });

      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          profiles: [
            {
              id: "disabled-profile",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: false,
            },
            {
              id: "unavailable-profile",
              runtime: "claude-cli",
              model: "claude-opus-4",
              enabled: true,
            },
            {
              id: "ready-profile",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: true,
            },
          ],
        },
        context.tempDir,
      );

      const inventory = await buildRuntimeInventory({
        cwd: context.tempDir,
        adapterRegistry: registry,
      });

      expect(inventory.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "disabled-profile", readiness: "disabled" }),
          expect.objectContaining({ id: "unavailable-profile", readiness: "runtime-unavailable" }),
          expect.objectContaining({ id: "ready-profile", readiness: "ready" }),
        ]),
      );
      expect(validateOptions).toHaveBeenCalledTimes(1);
      expect(checkReadiness).toHaveBeenCalledTimes(1);
      expect(validateOptions.mock.calls[0]?.[0]?.profileId).toBe("ready-profile");
      expect(checkReadiness.mock.calls[0]?.[0]?.profileId).toBe("ready-profile");
    } finally {
      await context.cleanup();
    }
  });
});
