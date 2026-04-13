import fs from "fs-extra";
import path from "path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test/helpers";
import {
  createBootstrappedAgentRuntimeAdapterRegistry,
  listAgentRuntimeAdapters,
} from "./adapters";
import {
  createUserConfiguredRuntimeAdapters,
  loadUserRuntimeAdapterConfig,
  UserAdapterConfigError,
} from "./userAdapters";

describe("core/agentRuntime/userAdapters", () => {
  it("returns null config and empty adapters when user config file is missing", async () => {
    const context = await createTempDir();

    try {
      expect(loadUserRuntimeAdapterConfig(context.tempDir)).toBeNull();
      expect(createUserConfiguredRuntimeAdapters({ cwd: context.tempDir })).toEqual([]);
    } finally {
      await context.cleanup();
    }
  });

  it("loads configured adapters and executes bounded http/binary probes", async () => {
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
            {
              runtime: "claude-code",
              displayName: "Claude Code CLI",
              probeType: "binary-path",
              probeTarget: "claude",
            },
          ],
        },
        { spaces: 2 },
      );

      const adapters = createUserConfiguredRuntimeAdapters({
        cwd: context.tempDir,
        dependencies: {
          hasCommandInPath: (command) => command === "claude",
          probeHttpJson: async (url) =>
            url === "http://localhost:2050/v1/models"
              ? {
                  ok: true,
                  status: 200,
                  payload: {
                    data: [{ id: "claude-3-7-sonnet" }],
                  },
                }
              : { ok: false },
        },
      });

      expect(adapters.map((adapter) => adapter.registration.runtime).sort()).toEqual([
        "claude-code",
        "cursor-agent",
      ]);

      const cursor = adapters.find((adapter) => adapter.registration.runtime === "cursor-agent");
      const cursorProbe = await cursor?.scanProbe?.({
        schemaVersion: "2.0",
        runtime: "cursor-agent",
      });
      expect(cursorProbe?.status).toBe("found");
      expect(cursorProbe?.candidates[0]).toEqual(
        expect.objectContaining({
          source: "config-file",
          confidence: "medium",
          suggestedModel: "claude-3-7-sonnet",
        }),
      );

      const claude = adapters.find((adapter) => adapter.registration.runtime === "claude-code");
      const claudeProbe = await claude?.scanProbe?.({
        schemaVersion: "2.0",
        runtime: "claude-code",
      });
      expect(claudeProbe?.status).toBe("found");
      expect(claudeProbe?.candidates[0]).toEqual(
        expect.objectContaining({
          source: "config-file",
          confidence: "high",
        }),
      );
    } finally {
      await context.cleanup();
    }
  });

  it("rejects malformed or unsafe user config declarations", async () => {
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
              runtime: "unsafe",
              displayName: "Unsafe",
              probeType: "binary-path",
              probeTarget: "tool",
              shellCommand: "sh -c 'echo unsafe'",
            },
          ],
        },
        { spaces: 2 },
      );

      expect(() => loadUserRuntimeAdapterConfig(context.tempDir)).toThrow(UserAdapterConfigError);
      expect(() => loadUserRuntimeAdapterConfig(context.tempDir)).toThrow(
        /Invalid user adapter config/i,
      );
    } finally {
      await context.cleanup();
    }
  });

  it("rejects duplicate runtime ids between built-ins and user-config adapters", async () => {
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
              runtime: "codex-cli",
              displayName: "User Override",
              probeType: "binary-path",
              probeTarget: "codex",
            },
          ],
        },
        { spaces: 2 },
      );

      expect(() =>
        createBootstrappedAgentRuntimeAdapterRegistry({
          cwd: context.tempDir,
          builtInDependencies: {
            hasCommandInPath: () => false,
            probeHttpJson: async () => ({ ok: false }),
            readEnv: () => undefined,
          },
          userConfiguredDependencies: {
            hasCommandInPath: () => true,
          },
        }),
      ).toThrow(/already registered/i);
    } finally {
      await context.cleanup();
    }
  });

  it("merges user-config runtimes into bootstrapped registry", async () => {
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
              runtime: "jan-local",
              displayName: "Jan Local",
              probeType: "http-endpoint",
              probeTarget: "http://localhost:1337/v1/models",
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
          probeHttpJson: async () => ({ ok: true, status: 200, payload: { data: [] } }),
          hasCommandInPath: () => false,
        },
      });

      const runtimes = listAgentRuntimeAdapters(registry).map((entry) => entry.runtime);
      expect(runtimes).toContain("jan-local");
      expect(runtimes).toContain("codex-cli");
    } finally {
      await context.cleanup();
    }
  });
});
