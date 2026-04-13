import {
  agentRuntimeAdapterRegistrationSchema,
  agentRuntimeLaunchInputSchema,
  type AgentRuntimeAdapterRegistration,
  type AgentRuntimeLaunchInput,
  type AgentRuntimeLaunchResult,
} from "../../schemas/agentRuntimeAdapter";
import type {
  AgentRuntimeAdapterOptionValidationInput,
  AgentRuntimeAdapterOptionValidationResult,
  AgentRuntimeAdapterReadinessInput,
  AgentRuntimeAdapterReadinessResult,
} from "../../schemas/agentRuntimeAdapterReadiness";
import type {
  AgentRuntimeAdapterScanProbeInput,
  AgentRuntimeAdapterScanProbeResult,
} from "../../schemas/agentRuntimeAdapterScan";
import type { PrepareAgentRunResult } from "./prepare";
import {
  createBuiltInRuntimeAdapters,
  type BuiltInRuntimeAdapterDependencies,
} from "./builtInAdapters";
import {
  createUserConfiguredRuntimeAdapters,
  type UserConfiguredRuntimeAdapterDependencies,
} from "./userAdapters";

export type AgentRuntimeAvailabilitySource = "adapter-registry" | "config-file";

export class AgentRuntimeAdapterRegistryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentRuntimeAdapterRegistryError";
  }
}

export type AgentRuntimeAdapterLaunchFn = (
  input: AgentRuntimeLaunchInput,
) => Promise<AgentRuntimeLaunchResult>;

export type AgentRuntimeAdapterReadinessFn = (
  input: AgentRuntimeAdapterReadinessInput,
) => Promise<AgentRuntimeAdapterReadinessResult>;

export type AgentRuntimeAdapterOptionValidationFn = (
  input: AgentRuntimeAdapterOptionValidationInput,
) => Promise<AgentRuntimeAdapterOptionValidationResult>;

export type AgentRuntimeAdapterScanProbeFn = (
  input: AgentRuntimeAdapterScanProbeInput,
) => Promise<AgentRuntimeAdapterScanProbeResult>;

export interface AgentRuntimeAdapter {
  availabilitySource?: AgentRuntimeAvailabilitySource;
  registration: AgentRuntimeAdapterRegistration;
  launch: AgentRuntimeAdapterLaunchFn;
  checkReadiness?: AgentRuntimeAdapterReadinessFn;
  validateOptions?: AgentRuntimeAdapterOptionValidationFn;
  scanProbe?: AgentRuntimeAdapterScanProbeFn;
}

export interface AgentRuntimeAdapterRegistry {
  readonly adapters: ReadonlyMap<string, AgentRuntimeAdapter>;
}

export function createAgentRuntimeAdapterRegistry(
  adapters: AgentRuntimeAdapter[] = [],
): AgentRuntimeAdapterRegistry {
  const registry = {
    adapters: new Map<string, AgentRuntimeAdapter>(),
  };

  for (const adapter of adapters) {
    registerAgentRuntimeAdapter(registry, adapter);
  }

  return registry;
}

export function createBootstrappedAgentRuntimeAdapterRegistry(
  input: {
    cwd?: string;
    additionalAdapters?: AgentRuntimeAdapter[];
    includeBuiltIns?: boolean;
    includeUserConfiguredAdapters?: boolean;
    builtInDependencies?: BuiltInRuntimeAdapterDependencies;
    userConfiguredDependencies?: UserConfiguredRuntimeAdapterDependencies;
  } = {},
): AgentRuntimeAdapterRegistry {
  const includeBuiltIns = input.includeBuiltIns ?? true;
  const includeUserConfiguredAdapters = input.includeUserConfiguredAdapters ?? true;
  const builtIns = includeBuiltIns ? createBuiltInRuntimeAdapters(input.builtInDependencies) : [];
  const configured = includeUserConfiguredAdapters
    ? createUserConfiguredRuntimeAdapters({
        cwd: input.cwd,
        dependencies: input.userConfiguredDependencies,
      })
    : [];

  return createAgentRuntimeAdapterRegistry([
    ...builtIns,
    ...configured,
    ...(input.additionalAdapters ?? []),
  ]);
}

export function registerAgentRuntimeAdapter(
  registry: AgentRuntimeAdapterRegistry,
  adapter: AgentRuntimeAdapter,
): void {
  const registration = agentRuntimeAdapterRegistrationSchema.parse(adapter.registration);

  if (registry.adapters.has(registration.runtime)) {
    throw new AgentRuntimeAdapterRegistryError(
      "PAA014",
      `Runtime adapter '${registration.runtime}' is already registered.`,
    );
  }

  (registry.adapters as Map<string, AgentRuntimeAdapter>).set(registration.runtime, {
    availabilitySource: adapter.availabilitySource ?? "adapter-registry",
    registration,
    launch: adapter.launch,
    checkReadiness: adapter.checkReadiness,
    validateOptions: adapter.validateOptions,
    scanProbe: adapter.scanProbe,
  });
}

export function resolveAgentRuntimeAdapter(
  registry: AgentRuntimeAdapterRegistry,
  runtime: string,
): AgentRuntimeAdapter {
  const resolved = registry.adapters.get(runtime);
  if (!resolved) {
    throw new AgentRuntimeAdapterRegistryError(
      "PAA015",
      `Runtime adapter '${runtime}' is not registered.`,
    );
  }

  return resolved;
}

export function listAgentRuntimeAdapters(
  registry: AgentRuntimeAdapterRegistry,
): AgentRuntimeAdapterRegistration[] {
  return [...registry.adapters.values()]
    .map((entry) => entry.registration)
    .sort((left, right) => left.runtime.localeCompare(right.runtime));
}

export function listAgentRuntimeAdaptersWithAvailability(
  registry: AgentRuntimeAdapterRegistry,
): Array<{
  registration: AgentRuntimeAdapterRegistration;
  availabilitySource: AgentRuntimeAvailabilitySource;
}> {
  return [...registry.adapters.values()]
    .map((entry) => ({
      registration: entry.registration,
      availabilitySource: entry.availabilitySource ?? "adapter-registry",
    }))
    .sort((left, right) => left.registration.runtime.localeCompare(right.registration.runtime));
}

export function buildAgentRuntimeLaunchInput(input: {
  runtime: string;
  prepared: PrepareAgentRunResult;
  requestedAt?: string;
}): AgentRuntimeLaunchInput {
  return agentRuntimeLaunchInputSchema.parse({
    schemaVersion: "2.0",
    runtime: input.runtime,
    runId: input.prepared.runId,
    taskId: input.prepared.taskId,
    contractPath: input.prepared.contractPath,
    promptPath: input.prepared.promptPath,
    allowedPaths: input.prepared.allowedPaths,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    lifecycleBoundary: "prepare-first",
  });
}
