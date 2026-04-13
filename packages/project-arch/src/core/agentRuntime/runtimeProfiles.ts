import path from "path";
import { z } from "zod";
import { readJson, pathExists, writeJsonDeterministic } from "../../utils/fs";
import {
  runtimeProfileConfigSchema,
  type RuntimeProfileConfig,
} from "../../schemas/runtimeProfileConfig";

export const AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH = ".project-arch/runtime.config.json";

export type RuntimeProfileConfigValidationIssueCode = "invalid-json" | "invalid-schema";

export interface RuntimeProfileConfigValidationIssue {
  code: RuntimeProfileConfigValidationIssueCode;
  path: string;
  message: string;
}

export type RuntimeProfileConfigInspectionResult =
  | {
      status: "missing";
      path: string;
      issues: [];
    }
  | {
      status: "valid";
      path: string;
      config: RuntimeProfileConfig;
      issues: [];
    }
  | {
      status: "invalid";
      path: string;
      issues: RuntimeProfileConfigValidationIssue[];
    };

export type RuntimeProfileConfigValidationResult = Exclude<
  RuntimeProfileConfigInspectionResult,
  { status: "missing" }
>;

export class RuntimeProfileConfigPersistenceError extends Error {
  constructor(
    public readonly code: "PAA020" | "PAA021",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeProfileConfigPersistenceError";
  }
}

export function runtimeProfileConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH);
}

export function defaultRuntimeProfileConfig(): RuntimeProfileConfig {
  return runtimeProfileConfigSchema.parse({
    schemaVersion: "2.0",
    profiles: [],
  });
}

export function parseRuntimeProfileConfig(input: unknown): RuntimeProfileConfig {
  return runtimeProfileConfigSchema.parse(input);
}

export function safeParseRuntimeProfileConfig(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeProfileConfig> {
  return runtimeProfileConfigSchema.safeParse(input);
}

function formatRuntimeProfileConfigValidationIssues(
  error: z.ZodError,
): RuntimeProfileConfigValidationIssue[] {
  return error.issues.map((issue) => ({
    code: "invalid-schema",
    path: issue.path.length > 0 ? issue.path.join(".") : "root",
    message: issue.message,
  }));
}

export function validateRuntimeProfileConfig(input: unknown): RuntimeProfileConfigValidationResult {
  const parsed = safeParseRuntimeProfileConfig(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      path: AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH,
      issues: formatRuntimeProfileConfigValidationIssues(parsed.error),
    };
  }

  return {
    status: "valid",
    path: AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH,
    config: parsed.data,
    issues: [],
  };
}

export async function inspectRuntimeProfileConfig(
  cwd = process.cwd(),
): Promise<RuntimeProfileConfigInspectionResult> {
  const configPath = runtimeProfileConfigPath(cwd);
  if (!(await pathExists(configPath))) {
    return {
      status: "missing",
      path: AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH,
      issues: [],
    };
  }

  let raw: unknown;
  try {
    raw = await readJson<unknown>(configPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "invalid",
      path: AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH,
      issues: [
        {
          code: "invalid-json",
          path: "root",
          message: detail,
        },
      ],
    };
  }

  const validated = validateRuntimeProfileConfig(raw);
  return {
    ...validated,
    path: AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH,
  };
}

export async function readRuntimeProfileConfig(
  cwd = process.cwd(),
): Promise<RuntimeProfileConfig | null> {
  const inspected = await inspectRuntimeProfileConfig(cwd);
  if (inspected.status === "missing") {
    return null;
  }

  if (inspected.status === "invalid") {
    const issue = inspected.issues[0];
    const where = issue?.path ? ` at '${issue.path}'` : "";
    const prefix = issue?.code === "invalid-json" ? "Failed to read" : "Invalid";
    throw new RuntimeProfileConfigPersistenceError(
      "PAA020",
      `${prefix} runtime profile config${where}: ${issue?.message ?? "validation failed"}`,
    );
  }

  return inspected.config;
}

export async function writeRuntimeProfileConfig(
  input: unknown,
  cwd = process.cwd(),
): Promise<RuntimeProfileConfig> {
  const validated = validateRuntimeProfileConfig(input);
  if (validated.status === "invalid") {
    const issue = validated.issues[0];
    const where = issue?.path ? ` at '${issue.path}'` : "";
    throw new RuntimeProfileConfigPersistenceError(
      "PAA021",
      `Cannot persist runtime profile config${where}: ${issue?.message ?? "schema validation failed"}`,
    );
  }

  await writeJsonDeterministic(runtimeProfileConfigPath(cwd), validated.config);
  return validated.config;
}
