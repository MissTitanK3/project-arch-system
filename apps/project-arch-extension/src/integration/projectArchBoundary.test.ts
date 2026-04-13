import { describe, expect, it, vi } from "vitest";
import { createProjectArchBoundary, PROJECT_ARCH_DEFAULT_TRANSPORT } from "./projectArchBoundary";

describe("projectArchBoundary", () => {
  it("uses CLI JSON as the default transport boundary", () => {
    const boundary = createProjectArchBoundary();
    expect(boundary.transport).toBe(PROJECT_ARCH_DEFAULT_TRANSPORT);
    expect(boundary.cliCommand).toBe("pa");
  });

  it("forces --json for CLI command transport", async () => {
    const cliExecutor = vi.fn(async () => ({
      stdout: JSON.stringify({ status: "ok" }),
      stderr: "",
      exitCode: 0,
    }));
    const boundary = createProjectArchBoundary({
      cliCommand: "pa",
      cliExecutor,
    });

    await boundary.runCliJson({ args: ["agent", "status", "run-1"] });

    expect(cliExecutor).toHaveBeenCalledWith({
      command: "pa",
      args: ["agent", "status", "run-1", "--json"],
      cwd: undefined,
    });
  });

  it("throws when CLI output is not valid JSON", async () => {
    const boundary = createProjectArchBoundary({
      cliExecutor: async () => ({
        stdout: "not-json",
        stderr: "",
        exitCode: 0,
      }),
    });

    await expect(boundary.runCliJson({ args: ["agent", "status"] })).rejects.toThrow(
      "did not return valid JSON",
    );
  });

  it("uses canonical project-arch schema hooks for result bundle parsing", () => {
    const boundary = createProjectArchBoundary();

    const parsed = boundary.parseResultBundle({
      schemaVersion: "2.0",
      runId: "run-2026-04-02-180000",
      taskId: "001",
      runtime: { name: "codex-cli", version: "0.0.0-dev" },
      status: "completed",
      summary: "Completed run output.",
      changedFiles: ["apps/project-arch-extension/src/integration/projectArchBoundary.ts"],
      commandsRun: [{ command: "pnpm --filter project-arch-extension test", exitCode: 0 }],
      evidence: {
        diffSummary: "Added integration boundary.",
        changedFileCount: 1,
        testsPassed: true,
        lintPassed: true,
        typecheckPassed: true,
      },
      policyFindings: [],
      completedAt: "2026-04-02T18:00:03.000Z",
    });

    expect(parsed.status).toBe("completed");
  });

  it("parses runtime inventory and readiness artifacts through canonical hooks", () => {
    const boundary = createProjectArchBoundary();

    const inventory = boundary.parseRuntimeInventoryListResult({
      schemaVersion: "2.0",
      status: "runtime-inventory",
      defaultProfile: "codex-implementer",
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
          model: "gpt-5.4",
          enabled: true,
          default: true,
          linked: true,
          available: true,
          readiness: "ready",
          status: "ready",
          diagnostics: [],
        },
      ],
    });

    const readiness = boundary.parseRuntimeReadinessCheckResult({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-03T23:00:00.000Z",
      profileId: "codex-implementer",
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
          enabled: true,
          default: true,
          linked: true,
          available: true,
          readiness: "ready",
          status: "ready",
          diagnostics: [],
        },
      ],
    });

    expect(inventory.status).toBe("runtime-inventory");
    expect(readiness.status).toBe("runtime-readiness-check");
    expect(readiness.profileId).toBe("codex-implementer");
  });

  it("reads runtime inventory and readiness through stable CLI helpers", async () => {
    const cliExecutor = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          schemaVersion: "2.0",
          status: "runtime-inventory",
          defaultProfile: "codex-implementer",
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
              model: "gpt-5.4",
              enabled: true,
              default: true,
              linked: true,
              available: true,
              readiness: "ready",
              status: "ready",
              diagnostics: [],
            },
          ],
        }),
        stderr: "",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          schemaVersion: "2.0",
          status: "runtime-readiness-check",
          checkedAt: "2026-04-03T23:00:00.000Z",
          profileId: "codex-implementer",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
              enabled: true,
              default: true,
              linked: true,
              available: true,
              readiness: "ready",
              status: "ready",
              diagnostics: [],
            },
          ],
        }),
        stderr: "",
        exitCode: 0,
      });

    const boundary = createProjectArchBoundary({
      cliExecutor,
    });

    const inventory = await boundary.readRuntimeInventoryList({
      cwd: "/repo",
    });
    const readiness = await boundary.readRuntimeReadinessCheck({
      cwd: "/repo",
      profileId: "codex-implementer",
    });

    expect(cliExecutor).toHaveBeenNthCalledWith(1, {
      command: "pa",
      args: ["runtime", "list", "--json"],
      cwd: "/repo",
    });
    expect(cliExecutor).toHaveBeenNthCalledWith(2, {
      command: "pa",
      args: ["runtime", "check", "codex-implementer", "--json"],
      cwd: "/repo",
    });
    expect(inventory.defaultProfile).toBe("codex-implementer");
    expect(readiness.profileId).toBe("codex-implementer");
  });

  it("invokes live Ollama stage chat inference through boundary transport", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        message: {
          content: "Live Ollama response.",
        },
      }),
    }));

    const boundary = createProjectArchBoundary({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await boundary.invokeStageChatInference!({
      profileId: "local-ollama",
      runtime: "ollama",
      model: "llama3.1",
      messageText: "Summarize stage blockers.",
      stageTitle: "Implementation",
      taskPath: "feedback/phases/phase-a/tasks/planned/001.md",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: expect.stringContaining('"stream":true'),
      }),
    );
    expect(result.responseText).toBe("Live Ollama response.");
    expect(result.source).toBe("ollama-api");
  });

  it("aggregates streamed Ollama NDJSON chunks for stage chat inference", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(
        JSON.stringify({ message: { content: "Live " }, done: false }) +
          "\n" +
          JSON.stringify({ message: { content: "Ollama " }, done: false }) +
          "\n",
      ),
      encoder.encode(JSON.stringify({ message: { content: "response." }, done: true }) + "\n"),
    ];
    let index = 0;

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      body: {
        getReader: () => ({
          read: async () => {
            if (index >= chunks.length) {
              return { value: undefined, done: true };
            }

            const value = chunks[index];
            index += 1;
            return { value, done: false };
          },
        }),
      },
    }));

    const boundary = createProjectArchBoundary({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const partialResponses: string[] = [];

    const result = await boundary.invokeStageChatInference!({
      profileId: "local-ollama",
      runtime: "ollama",
      model: "llama3.1",
      messageText: "Summarize stage blockers.",
      stageTitle: "Implementation",
      taskPath: "feedback/phases/phase-a/tasks/planned/001.md",
      onPartialResponse: (chunk) => {
        partialResponses.push(chunk);
      },
    });

    expect(partialResponses).toEqual(["Live ", "Ollama ", "response."]);
    expect(result.responseText).toBe("Live Ollama response.");
    expect(result.source).toBe("ollama-api");
  });

  it("rejects unsupported runtime for live stage chat inference", async () => {
    const boundary = createProjectArchBoundary();

    await expect(
      boundary.invokeStageChatInference!({
        profileId: "codex-implementer",
        runtime: "codex-cli",
        model: "gpt-5.4",
        messageText: "hello",
      }),
    ).rejects.toThrow("unsupported runtime");
  });

  it("surfaces explicit timeout error for live stage chat inference", async () => {
    const abortError = Object.assign(new Error("Request aborted"), {
      name: "AbortError",
    });
    const fetchImpl = vi.fn(async () => {
      throw abortError;
    });

    const boundary = createProjectArchBoundary({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      boundary.invokeStageChatInference!({
        profileId: "local-ollama",
        runtime: "ollama",
        model: "llama3.1",
        messageText: "Summarize stage blockers.",
      }),
    ).rejects.toThrow("timed out");
  });

  it("surfaces explicit transport error for live stage chat inference", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    });

    const boundary = createProjectArchBoundary({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      boundary.invokeStageChatInference!({
        profileId: "local-ollama",
        runtime: "ollama",
        model: "llama3.1",
        messageText: "Summarize stage blockers.",
      }),
    ).rejects.toThrow("transport request failed");
  });
});
