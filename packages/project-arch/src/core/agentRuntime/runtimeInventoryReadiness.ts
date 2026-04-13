import { z } from "zod";
import {
  listAgentRuntimeAdaptersWithAvailability,
  type AgentRuntimeAdapter,
  type AgentRuntimeAdapterRegistry,
} from "./adapters";
import {
  inspectRuntimeProfileConfig,
  type RuntimeProfileConfigInspectionResult,
} from "./runtimeProfiles";
import type { RuntimeProfileConfig } from "../../schemas/runtimeProfileConfig";
import type { RuntimeProfile } from "../../schemas/runtimeProfileConfig";
import {
  runtimeInventoryListResultSchema,
  runtimeReadinessCheckResultSchema,
  type RuntimeInventoryProfileEntry,
  type RuntimeInventoryRuntimeEntry,
  type RuntimeInventoryListResult,
  type RuntimeProfileReadinessStatus,
  type RuntimeProfileInventoryStatus,
  type RuntimeReadinessDiagnostic,
  type RuntimeReadinessCheckResult,
} from "../../schemas/runtimeInventoryReadiness";
import {
  parseAgentRuntimeAdapterOptionValidationResult,
  parseAgentRuntimeAdapterReadinessResult,
} from "./adapterReadiness";

export function parseRuntimeInventoryListResult(input: unknown): RuntimeInventoryListResult {
  return runtimeInventoryListResultSchema.parse(input);
}

export function safeParseRuntimeInventoryListResult(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeInventoryListResult> {
  return runtimeInventoryListResultSchema.safeParse(input);
}

export function parseRuntimeReadinessCheckResult(input: unknown): RuntimeReadinessCheckResult {
  return runtimeReadinessCheckResultSchema.parse(input);
}

export function safeParseRuntimeReadinessCheckResult(
  input: unknown,
): z.SafeParseReturnType<unknown, RuntimeReadinessCheckResult> {
  return runtimeReadinessCheckResultSchema.safeParse(input);
}

export interface BuildRuntimeInventoryOptions {
  cwd?: string;
  adapterRegistry: AgentRuntimeAdapterRegistry;
}

export interface BuildRuntimeReadinessCheckOptions extends BuildRuntimeInventoryOptions {
  profileId?: string;
  checkedAt?: string;
}

export class RuntimeInventoryBuildError extends Error {
  constructor(
    public readonly code: "PAA022" | "PAA023",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeInventoryBuildError";
  }
}

function diagnosticsForReadiness(input: {
  profileId: string;
  runtime: string;
  readiness: RuntimeProfileReadinessStatus;
  errorMessage?: string;
}): RuntimeReadinessDiagnostic[] {
  if (input.readiness === "runtime-unavailable") {
    return [
      {
        code: "runtime-unavailable",
        severity: "error",
        message: `Runtime '${input.runtime}' is not registered in this environment.`,
        nextStep: "Install or enable the runtime adapter, then re-run runtime inventory/readiness.",
      },
    ];
  }

  if (input.readiness === "missing-model") {
    return [
      {
        code: "missing-model",
        severity: "error",
        message: `Runtime profile '${input.profileId}' is linked but missing a model value.`,
        nextStep: `Set a model for profile '${input.profileId}', then re-run readiness check.`,
      },
    ];
  }

  if (input.readiness === "disabled") {
    return [
      {
        code: "disabled",
        severity: "warning",
        message: `Runtime profile '${input.profileId}' is intentionally disabled.`,
        nextStep: `Enable profile '${input.profileId}' if it should be available for launch selection.`,
      },
    ];
  }

  if (input.readiness === "adapter-check-failed") {
    return [
      {
        code: "adapter-check-failed",
        severity: "error",
        message:
          input.errorMessage ??
          `Runtime adapter readiness check failed unexpectedly for profile '${input.profileId}'.`,
        nextStep:
          "Verify adapter configuration and runtime installation, then re-run readiness check.",
      },
    ];
  }

  return [];
}

function statusFromReadiness(
  readiness: RuntimeProfileReadinessStatus,
): RuntimeProfileInventoryStatus {
  if (readiness === "ready") {
    return "ready";
  }

  if (readiness === "disabled") {
    return "disabled";
  }

  return "not-ready";
}

function buildAdapterCheckInput(profile: RuntimeProfile) {
  return {
    schemaVersion: "2.0" as const,
    runtime: profile.runtime,
    profileId: profile.id,
    model: profile.model,
    parameters: profile.parameters,
    adapterOptions: profile.adapterOptions,
  };
}

async function resolveAdapterBackedReadiness(input: {
  profile: RuntimeProfile;
  adapter: AgentRuntimeAdapter;
}): Promise<{
  readiness: RuntimeProfileReadinessStatus;
  diagnostics: RuntimeReadinessDiagnostic[];
}> {
  const { profile, adapter } = input;
  const readinessInput = buildAdapterCheckInput(profile);

  if (adapter.validateOptions) {
    try {
      const optionValidation = parseAgentRuntimeAdapterOptionValidationResult(
        await adapter.validateOptions(readinessInput),
      );
      if (optionValidation.status === "invalid") {
        return {
          readiness: "invalid-config",
          diagnostics: optionValidation.diagnostics,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        readiness: "adapter-check-failed",
        diagnostics: diagnosticsForReadiness({
          profileId: profile.id,
          runtime: profile.runtime,
          readiness: "adapter-check-failed",
          errorMessage: `Adapter option validation failed for profile '${profile.id}': ${message}`,
        }),
      };
    }
  }

  if (adapter.checkReadiness) {
    try {
      const readinessResult = parseAgentRuntimeAdapterReadinessResult(
        await adapter.checkReadiness(readinessInput),
      );
      return {
        readiness: readinessResult.status,
        diagnostics: readinessResult.diagnostics,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        readiness: "adapter-check-failed",
        diagnostics: diagnosticsForReadiness({
          profileId: profile.id,
          runtime: profile.runtime,
          readiness: "adapter-check-failed",
          errorMessage: `Adapter readiness check failed for profile '${profile.id}': ${message}`,
        }),
      };
    }
  }

  return {
    readiness: "ready",
    diagnostics: [],
  };
}

async function deriveProfileAvailability(input: {
  config: RuntimeProfileConfig;
  availableRuntimeIds: Set<string>;
  adapterRegistry: AgentRuntimeAdapterRegistry;
}): Promise<RuntimeInventoryProfileEntry[]> {
  const { config, availableRuntimeIds } = input;
  const profiles: RuntimeInventoryProfileEntry[] = [];

  for (const profile of config.profiles) {
    const isAvailable = availableRuntimeIds.has(profile.runtime);

    let readiness: RuntimeProfileReadinessStatus;
    let diagnostics: RuntimeReadinessDiagnostic[];

    if (!profile.enabled) {
      readiness = "disabled";
      diagnostics = diagnosticsForReadiness({
        profileId: profile.id,
        runtime: profile.runtime,
        readiness,
      });
    } else if (!isAvailable) {
      readiness = "runtime-unavailable";
      diagnostics = diagnosticsForReadiness({
        profileId: profile.id,
        runtime: profile.runtime,
        readiness,
      });
    } else if (!profile.model || profile.model.trim().length === 0) {
      readiness = "missing-model";
      diagnostics = diagnosticsForReadiness({
        profileId: profile.id,
        runtime: profile.runtime,
        readiness,
      });
    } else {
      const adapter = input.adapterRegistry.adapters.get(profile.runtime);
      if (!adapter) {
        readiness = "runtime-unavailable";
        diagnostics = diagnosticsForReadiness({
          profileId: profile.id,
          runtime: profile.runtime,
          readiness,
        });
      } else {
        const adapterReadiness = await resolveAdapterBackedReadiness({ profile, adapter });
        readiness = adapterReadiness.readiness;
        diagnostics = adapterReadiness.diagnostics;
      }
    }

    profiles.push({
      id: profile.id,
      runtime: profile.runtime,
      label: profile.label,
      purpose: profile.purpose,
      model: profile.model,
      enabled: profile.enabled,
      default: config.defaultProfile === profile.id,
      linked: true,
      available: isAvailable,
      readiness,
      status: statusFromReadiness(readiness),
      diagnostics,
    });
  }

  return profiles;
}

function mergeRuntimeEntries(input: {
  profiles: RuntimeInventoryProfileEntry[];
  adapterRuntimes: ReturnType<typeof listAgentRuntimeAdaptersWithAvailability>;
}): RuntimeInventoryRuntimeEntry[] {
  const profileIdsByRuntime = new Map<string, string[]>();
  for (const profile of input.profiles) {
    const existing = profileIdsByRuntime.get(profile.runtime) ?? [];
    existing.push(profile.id);
    profileIdsByRuntime.set(profile.runtime, existing);
  }

  const adapterByRuntime = new Map(
    input.adapterRuntimes.map((entry) => [entry.registration.runtime, entry]),
  );
  const runtimeIds = new Set<string>([...adapterByRuntime.keys(), ...profileIdsByRuntime.keys()]);

  return [...runtimeIds]
    .sort((left, right) => left.localeCompare(right))
    .map((runtimeId) => {
      const adapter = adapterByRuntime.get(runtimeId);
      return {
        runtime: runtimeId,
        displayName: adapter?.registration.displayName ?? runtimeId,
        description: adapter?.registration.description,
        available: !!adapter,
        availabilitySource: adapter?.availabilitySource ?? "adapter-registry",
        profiles: (profileIdsByRuntime.get(runtimeId) ?? []).sort((left, right) =>
          left.localeCompare(right),
        ),
      } satisfies RuntimeInventoryRuntimeEntry;
    });
}

function configFromInspection(
  inspected: RuntimeProfileConfigInspectionResult,
): RuntimeProfileConfig {
  if (inspected.status === "missing") {
    return {
      schemaVersion: "2.0",
      profiles: [],
    };
  }

  if (inspected.status === "invalid") {
    const firstIssue = inspected.issues[0];
    throw new RuntimeInventoryBuildError(
      "PAA022",
      `Cannot assemble runtime inventory from invalid runtime profile config '${inspected.path}': ${firstIssue?.message ?? "validation failed"}`,
    );
  }

  return inspected.config;
}

export async function buildRuntimeInventory(
  options: BuildRuntimeInventoryOptions,
): Promise<RuntimeInventoryListResult> {
  const cwd = options.cwd ?? process.cwd();
  const adapterRuntimes = listAgentRuntimeAdaptersWithAvailability(options.adapterRegistry);
  const availableRuntimeIds = new Set(adapterRuntimes.map((entry) => entry.registration.runtime));
  const inspected = await inspectRuntimeProfileConfig(cwd);
  const config = configFromInspection(inspected);

  const profiles = (
    await deriveProfileAvailability({
      config,
      availableRuntimeIds,
      adapterRegistry: options.adapterRegistry,
    })
  ).sort((left, right) => left.id.localeCompare(right.id));
  const runtimes = mergeRuntimeEntries({ profiles, adapterRuntimes });

  return runtimeInventoryListResultSchema.parse({
    schemaVersion: "2.0",
    status: "runtime-inventory",
    defaultProfile: config.defaultProfile,
    runtimes,
    profiles,
  });
}

export async function buildRuntimeReadinessCheck(
  options: BuildRuntimeReadinessCheckOptions,
): Promise<RuntimeReadinessCheckResult> {
  const inventory = await buildRuntimeInventory(options);
  const checkedAt = options.checkedAt ?? new Date().toISOString();

  if (options.profileId) {
    const profile = inventory.profiles.find((entry) => entry.id === options.profileId);
    if (!profile) {
      throw new RuntimeInventoryBuildError(
        "PAA023",
        `Runtime profile '${options.profileId}' is not linked in runtime.config.json.`,
      );
    }

    return runtimeReadinessCheckResultSchema.parse({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt,
      profileId: options.profileId,
      profiles: [profile],
    });
  }

  return runtimeReadinessCheckResultSchema.parse({
    schemaVersion: "2.0",
    status: "runtime-readiness-check",
    checkedAt,
    profiles: inventory.profiles,
  });
}
