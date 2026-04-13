import { describe, expect, it } from "vitest";
import { createBuiltInRuntimeAdapters } from "./builtInAdapters";
import {
  createBootstrappedAgentRuntimeAdapterRegistry,
  listAgentRuntimeAdapters,
} from "./adapters";

describe("core/agentRuntime/builtInAdapters", () => {
  it("registers deterministic built-in runtimes in bootstrapped registry", () => {
    const registry = createBootstrappedAgentRuntimeAdapterRegistry({
      builtInDependencies: {
        hasCommandInPath: () => false,
        probeHttpJson: async () => ({ ok: false }),
        readEnv: () => undefined,
      },
    });

    expect(listAgentRuntimeAdapters(registry).map((entry) => entry.runtime)).toEqual([
      "codex-cli",
      "lm-studio",
      "ollama",
      "openai",
    ]);
  });

  it("discovers codex-cli via system path probe with suggested model", async () => {
    const adapters = createBuiltInRuntimeAdapters({
      hasCommandInPath: (command) => command === "codex",
      probeHttpJson: async () => ({ ok: false }),
      readEnv: () => undefined,
    });
    const codex = adapters.find((adapter) => adapter.registration.runtime === "codex-cli");

    const probe = await codex?.scanProbe?.({ schemaVersion: "2.0", runtime: "codex-cli" });

    expect(probe?.status).toBe("found");
    expect(probe?.candidates[0]).toEqual(
      expect.objectContaining({
        displayName: "Codex CLI",
        source: "system-path",
        suggestedModel: "gpt-5.4",
      }),
    );
  });

  it("discovers lm-studio using bounded local endpoint probe", async () => {
    const adapters = createBuiltInRuntimeAdapters({
      hasCommandInPath: () => false,
      probeHttpJson: async (url) => {
        if (url === "http://localhost:1234/v1/models") {
          return {
            ok: true,
            status: 200,
            payload: {
              data: [{ id: "mistral-small" }],
            },
          };
        }

        return { ok: false };
      },
      readEnv: () => undefined,
    });

    const lmStudio = adapters.find((adapter) => adapter.registration.runtime === "lm-studio");
    const probe = await lmStudio?.scanProbe?.({ schemaVersion: "2.0", runtime: "lm-studio" });

    expect(probe?.status).toBe("found");
    expect(probe?.candidates[0]).toEqual(
      expect.objectContaining({
        displayName: "LM Studio",
        suggestedModel: "mistral-small",
      }),
    );
  });

  it("reports openai missing-auth readiness when OPENAI_API_KEY is absent", async () => {
    const adapters = createBuiltInRuntimeAdapters({
      hasCommandInPath: () => false,
      probeHttpJson: async () => ({ ok: false }),
      readEnv: () => undefined,
    });

    const openai = adapters.find((adapter) => adapter.registration.runtime === "openai");
    const readiness = await openai?.checkReadiness?.({
      schemaVersion: "2.0",
      runtime: "openai",
      profileId: "openai-default",
      model: "gpt-5.4",
    });

    expect(readiness?.status).toBe("missing-auth");
    expect(readiness?.diagnostics[0]?.code).toBe("missing-auth");
  });
});
