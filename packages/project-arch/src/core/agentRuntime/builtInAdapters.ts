import { spawnSync } from "child_process";
import http from "node:http";
import https from "node:https";
import type { RuntimeScanCandidateSource } from "../../schemas/runtimeScanResult";
import type { AgentRuntimeAdapter } from "./adapters";

const PROBE_TIMEOUT_MS = 1200;

interface HttpProbeResult {
  ok: boolean;
  status?: number;
  payload?: unknown;
  error?: string;
}

export interface BuiltInRuntimeAdapterDependencies {
  hasCommandInPath?: (command: string) => boolean;
  probeHttpJson?: (url: string, timeoutMs?: number) => Promise<HttpProbeResult>;
  readEnv?: (name: string) => string | undefined;
}

function launchNotImplemented(runtime: string) {
  return async () => {
    throw new Error(
      `Runtime adapter '${runtime}' is registered for discovery/readiness only and does not support launch dispatch yet.`,
    );
  };
}

function defaultHasCommandInPath(command: string): boolean {
  const result = spawnSync("which", [command], {
    stdio: "ignore",
    encoding: "utf8",
  });

  return result.status === 0;
}

function requestJson(url: string, timeoutMs: number): Promise<HttpProbeResult> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      parsed,
      {
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode;
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", (error) => {
          resolve({ ok: false, status, error: error.message });
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!status || status < 200 || status >= 300) {
            resolve({
              ok: false,
              status,
              error: `HTTP ${status}`,
            });
            return;
          }

          try {
            const payload = JSON.parse(body) as unknown;
            resolve({ ok: true, status, payload });
          } catch (error) {
            resolve({
              ok: false,
              status,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    req.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });

    req.end();
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function candidateWithSource(input: {
  displayName: string;
  confidence: "high" | "medium" | "low";
  source: RuntimeScanCandidateSource;
  description?: string;
  suggestedModel?: string;
  suggestedLabel?: string;
}) {
  return {
    displayName: input.displayName,
    confidence: input.confidence,
    source: input.source,
    description: input.description,
    suggestedModel: input.suggestedModel,
    suggestedLabel: input.suggestedLabel,
  };
}

function hasAnyEnvAuth(readEnv: (name: string) => string | undefined, keys: string[]): boolean {
  return keys.some((key) => {
    const value = readEnv(key);
    return !!value && value.trim().length > 0;
  });
}

export function createBuiltInRuntimeAdapters(
  deps: BuiltInRuntimeAdapterDependencies = {},
): AgentRuntimeAdapter[] {
  const hasCommandInPath = deps.hasCommandInPath ?? defaultHasCommandInPath;
  const probeHttpJson = deps.probeHttpJson ?? requestJson;
  const readEnv = deps.readEnv ?? ((name: string) => process.env[name]);

  return [
    {
      registration: {
        schemaVersion: "2.0",
        runtime: "codex-cli",
        displayName: "Codex CLI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
        description: "Codex CLI runtime discovered via system PATH.",
      },
      launch: launchNotImplemented("codex-cli"),
      scanProbe: async () => {
        if (!hasCommandInPath("codex")) {
          return {
            schemaVersion: "2.0" as const,
            runtime: "codex-cli",
            status: "not-found" as const,
            candidates: [],
          };
        }

        return {
          schemaVersion: "2.0" as const,
          runtime: "codex-cli",
          status: "found" as const,
          candidates: [
            candidateWithSource({
              displayName: "Codex CLI",
              confidence: "high",
              source: "system-path",
              suggestedModel: "gpt-5.4",
              suggestedLabel: "Codex Implementer",
              description: "Detected via 'codex' executable on PATH.",
            }),
          ],
        };
      },
      checkReadiness: async (input) => {
        if (!hasCommandInPath("codex")) {
          return {
            schemaVersion: "2.0" as const,
            runtime: input.runtime,
            profileId: input.profileId,
            status: "missing-binary" as const,
            diagnostics: [
              {
                code: "missing-binary",
                severity: "error" as const,
                message: "Codex CLI binary 'codex' was not found on PATH.",
                nextStep: "Install Codex CLI and ensure 'codex' is available in your PATH.",
              },
            ],
          };
        }

        return {
          schemaVersion: "2.0" as const,
          runtime: input.runtime,
          profileId: input.profileId,
          status: "ready" as const,
          diagnostics: [],
        };
      },
    },
    {
      registration: {
        schemaVersion: "2.0",
        runtime: "lm-studio",
        displayName: "LM Studio",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
        description: "LM Studio local OpenAI-compatible server probe.",
      },
      launch: launchNotImplemented("lm-studio"),
      scanProbe: async () => {
        const endpoint = "http://localhost:1234/v1/models";
        const response = await probeHttpJson(endpoint, PROBE_TIMEOUT_MS);
        if (!response.ok || !isObject(response.payload)) {
          return {
            schemaVersion: "2.0" as const,
            runtime: "lm-studio",
            status: "not-found" as const,
            candidates: [],
          };
        }

        const models = Array.isArray(response.payload["data"]) ? response.payload["data"] : [];
        const firstModel = models.find(
          (model): model is { id: string } => isObject(model) && typeof model["id"] === "string",
        );

        return {
          schemaVersion: "2.0" as const,
          runtime: "lm-studio",
          status: "found" as const,
          candidates: [
            candidateWithSource({
              displayName: "LM Studio",
              confidence: "high",
              source: "adapter-probe",
              suggestedModel: firstModel?.id,
              suggestedLabel: "LM Studio Local",
              description: "Detected via LM Studio local API endpoint.",
            }),
          ],
        };
      },
      checkReadiness: async (input) => {
        const endpoint = "http://localhost:1234/v1/models";
        const response = await probeHttpJson(endpoint, PROBE_TIMEOUT_MS);
        if (!response.ok) {
          return {
            schemaVersion: "2.0" as const,
            runtime: input.runtime,
            profileId: input.profileId,
            status: "adapter-check-failed" as const,
            diagnostics: [
              {
                code: "adapter-check-failed",
                severity: "error" as const,
                message: `LM Studio endpoint probe failed at ${endpoint}${response.status ? ` (HTTP ${response.status})` : ""}.`,
                nextStep: "Start LM Studio local server and verify it is listening on port 1234.",
              },
            ],
          };
        }

        return {
          schemaVersion: "2.0" as const,
          runtime: input.runtime,
          profileId: input.profileId,
          status: "ready" as const,
          diagnostics: [],
        };
      },
    },
    {
      registration: {
        schemaVersion: "2.0",
        runtime: "ollama",
        displayName: "Ollama",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
        description: "Ollama local server probe.",
      },
      launch: launchNotImplemented("ollama"),
      scanProbe: async () => {
        const endpoint = "http://localhost:11434/api/tags";
        const response = await probeHttpJson(endpoint, PROBE_TIMEOUT_MS);
        if (!response.ok || !isObject(response.payload)) {
          return {
            schemaVersion: "2.0" as const,
            runtime: "ollama",
            status: "not-found" as const,
            candidates: [],
          };
        }

        const models = Array.isArray(response.payload["models"]) ? response.payload["models"] : [];
        const firstModel = models.find(
          (model): model is { model: string } =>
            isObject(model) && typeof model["model"] === "string",
        );

        return {
          schemaVersion: "2.0" as const,
          runtime: "ollama",
          status: "found" as const,
          candidates: [
            candidateWithSource({
              displayName: "Ollama",
              confidence: "high",
              source: "adapter-probe",
              suggestedModel: firstModel?.model ?? "nemotron-cascade-2:latest",
              suggestedLabel: "Ollama Local",
              description: "Detected via Ollama local API endpoint.",
            }),
          ],
        };
      },
      checkReadiness: async (input) => {
        const endpoint = "http://localhost:11434/api/tags";
        const response = await probeHttpJson(endpoint, PROBE_TIMEOUT_MS);
        if (!response.ok) {
          return {
            schemaVersion: "2.0" as const,
            runtime: input.runtime,
            profileId: input.profileId,
            status: "adapter-check-failed" as const,
            diagnostics: [
              {
                code: "adapter-check-failed",
                severity: "error" as const,
                message: `Ollama endpoint probe failed at ${endpoint}${response.status ? ` (HTTP ${response.status})` : ""}.`,
                nextStep: "Start Ollama and verify it is listening on port 11434.",
              },
            ],
          };
        }

        return {
          schemaVersion: "2.0" as const,
          runtime: input.runtime,
          profileId: input.profileId,
          status: "ready" as const,
          diagnostics: [],
        };
      },
    },
    {
      registration: {
        schemaVersion: "2.0",
        runtime: "openai",
        displayName: "OpenAI",
        launchContract: "agent-runtime-launch-v1",
        ownership: "adapter-managed",
        description:
          "OpenAI adapter with deterministic auth-boundary readiness based on environment credentials.",
      },
      launch: launchNotImplemented("openai"),
      scanProbe: async () => {
        const hasAuth = hasAnyEnvAuth(readEnv, ["OPENAI_API_KEY"]);

        if (!hasAuth) {
          return {
            schemaVersion: "2.0" as const,
            runtime: "openai",
            status: "not-found" as const,
            candidates: [],
          };
        }

        return {
          schemaVersion: "2.0" as const,
          runtime: "openai",
          status: "found" as const,
          candidates: [
            candidateWithSource({
              displayName: "OpenAI API",
              confidence: "high",
              source: "environment-variable",
              suggestedModel: "gpt-5.4",
              suggestedLabel: "OpenAI Default",
              description: "Detected via OPENAI_API_KEY environment variable.",
            }),
          ],
        };
      },
      checkReadiness: async (input) => {
        const hasAuth = hasAnyEnvAuth(readEnv, ["OPENAI_API_KEY"]);

        if (!hasAuth) {
          return {
            schemaVersion: "2.0" as const,
            runtime: input.runtime,
            profileId: input.profileId,
            status: "missing-auth" as const,
            diagnostics: [
              {
                code: "missing-auth",
                severity: "error" as const,
                message:
                  "OpenAI credentials are not available in this environment (OPENAI_API_KEY is not set).",
                nextStep:
                  "Set OPENAI_API_KEY in your shell/environment, then re-run readiness checks.",
              },
            ],
          };
        }

        return {
          schemaVersion: "2.0" as const,
          runtime: input.runtime,
          profileId: input.profileId,
          status: "ready" as const,
          diagnostics: [],
        };
      },
    },
  ];
}
