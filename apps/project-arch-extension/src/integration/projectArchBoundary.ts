import { spawn } from "child_process";
import { contracts } from "project-arch";

export const PROJECT_ARCH_DEFAULT_TRANSPORT = "cli-json" as const;
const STAGE_CHAT_INFERENCE_TIMEOUT_MS = 120_000;

export interface ProjectArchCliExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ProjectArchCliExecutor = (input: {
  command: string;
  args: string[];
  cwd?: string;
}) => Promise<ProjectArchCliExecutionResult>;

export interface ProjectArchBoundaryOptions {
  cliCommand?: string;
  cliExecutor?: ProjectArchCliExecutor;
  fetchImpl?: typeof fetch;
}

export interface ProjectArchStageChatInferenceResult {
  runtime: string;
  model: string;
  responseText: string;
  source: "ollama-api";
}

export interface ProjectArchBoundary {
  readonly transport: typeof PROJECT_ARCH_DEFAULT_TRANSPORT;
  readonly cliCommand: string;
  runCliJson<T>(input: {
    args: string[];
    cwd?: string;
    parse?: (payload: unknown) => T;
  }): Promise<T>;
  parseArtifact<K extends ProjectArchArtifactKind>(
    kind: K,
    payload: unknown,
  ): ProjectArchArtifactByKind[K];
  parseResultBundle(payload: unknown): ProjectArchArtifactByKind["result-bundle"];
  parseRuntimeInventoryListResult(
    payload: unknown,
  ): ProjectArchArtifactByKind["runtime-inventory-list-result"];
  parseRuntimeReadinessCheckResult(
    payload: unknown,
  ): ProjectArchArtifactByKind["runtime-readiness-check-result"];
  parseRuntimeScanResult(payload: unknown): ProjectArchArtifactByKind["runtime-scan-result"];
  readRuntimeInventoryList(input?: {
    cwd?: string;
  }): Promise<ProjectArchArtifactByKind["runtime-inventory-list-result"]>;
  readRuntimeReadinessCheck(input?: {
    cwd?: string;
    profileId?: string;
  }): Promise<ProjectArchArtifactByKind["runtime-readiness-check-result"]>;
  readRuntimeScan(input?: {
    cwd?: string;
  }): Promise<ProjectArchArtifactByKind["runtime-scan-result"]>;
  invokeStageChatInference?(input: {
    profileId: string;
    runtime: string;
    model: string;
    messageText: string;
    stageTitle?: string;
    taskPath?: string;
    cwd?: string;
    onPartialResponse?: (chunk: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<ProjectArchStageChatInferenceResult>;
}

export type ProjectArchArtifactKind =
  | "task-contract"
  | "result-bundle"
  | "escalation-request"
  | "runtime-inventory-list-result"
  | "runtime-readiness-check-result"
  | "runtime-scan-result";

export interface ProjectArchRuntimeReadinessDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  nextStep?: string;
  docsHint?: string;
}

export type ProjectArchRuntimeProfileReadiness =
  | "ready"
  | "runtime-unavailable"
  | "missing-model"
  | "missing-auth"
  | "missing-binary"
  | "invalid-config"
  | "adapter-check-failed"
  | "disabled"
  | "blocked";

export type ProjectArchRuntimeProfileStatus = "ready" | "not-ready" | "disabled" | "active";

export interface ProjectArchRuntimeInventoryProfile {
  id: string;
  runtime: string;
  model?: string | null;
  label?: string;
  purpose?: string;
  enabled: boolean;
  default: boolean;
  linked: boolean;
  available: boolean;
  readiness: ProjectArchRuntimeProfileReadiness;
  status: ProjectArchRuntimeProfileStatus;
  diagnostics: ProjectArchRuntimeReadinessDiagnostic[];
  origin?: string;
}

export interface ProjectArchRuntimeInventoryRuntime {
  runtime: string;
  displayName: string;
  description?: string;
  available: boolean;
  availabilitySource: string;
  profiles: string[];
}

export interface ProjectArchRuntimeInventoryListResult {
  schemaVersion: string;
  status: "runtime-inventory";
  defaultProfile?: string;
  runtimes: ProjectArchRuntimeInventoryRuntime[];
  profiles: ProjectArchRuntimeInventoryProfile[];
  generatedAt?: string;
  projectRoot?: string;
  summary?: {
    total: number;
    ready: number;
    blocked: number;
    disabled: number;
  };
}

export interface ProjectArchRuntimeReadinessCheckResult {
  schemaVersion: string;
  status: "runtime-readiness-check";
  checkedAt: string;
  profileId?: string;
  profiles: ProjectArchRuntimeInventoryProfile[];
}

export interface ProjectArchRuntimeScanCandidate {
  runtime: string;
  displayName: string;
  description?: string;
  confidence: "high" | "medium" | "low";
  source:
    | "adapter-registry"
    | "adapter-probe"
    | "environment-variable"
    | "system-path"
    | "config-file";
  suggestedModel?: string;
  suggestedLabel?: string;
  diagnostics: ProjectArchRuntimeReadinessDiagnostic[];
}

export interface ProjectArchRuntimeScanResult {
  schemaVersion: string;
  status: "runtime-scan";
  scanStatus: "success" | "partial" | "failed";
  scannedAt: string;
  candidates: ProjectArchRuntimeScanCandidate[];
  diagnostics: ProjectArchRuntimeReadinessDiagnostic[];
}

export type ProjectArchArtifactByKind = {
  "task-contract": ReturnType<typeof contracts.agentTaskContractSchema.parse>;
  "result-bundle": ReturnType<typeof contracts.agentResultBundleSchema.parse>;
  "escalation-request": ReturnType<typeof contracts.agentEscalationRequestSchema.parse>;
  "runtime-inventory-list-result": ProjectArchRuntimeInventoryListResult;
  "runtime-readiness-check-result": ProjectArchRuntimeReadinessCheckResult;
  "runtime-scan-result": ProjectArchRuntimeScanResult;
};

function parseRuntimeInventoryArtifact(
  payload: unknown,
): ProjectArchArtifactByKind["runtime-inventory-list-result"] {
  const runtimeInventorySchema = (
    contracts as {
      runtimeInventoryListResultSchema?: {
        parse: (input: unknown) => ProjectArchArtifactByKind["runtime-inventory-list-result"];
      };
      agentContractConsumptionSchemas?: {
        "runtime-inventory-list-result"?: {
          parse: (input: unknown) => ProjectArchArtifactByKind["runtime-inventory-list-result"];
        };
      };
    }
  ).runtimeInventoryListResultSchema;

  const parse =
    runtimeInventorySchema?.parse ??
    (
      contracts as {
        agentContractConsumptionSchemas?: {
          "runtime-inventory-list-result"?: {
            parse: (input: unknown) => ProjectArchArtifactByKind["runtime-inventory-list-result"];
          };
        };
      }
    ).agentContractConsumptionSchemas?.["runtime-inventory-list-result"]?.parse;

  if (parse) {
    return parse(payload);
  }

  return payload as ProjectArchArtifactByKind["runtime-inventory-list-result"];
}

function parseRuntimeReadinessArtifact(
  payload: unknown,
): ProjectArchArtifactByKind["runtime-readiness-check-result"] {
  const runtimeReadinessSchema = (
    contracts as {
      runtimeReadinessCheckResultSchema?: {
        parse: (input: unknown) => ProjectArchArtifactByKind["runtime-readiness-check-result"];
      };
      agentContractConsumptionSchemas?: {
        "runtime-readiness-check-result"?: {
          parse: (input: unknown) => ProjectArchArtifactByKind["runtime-readiness-check-result"];
        };
      };
    }
  ).runtimeReadinessCheckResultSchema;

  const parse =
    runtimeReadinessSchema?.parse ??
    (
      contracts as {
        agentContractConsumptionSchemas?: {
          "runtime-readiness-check-result"?: {
            parse: (input: unknown) => ProjectArchArtifactByKind["runtime-readiness-check-result"];
          };
        };
      }
    ).agentContractConsumptionSchemas?.["runtime-readiness-check-result"]?.parse;

  if (parse) {
    return parse(payload);
  }

  return payload as ProjectArchArtifactByKind["runtime-readiness-check-result"];
}

function parseRuntimeScanArtifact(
  payload: unknown,
): ProjectArchArtifactByKind["runtime-scan-result"] {
  const runtimeScanSchema = (
    contracts as {
      runtimeScanResultSchema?: {
        parse: (input: unknown) => ProjectArchArtifactByKind["runtime-scan-result"];
      };
      agentContractConsumptionSchemas?: {
        "runtime-scan-result"?: {
          parse: (input: unknown) => ProjectArchArtifactByKind["runtime-scan-result"];
        };
      };
    }
  ).runtimeScanResultSchema;

  const parse =
    runtimeScanSchema?.parse ??
    (
      contracts as {
        agentContractConsumptionSchemas?: {
          "runtime-scan-result"?: {
            parse: (input: unknown) => ProjectArchArtifactByKind["runtime-scan-result"];
          };
        };
      }
    ).agentContractConsumptionSchemas?.["runtime-scan-result"]?.parse;

  if (parse) {
    return parse(payload);
  }

  return payload as ProjectArchArtifactByKind["runtime-scan-result"];
}

const projectArchSchemaByArtifactKind: {
  [K in ProjectArchArtifactKind]: {
    parse: (payload: unknown) => ProjectArchArtifactByKind[K];
  };
} = {
  "task-contract": contracts.agentTaskContractSchema,
  "result-bundle": contracts.agentResultBundleSchema,
  "escalation-request": contracts.agentEscalationRequestSchema,
  "runtime-inventory-list-result": {
    parse: (payload) => parseRuntimeInventoryArtifact(payload),
  },
  "runtime-readiness-check-result": {
    parse: (payload) => parseRuntimeReadinessArtifact(payload),
  },
  "runtime-scan-result": {
    parse: (payload) => parseRuntimeScanArtifact(payload),
  },
};

function ensureJsonFlag(args: string[]): string[] {
  if (args.includes("--json")) {
    return args;
  }
  return [...args, "--json"];
}

export async function defaultProjectArchCliExecutor(input: {
  command: string;
  args: string[];
  cwd?: string;
}): Promise<ProjectArchCliExecutionResult> {
  return await new Promise<ProjectArchCliExecutionResult>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

export function createProjectArchBoundary(
  options: ProjectArchBoundaryOptions = {},
): ProjectArchBoundary {
  const cliCommand = options.cliCommand ?? "pa";
  const cliExecutor = options.cliExecutor ?? defaultProjectArchCliExecutor;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    transport: PROJECT_ARCH_DEFAULT_TRANSPORT,
    cliCommand,
    async runCliJson<T>(input: {
      args: string[];
      cwd?: string;
      parse?: (payload: unknown) => T;
    }): Promise<T> {
      const args = ensureJsonFlag(input.args);
      const result = await cliExecutor({
        command: cliCommand,
        args,
        cwd: input.cwd,
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr.trim();
        const detail = stderr.length > 0 ? ` ${stderr}` : "";
        throw new Error(
          `Project Arch CLI command failed with exit code ${result.exitCode}.${detail}`,
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(result.stdout);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const symptom = new Error(
          `Project Arch CLI did not return valid JSON: ${message}`,
        ) as Error & {
          cause?: unknown;
        };
        symptom.cause = error;
        throw symptom;
      }

      if (input.parse) {
        return input.parse(payload);
      }

      return payload as T;
    },
    parseArtifact<K extends ProjectArchArtifactKind>(
      kind: K,
      payload: unknown,
    ): ProjectArchArtifactByKind[K] {
      return projectArchSchemaByArtifactKind[kind].parse(payload);
    },
    parseResultBundle(payload: unknown): ProjectArchArtifactByKind["result-bundle"] {
      return projectArchSchemaByArtifactKind["result-bundle"].parse(payload);
    },
    parseRuntimeInventoryListResult(
      payload: unknown,
    ): ProjectArchArtifactByKind["runtime-inventory-list-result"] {
      return projectArchSchemaByArtifactKind["runtime-inventory-list-result"].parse(payload);
    },
    parseRuntimeReadinessCheckResult(
      payload: unknown,
    ): ProjectArchArtifactByKind["runtime-readiness-check-result"] {
      return projectArchSchemaByArtifactKind["runtime-readiness-check-result"].parse(payload);
    },
    parseRuntimeScanResult(payload: unknown): ProjectArchArtifactByKind["runtime-scan-result"] {
      return projectArchSchemaByArtifactKind["runtime-scan-result"].parse(payload);
    },
    async readRuntimeInventoryList(input = {}) {
      return await this.runCliJson({
        args: ["runtime", "list"],
        cwd: input.cwd,
        parse: (payload) => this.parseRuntimeInventoryListResult(payload),
      });
    },
    async readRuntimeReadinessCheck(input = {}) {
      const args = ["runtime", "check"];
      if (input.profileId) {
        args.push(input.profileId);
      }

      return await this.runCliJson({
        args,
        cwd: input.cwd,
        parse: (payload) => this.parseRuntimeReadinessCheckResult(payload),
      });
    },
    async readRuntimeScan(input = {}) {
      return await this.runCliJson({
        args: ["runtime", "scan"],
        cwd: input.cwd,
        parse: (payload) => this.parseRuntimeScanResult(payload),
      });
    },
    async invokeStageChatInference(input) {
      const normalizedRuntime = input.runtime.trim().toLowerCase();
      if (normalizedRuntime !== "ollama" && normalizedRuntime !== "local") {
        throw new Error(
          `Runtime profile '${input.profileId}' uses unsupported runtime '${input.runtime}' for live stage chat.`,
        );
      }

      if (!fetchImpl) {
        throw new Error("Fetch API is unavailable for live stage chat runtime calls.");
      }

      const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
      let abortedByUser = false;
      const abortFromSignal = () => {
        abortedByUser = true;
        controller?.abort();
      };
      if (input.abortSignal) {
        if (input.abortSignal.aborted) {
          abortFromSignal();
        } else {
          input.abortSignal.addEventListener("abort", abortFromSignal, { once: true });
        }
      }
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const clearInferenceTimeout = (): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
      };
      const refreshInferenceTimeout = (): void => {
        if (!controller) {
          return;
        }

        clearInferenceTimeout();
        timeoutHandle = setTimeout(() => {
          controller.abort();
        }, STAGE_CHAT_INFERENCE_TIMEOUT_MS);
      };

      refreshInferenceTimeout();

      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetchImpl("http://127.0.0.1:11434/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            stream: true,
            messages: [
              {
                role: "system",
                content: `You are helping with the stage '${input.stageTitle ?? input.profileId}' in Project Arch.${typeof input.taskPath === "string" && input.taskPath.length > 0 ? ` Task: ${input.taskPath}.` : ""}`,
              },
              {
                role: "user",
                content: input.messageText,
              },
            ],
          }),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (error) {
        clearInferenceTimeout();
        if (input.abortSignal) {
          input.abortSignal.removeEventListener("abort", abortFromSignal);
        }

        if (error instanceof Error && error.name === "AbortError") {
          if (abortedByUser) {
            const interruptedError = new Error(
              "Stage chat response interrupted by user.",
            ) as Error & {
              cause?: unknown;
            };
            interruptedError.cause = error;
            throw interruptedError;
          }

          const timeoutError = new Error(
            `Ollama stage chat request timed out after ${STAGE_CHAT_INFERENCE_TIMEOUT_MS}ms.`,
          ) as Error & { cause?: unknown };
          timeoutError.cause = error;
          throw timeoutError;
        }

        const message = error instanceof Error ? error.message : String(error);
        const transportError = new Error(`Ollama transport request failed: ${message}`) as Error & {
          cause?: unknown;
        };
        transportError.cause = error;
        throw transportError;
      }

      clearInferenceTimeout();
      if (input.abortSignal) {
        input.abortSignal.removeEventListener("abort", abortFromSignal);
      }

      if (!response.ok) {
        throw new Error(
          `Ollama stage chat request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
        );
      }

      const parsePayloadChunk = (payload: {
        message?: {
          content?: unknown;
        };
        response?: unknown;
      }): string => {
        if (typeof payload.message?.content === "string") {
          return payload.message.content;
        }

        if (typeof payload.response === "string") {
          return payload.response;
        }

        return "";
      };

      let responseText = "";
      if (!response.body || typeof response.body.getReader !== "function") {
        const payload = (await response.json()) as {
          message?: {
            content?: unknown;
          };
          response?: unknown;
        };
        responseText = parsePayloadChunk(payload);
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";

        const processBufferedLines = (): void => {
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.length === 0) {
              continue;
            }

            let payload: {
              message?: {
                content?: unknown;
              };
              response?: unknown;
            };
            try {
              payload = JSON.parse(line) as {
                message?: {
                  content?: unknown;
                };
                response?: unknown;
              };
            } catch (error) {
              const malformedError = new Error(
                "Ollama returned malformed streaming response for stage chat inference.",
              ) as Error & { cause?: unknown };
              malformedError.cause = error;
              throw malformedError;
            }

            const chunk = parsePayloadChunk(payload);
            if (chunk.length > 0) {
              input.onPartialResponse?.(chunk);
              responseText += chunk;
            }
          }
        };

        try {
          while (true) {
            refreshInferenceTimeout();
            const { value, done } = await reader.read();
            if (done) {
              break;
            }

            buffered += decoder.decode(value, { stream: true });
            processBufferedLines();
          }

          buffered += decoder.decode();
          processBufferedLines();
          const trailing = buffered.trim();
          if (trailing.length > 0) {
            let payload: {
              message?: {
                content?: unknown;
              };
              response?: unknown;
            };
            try {
              payload = JSON.parse(trailing) as {
                message?: {
                  content?: unknown;
                };
                response?: unknown;
              };
            } catch (error) {
              const malformedError = new Error(
                "Ollama returned malformed streaming response for stage chat inference.",
              ) as Error & { cause?: unknown };
              malformedError.cause = error;
              throw malformedError;
            }

            const chunk = parsePayloadChunk(payload);
            if (chunk.length > 0) {
              input.onPartialResponse?.(chunk);
              responseText += chunk;
            }
          }
        } catch (error) {
          clearInferenceTimeout();
          if (input.abortSignal) {
            input.abortSignal.removeEventListener("abort", abortFromSignal);
          }
          if (error instanceof Error && error.name === "AbortError") {
            if (abortedByUser) {
              const interruptedError = new Error(
                "Stage chat response interrupted by user.",
              ) as Error & { cause?: unknown };
              interruptedError.cause = error;
              throw interruptedError;
            }

            const timeoutError = new Error(
              `Ollama stage chat request timed out after ${STAGE_CHAT_INFERENCE_TIMEOUT_MS}ms.`,
            ) as Error & { cause?: unknown };
            timeoutError.cause = error;
            throw timeoutError;
          }

          if (error instanceof Error) {
            throw error;
          }

          const streamingError = new Error(
            `Ollama transport request failed: ${String(error)}`,
          ) as Error & { cause?: unknown };
          streamingError.cause = error;
          throw streamingError;
        }

        clearInferenceTimeout();
        if (input.abortSignal) {
          input.abortSignal.removeEventListener("abort", abortFromSignal);
        }
      }

      responseText = responseText.trim();

      if (responseText.length === 0) {
        throw new Error("Ollama returned an empty response for stage chat inference.");
      }

      return {
        runtime: input.runtime,
        model: input.model,
        responseText,
        source: "ollama-api",
      };
    },
  };
}
