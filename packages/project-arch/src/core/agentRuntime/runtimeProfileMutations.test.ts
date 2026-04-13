import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test/helpers";
import {
  linkRuntimeProfile,
  RuntimeProfileMutationError,
  setRuntimeDefaultProfile,
  setRuntimeProfileEnabled,
  unlinkRuntimeProfile,
  updateRuntimeProfile,
} from "./runtimeProfileMutations";
import type { RuntimeProfile } from "../../schemas/runtimeProfileConfig";
import { createAgentRuntimeAdapterRegistry, registerAgentRuntimeAdapter } from "./adapters";
import { readRuntimeProfileConfig, writeRuntimeProfileConfig } from "./runtimeProfiles";

describe("core/agentRuntime/runtimeProfileMutations", () => {
  it("links profile into missing config with deterministic defaults and timestamps", async () => {
    const context = await createTempDir();

    try {
      const result = await linkRuntimeProfile({
        cwd: context.tempDir,
        id: "codex-implementer",
        runtime: "codex-cli",
        model: "gpt-5.4",
        setDefault: true,
        updatedAt: "2026-04-03T23:50:00.000Z",
      });

      expect(result.defaultProfile).toBe("codex-implementer");
      expect(result.profiles).toEqual([
        expect.objectContaining({
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
          enabled: true,
          updatedAt: "2026-04-03T23:50:00.000Z",
        }),
      ]);
    } finally {
      await context.cleanup();
    }
  });

  it("rejects duplicate profile ids when linking", async () => {
    const context = await createTempDir();

    try {
      await linkRuntimeProfile({
        cwd: context.tempDir,
        id: "codex-implementer",
        runtime: "codex-cli",
        model: "gpt-5.4",
      });

      await expect(
        linkRuntimeProfile({
          cwd: context.tempDir,
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProfileMutationError",
        code: "PAA025",
      } satisfies Partial<RuntimeProfileMutationError>);
    } finally {
      await context.cleanup();
    }
  });

  it("rejects updates for missing target profiles", async () => {
    const context = await createTempDir();

    try {
      await expect(
        updateRuntimeProfile({
          cwd: context.tempDir,
          profileId: "missing-profile",
          model: "gpt-5.4",
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProfileMutationError",
        code: "PAA024",
      } satisfies Partial<RuntimeProfileMutationError>);
    } finally {
      await context.cleanup();
    }
  });

  it("enforces adapter-owned option validation during mutations", async () => {
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
              nextStep: "Use one of readonly/workspace-write/full-access.",
            },
          ],
        }),
      });

      await expect(
        linkRuntimeProfile({
          cwd: context.tempDir,
          adapterRegistry: registry,
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
          adapterOptions: {
            approvalMode: "unknown",
          },
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProfileMutationError",
        code: "PAA028",
      } satisfies Partial<RuntimeProfileMutationError>);

      await expect(readRuntimeProfileConfig(context.tempDir)).resolves.toBeNull();
    } finally {
      await context.cleanup();
    }
  });

  it("applies bounded updates and allows clearing optional fields", async () => {
    const context = await createTempDir();

    try {
      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          defaultProfile: "codex-implementer",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              label: "Implementer",
              purpose: "Ship changes",
              preferredFor: ["run"],
              parameters: { temperature: 0.2 },
              adapterOptions: { approvalMode: "workspace-write" },
              enabled: true,
            },
          ],
        },
        context.tempDir,
      );

      const result = await updateRuntimeProfile({
        cwd: context.tempDir,
        profileId: "codex-implementer",
        model: "gpt-5.5",
        label: null,
        purpose: null,
        preferredFor: null,
        parameters: null,
        adapterOptions: null,
        updatedAt: "2026-04-03T23:55:00.000Z",
      });

      expect(result.profiles[0]).toEqual(
        expect.objectContaining({
          id: "codex-implementer",
          model: "gpt-5.5",
          label: undefined,
          purpose: undefined,
          preferredFor: undefined,
          parameters: undefined,
          adapterOptions: undefined,
          updatedAt: "2026-04-03T23:55:00.000Z",
        }),
      );
    } finally {
      await context.cleanup();
    }
  });

  it("supports enable/disable, default transitions, and unlink with default clearing", async () => {
    const context = await createTempDir();

    try {
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

      const disabled = await setRuntimeProfileEnabled({
        cwd: context.tempDir,
        profileId: "codex-implementer",
        enabled: false,
      });
      expect(
        disabled.profiles.find((entry: RuntimeProfile) => entry.id === "codex-implementer")
          ?.enabled,
      ).toBe(false);

      const defaultSwitched = await setRuntimeDefaultProfile({
        cwd: context.tempDir,
        profileId: "claude-planner",
      });
      expect(defaultSwitched.defaultProfile).toBe("claude-planner");

      const unlinked = await unlinkRuntimeProfile({
        cwd: context.tempDir,
        profileId: "claude-planner",
      });
      expect(unlinked.defaultProfile).toBeUndefined();
      expect(unlinked.profiles.map((profile: RuntimeProfile) => profile.id)).toEqual([
        "codex-implementer",
      ]);
    } finally {
      await context.cleanup();
    }
  });

  it("rejects invalid default transition commands", async () => {
    const context = await createTempDir();

    try {
      await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
            },
          ],
        },
        context.tempDir,
      );

      await expect(
        updateRuntimeProfile({
          cwd: context.tempDir,
          profileId: "codex-implementer",
          setDefault: true,
          clearDefault: true,
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProfileMutationError",
        code: "PAA027",
      } satisfies Partial<RuntimeProfileMutationError>);

      await expect(
        setRuntimeDefaultProfile({
          cwd: context.tempDir,
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProfileMutationError",
        code: "PAA027",
      } satisfies Partial<RuntimeProfileMutationError>);
    } finally {
      await context.cleanup();
    }
  });
});
