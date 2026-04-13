import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import http from "node:http";
import https from "node:https";
import type { AgentRuntimeAdapter } from "./adapters";
import {
  runtimeAdapterUserConfigSchema,
  type RuntimeAdapterUserConfig,
  type RuntimeAdapterUserEntry,
} from "../../schemas/runtimeAdapterUserConfig";

const USER_ADAPTER_CONFIG_RELATIVE_PATH = ".project-arch/adapters.config.json";
const PROBE_TIMEOUT_MS = 1200;

interface HttpProbeResult {
  ok: boolean;
  status?: number;
  payload?: unknown;
  error?: string;
}

export interface UserConfiguredRuntimeAdapterDependencies {
  hasCommandInPath?: (command: string) => boolean;
  probeHttpJson?: (url: string, timeoutMs?: number) => Promise<HttpProbeResult>;
}

export class UserAdapterConfigError extends Error {
  constructor(
    public readonly code: "PAA033" | "PAA034",
    message: string,
  ) {
    super(message);
    this.name = "UserAdapterConfigError";
  }
}

function userAdapterConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, USER_ADAPTER_CONFIG_RELATIVE_PATH);
}

function defaultHasCommandInPath(command: string): boolean {
  const result = spawnSync("which", [command], {
    stdio: "ignore",
    encoding: "utf8",
  });

  return result.status === 0;
}

function requestJson(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<HttpProbeResult> {
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

function launchNotImplemented(runtime: string) {
  return async () => {
    throw new Error(
      `Runtime adapter '${runtime}' is registered for discovery/readiness only and does not support launch dispatch yet.`,
    );
  };
}

function firstOpenAiModelId(payload: unknown): string | undefined {
  if (!isObject(payload)) {
    return undefined;
  }

  const models = Array.isArray(payload["data"]) ? payload["data"] : [];
  const firstModel = models.find(
    (model): model is { id: string } => isObject(model) && typeof model["id"] === "string",
  );

  return firstModel?.id;
}

export function loadUserRuntimeAdapterConfig(cwd = process.cwd()): RuntimeAdapterUserConfig | null {
  const targetPath = userAdapterConfigPath(cwd);
  if (!fs.pathExistsSync(targetPath)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = fs.readJSONSync(targetPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UserAdapterConfigError(
      "PAA033",
      `Failed to read user adapter config '${USER_ADAPTER_CONFIG_RELATIVE_PATH}': ${detail}`,
    );
  }

  try {
    return runtimeAdapterUserConfigSchema.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UserAdapterConfigError(
      "PAA034",
      `Invalid user adapter config '${USER_ADAPTER_CONFIG_RELATIVE_PATH}': ${detail}`,
    );
  }
}

function buildBinaryPathAdapter(
  entry: RuntimeAdapterUserEntry,
  deps: Required<UserConfiguredRuntimeAdapterDependencies>,
): AgentRuntimeAdapter {
  return {
    availabilitySource: "config-file",
    registration: {
      schemaVersion: "2.0",
      runtime: entry.runtime,
      displayName: entry.displayName,
      launchContract: "agent-runtime-launch-v1",
      ownership: "adapter-managed",
      description: entry.description,
    },
    launch: launchNotImplemented(entry.runtime),
    scanProbe: async () => {
      if (!deps.hasCommandInPath(entry.probeTarget)) {
        return {
          schemaVersion: "2.0" as const,
          runtime: entry.runtime,
          status: "not-found" as const,
          candidates: [],
        };
      }

      return {
        schemaVersion: "2.0" as const,
        runtime: entry.runtime,
        status: "found" as const,
        candidates: [
          {
            displayName: entry.displayName,
            confidence: "high" as const,
            source: "config-file" as const,
            description:
              entry.description ??
              `Detected via executable '${entry.probeTarget}' from user config.`,
            suggestedModel: entry.suggestedModel,
          },
        ],
      };
    },
    checkReadiness: async (input) => {
      if (!deps.hasCommandInPath(entry.probeTarget)) {
        return {
          schemaVersion: "2.0" as const,
          runtime: input.runtime,
          profileId: input.profileId,
          status: "missing-binary" as const,
          diagnostics: [
            {
              code: "missing-binary",
              severity: "error" as const,
              message: `Configured executable '${entry.probeTarget}' was not found on PATH.`,
              nextStep: `Install '${entry.probeTarget}' and ensure it is available in PATH.`,
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
  };
}

function buildHttpEndpointAdapter(
  entry: RuntimeAdapterUserEntry,
  deps: Required<UserConfiguredRuntimeAdapterDependencies>,
): AgentRuntimeAdapter {
  return {
    availabilitySource: "config-file",
    registration: {
      schemaVersion: "2.0",
      runtime: entry.runtime,
      displayName: entry.displayName,
      launchContract: "agent-runtime-launch-v1",
      ownership: "adapter-managed",
      description: entry.description,
    },
    launch: launchNotImplemented(entry.runtime),
    scanProbe: async () => {
      const response = await deps.probeHttpJson(entry.probeTarget, PROBE_TIMEOUT_MS);
      if (!response.ok) {
        return {
          schemaVersion: "2.0" as const,
          runtime: entry.runtime,
          status: "not-found" as const,
          candidates: [],
        };
      }

      return {
        schemaVersion: "2.0" as const,
        runtime: entry.runtime,
        status: "found" as const,
        candidates: [
          {
            displayName: entry.displayName,
            confidence: "medium" as const,
            source: "config-file" as const,
            description:
              entry.description ??
              `Detected via endpoint '${entry.probeTarget}' from user adapter config.`,
            suggestedModel: firstOpenAiModelId(response.payload) ?? entry.suggestedModel,
          },
        ],
      };
    },
    checkReadiness: async (input) => {
      const response = await deps.probeHttpJson(entry.probeTarget, PROBE_TIMEOUT_MS);
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
              message: `Configured endpoint probe failed at ${entry.probeTarget}${response.status ? ` (HTTP ${response.status})` : ""}.`,
              nextStep: "Start the local endpoint and verify it responds with JSON.",
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
  };
}

export function createUserConfiguredRuntimeAdapters(input: {
  cwd?: string;
  dependencies?: UserConfiguredRuntimeAdapterDependencies;
}): AgentRuntimeAdapter[] {
  const config = loadUserRuntimeAdapterConfig(input.cwd);
  if (!config) {
    return [];
  }

  const dependencies: Required<UserConfiguredRuntimeAdapterDependencies> = {
    hasCommandInPath: input.dependencies?.hasCommandInPath ?? defaultHasCommandInPath,
    probeHttpJson: input.dependencies?.probeHttpJson ?? requestJson,
  };

  return config.adapters.map((entry) => {
    if (entry.probeType === "binary-path") {
      return buildBinaryPathAdapter(entry, dependencies);
    }

    return buildHttpEndpointAdapter(entry, dependencies);
  });
}
