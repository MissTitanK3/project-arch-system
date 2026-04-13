import { readRuntimeProfileConfig, writeRuntimeProfileConfig } from "./runtimeProfiles";
import type {
  RuntimeProfileConfig,
  RuntimeProfile,
  RuntimeProfileAdapterOptions,
  RuntimeProfileCommonParameters,
  RuntimeProfilePreferredFor,
} from "../../schemas/runtimeProfileConfig";
import type { AgentRuntimeAdapterRegistry } from "./adapters";
import { parseAgentRuntimeAdapterOptionValidationResult } from "./adapterReadiness";

export class RuntimeProfileMutationError extends Error {
  constructor(
    public readonly code: "PAA024" | "PAA025" | "PAA026" | "PAA027" | "PAA028" | "PAA029",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeProfileMutationError";
  }
}

interface RuntimeProfileMutationBase {
  cwd?: string;
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  updatedAt?: string;
}

export interface LinkRuntimeProfileInput extends RuntimeProfileMutationBase {
  id: string;
  runtime: string;
  model: string;
  enabled?: boolean;
  label?: string;
  purpose?: string;
  preferredFor?: RuntimeProfilePreferredFor[];
  parameters?: RuntimeProfileCommonParameters;
  adapterOptions?: RuntimeProfileAdapterOptions;
  setDefault?: boolean;
}

export interface UpdateRuntimeProfileInput extends RuntimeProfileMutationBase {
  profileId: string;
  model?: string;
  enabled?: boolean;
  label?: string | null;
  purpose?: string | null;
  preferredFor?: RuntimeProfilePreferredFor[] | null;
  parameters?: RuntimeProfileCommonParameters | null;
  adapterOptions?: RuntimeProfileAdapterOptions | null;
  setDefault?: boolean;
  clearDefault?: boolean;
}

export interface SetRuntimeDefaultProfileInput extends RuntimeProfileMutationBase {
  profileId?: string;
  clearDefault?: boolean;
}

export interface SetRuntimeProfileEnabledInput extends RuntimeProfileMutationBase {
  profileId: string;
  enabled: boolean;
}

export interface UnlinkRuntimeProfileInput extends RuntimeProfileMutationBase {
  profileId: string;
}

function timestamp(value?: string): string {
  return value ?? new Date().toISOString();
}

async function loadConfigForMutation(
  cwd: string,
  allowMissing: boolean,
): Promise<RuntimeProfileConfig> {
  const existing = await readRuntimeProfileConfig(cwd);
  if (existing) {
    return existing;
  }

  if (!allowMissing) {
    throw new RuntimeProfileMutationError(
      "PAA024",
      "Runtime profile config does not exist. Link a profile first before applying mutations.",
    );
  }

  return {
    schemaVersion: "2.0",
    profiles: [],
  };
}

function findProfileIndex(config: RuntimeProfileConfig, profileId: string): number {
  return config.profiles.findIndex((profile) => profile.id === profileId);
}

async function validateAdapterOptionsIfAvailable(input: {
  profile: RuntimeProfile;
  adapterRegistry?: AgentRuntimeAdapterRegistry;
}): Promise<void> {
  if (!input.adapterRegistry) {
    return;
  }

  const adapter = input.adapterRegistry.adapters.get(input.profile.runtime);
  if (!adapter?.validateOptions) {
    return;
  }

  try {
    const result = parseAgentRuntimeAdapterOptionValidationResult(
      await adapter.validateOptions({
        schemaVersion: "2.0",
        runtime: input.profile.runtime,
        profileId: input.profile.id,
        model: input.profile.model,
        parameters: input.profile.parameters,
        adapterOptions: input.profile.adapterOptions,
      }),
    );

    if (result.status === "invalid") {
      const first = result.diagnostics[0];
      throw new RuntimeProfileMutationError(
        "PAA028",
        `Adapter option validation failed for profile '${input.profile.id}': ${first?.message ?? "invalid adapter options"}`,
      );
    }
  } catch (error) {
    if (error instanceof RuntimeProfileMutationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new RuntimeProfileMutationError(
      "PAA029",
      `Adapter option validation hook failed for profile '${input.profile.id}': ${message}`,
    );
  }
}

function ensureDefaultTransition(input: { setDefault?: boolean; clearDefault?: boolean }): void {
  if (input.setDefault && input.clearDefault) {
    throw new RuntimeProfileMutationError(
      "PAA027",
      "Cannot set and clear default profile in the same mutation.",
    );
  }
}

export async function linkRuntimeProfile(
  input: LinkRuntimeProfileInput,
): Promise<RuntimeProfileConfig> {
  const cwd = input.cwd ?? process.cwd();
  const config = await loadConfigForMutation(cwd, true);

  if (config.profiles.some((profile) => profile.id === input.id)) {
    throw new RuntimeProfileMutationError(
      "PAA025",
      `Runtime profile '${input.id}' already exists. Use update to modify existing profiles.`,
    );
  }

  const profile: RuntimeProfile = {
    id: input.id,
    runtime: input.runtime,
    model: input.model,
    enabled: input.enabled ?? true,
    label: input.label,
    purpose: input.purpose,
    preferredFor: input.preferredFor,
    parameters: input.parameters,
    adapterOptions: input.adapterOptions,
    updatedAt: timestamp(input.updatedAt),
  };

  await validateAdapterOptionsIfAvailable({
    profile,
    adapterRegistry: input.adapterRegistry,
  });

  const next: RuntimeProfileConfig = {
    ...config,
    defaultProfile: input.setDefault ? profile.id : config.defaultProfile,
    profiles: [...config.profiles, profile],
  };

  return writeRuntimeProfileConfig(next, cwd);
}

export async function updateRuntimeProfile(
  input: UpdateRuntimeProfileInput,
): Promise<RuntimeProfileConfig> {
  const cwd = input.cwd ?? process.cwd();
  ensureDefaultTransition({ setDefault: input.setDefault, clearDefault: input.clearDefault });

  const config = await loadConfigForMutation(cwd, false);
  const index = findProfileIndex(config, input.profileId);
  if (index < 0) {
    throw new RuntimeProfileMutationError(
      "PAA026",
      `Runtime profile '${input.profileId}' does not exist in runtime.config.json.`,
    );
  }

  const current = config.profiles[index] as RuntimeProfile;
  const updated: RuntimeProfile = {
    ...current,
    model: input.model ?? current.model,
    enabled: input.enabled ?? current.enabled,
    label:
      input.label === null ? undefined : input.label !== undefined ? input.label : current.label,
    purpose:
      input.purpose === null
        ? undefined
        : input.purpose !== undefined
          ? input.purpose
          : current.purpose,
    preferredFor:
      input.preferredFor === null
        ? undefined
        : input.preferredFor !== undefined
          ? input.preferredFor
          : current.preferredFor,
    parameters:
      input.parameters === null
        ? undefined
        : input.parameters !== undefined
          ? input.parameters
          : current.parameters,
    adapterOptions:
      input.adapterOptions === null
        ? undefined
        : input.adapterOptions !== undefined
          ? input.adapterOptions
          : current.adapterOptions,
    updatedAt: timestamp(input.updatedAt),
  };

  await validateAdapterOptionsIfAvailable({
    profile: updated,
    adapterRegistry: input.adapterRegistry,
  });

  const profiles = [...config.profiles];
  profiles[index] = updated;

  let defaultProfile = config.defaultProfile;
  if (input.setDefault) {
    defaultProfile = updated.id;
  } else if (input.clearDefault && config.defaultProfile === updated.id) {
    defaultProfile = undefined;
  }

  return writeRuntimeProfileConfig(
    {
      ...config,
      defaultProfile,
      profiles,
    },
    cwd,
  );
}

export async function setRuntimeProfileEnabled(
  input: SetRuntimeProfileEnabledInput,
): Promise<RuntimeProfileConfig> {
  return updateRuntimeProfile({
    cwd: input.cwd,
    adapterRegistry: input.adapterRegistry,
    profileId: input.profileId,
    enabled: input.enabled,
    updatedAt: input.updatedAt,
  });
}

export async function setRuntimeDefaultProfile(
  input: SetRuntimeDefaultProfileInput,
): Promise<RuntimeProfileConfig> {
  const cwd = input.cwd ?? process.cwd();
  const clearDefault = input.clearDefault === true;
  if (!clearDefault && !input.profileId) {
    throw new RuntimeProfileMutationError(
      "PAA027",
      "Provide profileId to set default, or pass clearDefault=true.",
    );
  }

  const config = await loadConfigForMutation(cwd, false);

  if (clearDefault) {
    return writeRuntimeProfileConfig(
      {
        ...config,
        defaultProfile: undefined,
      },
      cwd,
    );
  }

  const index = findProfileIndex(config, input.profileId as string);
  if (index < 0) {
    throw new RuntimeProfileMutationError(
      "PAA026",
      `Runtime profile '${input.profileId}' does not exist in runtime.config.json.`,
    );
  }

  const profiles = [...config.profiles];
  const current = profiles[index] as RuntimeProfile;
  profiles[index] = {
    ...current,
    updatedAt: timestamp(input.updatedAt),
  };

  return writeRuntimeProfileConfig(
    {
      ...config,
      defaultProfile: input.profileId,
      profiles,
    },
    cwd,
  );
}

export async function unlinkRuntimeProfile(
  input: UnlinkRuntimeProfileInput,
): Promise<RuntimeProfileConfig> {
  const cwd = input.cwd ?? process.cwd();
  const config = await loadConfigForMutation(cwd, false);
  const index = findProfileIndex(config, input.profileId);
  if (index < 0) {
    throw new RuntimeProfileMutationError(
      "PAA026",
      `Runtime profile '${input.profileId}' does not exist in runtime.config.json.`,
    );
  }

  const profiles = config.profiles.filter((profile) => profile.id !== input.profileId);
  const defaultProfile =
    config.defaultProfile === input.profileId ? undefined : config.defaultProfile;

  return writeRuntimeProfileConfig(
    {
      ...config,
      defaultProfile,
      profiles,
    },
    cwd,
  );
}
