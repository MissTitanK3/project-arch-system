import type { OperationResult } from "../types/result";
import { wrap } from "./_utils";
import type { AgentRuntimeAdapterRegistry } from "../core/agentRuntime/adapters";
import { createBootstrappedAgentRuntimeAdapterRegistry } from "../core/agentRuntime/adapters";
import {
  buildRuntimeInventory,
  buildRuntimeReadinessCheck,
} from "../core/agentRuntime/runtimeInventoryReadiness";
import { buildRuntimeScan } from "../core/agentRuntime/runtimeScan";
import {
  linkRuntimeProfile,
  setRuntimeDefaultProfile,
  setRuntimeProfileEnabled,
  unlinkRuntimeProfile,
  updateRuntimeProfile,
  type LinkRuntimeProfileInput,
  type SetRuntimeDefaultProfileInput,
  type SetRuntimeProfileEnabledInput,
  type UnlinkRuntimeProfileInput,
  type UpdateRuntimeProfileInput,
} from "../core/agentRuntime/runtimeProfileMutations";
import {
  defaultRuntimeProfileConfig,
  inspectRuntimeProfileConfig,
  parseRuntimeProfileConfig,
  readRuntimeProfileConfig,
  runtimeProfileConfigPath,
  safeParseRuntimeProfileConfig,
  validateRuntimeProfileConfig,
  writeRuntimeProfileConfig,
  type RuntimeProfileConfigInspectionResult,
  type RuntimeProfileConfigValidationIssue,
  type RuntimeProfileConfigValidationIssueCode,
  type RuntimeProfileConfigValidationResult,
} from "../core/agentRuntime/runtimeProfiles";
import type { RuntimeProfileConfig } from "../schemas/runtimeProfileConfig";
import type {
  RuntimeInventoryListResult,
  RuntimeReadinessCheckResult,
} from "../schemas/runtimeInventoryReadiness";
import type { RuntimeScanResult } from "../schemas/runtimeScanResult";

export type RuntimeConfig = RuntimeProfileConfig;
export type RuntimeConfigInspection = RuntimeProfileConfigInspectionResult;
export type RuntimeConfigValidationIssue = RuntimeProfileConfigValidationIssue;
export type RuntimeConfigValidationIssueCode = RuntimeProfileConfigValidationIssueCode;
export type RuntimeConfigValidation = RuntimeProfileConfigValidationResult;
export type RuntimeInventory = RuntimeInventoryListResult;
export type RuntimeReadiness = RuntimeReadinessCheckResult;
export type RuntimeScan = RuntimeScanResult;
export type RuntimeLinkInput = LinkRuntimeProfileInput;
export type RuntimeUpdateInput = UpdateRuntimeProfileInput;
export type RuntimeSetDefaultInput = SetRuntimeDefaultProfileInput;
export type RuntimeSetEnabledInput = SetRuntimeProfileEnabledInput;
export type RuntimeUnlinkInput = UnlinkRuntimeProfileInput;

function resolveAdapterRegistry(
  cwd: string | undefined,
  adapterRegistry?: AgentRuntimeAdapterRegistry,
): AgentRuntimeAdapterRegistry {
  return adapterRegistry ?? createBootstrappedAgentRuntimeAdapterRegistry({ cwd });
}

export function runtimeConfigPath(input: { cwd?: string } = {}): string {
  return runtimeProfileConfigPath(input.cwd);
}

export function runtimeConfigDefault(): RuntimeConfig {
  return defaultRuntimeProfileConfig();
}

export function runtimeConfigParse(input: unknown): RuntimeConfig {
  return parseRuntimeProfileConfig(input);
}

export function runtimeConfigSafeParse(input: unknown) {
  return safeParseRuntimeProfileConfig(input);
}

export function runtimeConfigValidate(input: unknown): RuntimeConfigValidation {
  return validateRuntimeProfileConfig(input);
}

export async function runtimeConfigInspect(
  input: { cwd?: string } = {},
): Promise<OperationResult<RuntimeConfigInspection>> {
  return wrap(async () => inspectRuntimeProfileConfig(input.cwd));
}

export async function runtimeConfigRead(
  input: { cwd?: string } = {},
): Promise<OperationResult<RuntimeConfig | null>> {
  return wrap(async () => readRuntimeProfileConfig(input.cwd));
}

export async function runtimeConfigWrite(input: {
  config: unknown;
  cwd?: string;
}): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () => writeRuntimeProfileConfig(input.config, input.cwd));
}

export async function runtimeList(input: {
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  cwd?: string;
}): Promise<OperationResult<RuntimeInventory>> {
  return wrap(async () =>
    buildRuntimeInventory({
      adapterRegistry: resolveAdapterRegistry(input.cwd, input.adapterRegistry),
      cwd: input.cwd,
    }),
  );
}

export async function runtimeCheck(input: {
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  profileId?: string;
  checkedAt?: string;
  cwd?: string;
}): Promise<OperationResult<RuntimeReadiness>> {
  return wrap(async () =>
    buildRuntimeReadinessCheck({
      adapterRegistry: resolveAdapterRegistry(input.cwd, input.adapterRegistry),
      profileId: input.profileId,
      checkedAt: input.checkedAt,
      cwd: input.cwd,
    }),
  );
}

export async function runtimeScan(input: {
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  cwd?: string;
}): Promise<OperationResult<RuntimeScan>> {
  return wrap(async () =>
    buildRuntimeScan({
      adapterRegistry: resolveAdapterRegistry(input.cwd, input.adapterRegistry),
      cwd: input.cwd,
    }),
  );
}

export async function runtimeLink(
  input: RuntimeLinkInput,
): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () => linkRuntimeProfile(input));
}

export async function runtimeUpdate(
  input: RuntimeUpdateInput,
): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () => updateRuntimeProfile(input));
}

export async function runtimeEnable(input: {
  profileId: string;
  cwd?: string;
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  updatedAt?: string;
}): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () =>
    setRuntimeProfileEnabled({
      profileId: input.profileId,
      enabled: true,
      cwd: input.cwd,
      adapterRegistry: resolveAdapterRegistry(input.cwd, input.adapterRegistry),
      updatedAt: input.updatedAt,
    }),
  );
}

export async function runtimeDisable(input: {
  profileId: string;
  cwd?: string;
  adapterRegistry?: AgentRuntimeAdapterRegistry;
  updatedAt?: string;
}): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () =>
    setRuntimeProfileEnabled({
      profileId: input.profileId,
      enabled: false,
      cwd: input.cwd,
      adapterRegistry: resolveAdapterRegistry(input.cwd, input.adapterRegistry),
      updatedAt: input.updatedAt,
    }),
  );
}

export async function runtimeDefault(
  input: RuntimeSetDefaultInput,
): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () => setRuntimeDefaultProfile(input));
}

export async function runtimeUnlink(
  input: RuntimeUnlinkInput,
): Promise<OperationResult<RuntimeConfig>> {
  return wrap(async () => unlinkRuntimeProfile(input));
}
