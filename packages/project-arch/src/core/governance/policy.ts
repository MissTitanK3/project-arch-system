import path from "path";
import { pathExists, readJson, writeJsonDeterministic } from "../../utils/fs";
import { projectDocsRoot } from "../../utils/paths";
import {
  CANONICAL_TASK_STATUSES,
  type CanonicalTaskStatus,
  normalizeTaskStatus,
} from "../../schemas/statusNormalization";

export type CompletionMode = "metadata_only" | "all_tasks_done" | "metadata_or_all_tasks_done";

export interface TimingScopePolicy {
  enforceStatuses: CanonicalTaskStatus[];
  skipDoneIfCompletedContainer: boolean;
  completionMode: CompletionMode;
}

export interface TimingPolicy {
  phase: TimingScopePolicy;
  milestone: TimingScopePolicy;
}

export interface PolicyProfile {
  timing: TimingPolicy;
}

const DEFAULT_TIMING_SCOPE: TimingScopePolicy = {
  enforceStatuses: ["in_progress", "done"],
  skipDoneIfCompletedContainer: false,
  completionMode: "metadata_or_all_tasks_done",
};

export const DEFAULT_POLICY_PROFILE: PolicyProfile = {
  timing: {
    phase: {
      enforceStatuses: ["in_progress", "done"],
      skipDoneIfCompletedContainer: true,
      completionMode: "metadata_or_all_tasks_done",
    },
    milestone: {
      ...DEFAULT_TIMING_SCOPE,
    },
  },
};

export interface PolicyFileDocument {
  schemaVersion: "2.0";
  defaultProfile: string;
  profiles: Record<string, PolicyProfile>;
}

export interface ResolvedPolicyProfile {
  profile: PolicyProfile;
  profileName: string;
  source: "default" | "file";
  policyPath: string;
  envOverride: string | null;
}

export interface PolicySetupResult {
  created: boolean;
  policyPath: string;
}

export function defaultPolicyFileDocument(): PolicyFileDocument {
  return {
    schemaVersion: "2.0",
    defaultProfile: "default",
    profiles: {
      default: DEFAULT_POLICY_PROFILE,
    },
  };
}

export async function resolvePolicyProfile(cwd = process.cwd()): Promise<PolicyProfile> {
  const resolved = await resolveEffectivePolicyProfile(cwd);
  return resolved.profile;
}

export async function resolveEffectivePolicyProfile(
  cwd = process.cwd(),
): Promise<ResolvedPolicyProfile> {
  const policyPath = path.join(projectDocsRoot(cwd), "policy.json");
  const envProfile = normalizeProfileName(process.env.PA_POLICY_PROFILE);

  if (!(await pathExists(policyPath))) {
    return {
      profile: DEFAULT_POLICY_PROFILE,
      profileName: "default",
      source: "default",
      policyPath,
      envOverride: envProfile,
    };
  }

  const raw = await readJson<Record<string, unknown>>(policyPath);
  const selectedFromProfiles = selectProfile(raw, envProfile);
  if (selectedFromProfiles !== null) {
    return {
      profile: normalizePolicyProfile(selectedFromProfiles.value),
      profileName: selectedFromProfiles.name,
      source: "file",
      policyPath,
      envOverride: envProfile,
    };
  }

  const inlineTiming = normalizeTimingPolicy(raw.timing);
  if (inlineTiming !== null) {
    return {
      profile: {
        timing: {
          phase: mergeScope(DEFAULT_POLICY_PROFILE.timing.phase, inlineTiming.phase),
          milestone: mergeScope(DEFAULT_POLICY_PROFILE.timing.milestone, inlineTiming.milestone),
        },
      },
      profileName: "inline",
      source: "file",
      policyPath,
      envOverride: envProfile,
    };
  }

  return {
    profile: DEFAULT_POLICY_PROFILE,
    profileName: "default",
    source: "default",
    policyPath,
    envOverride: envProfile,
  };
}

export async function setupPolicyFile(cwd = process.cwd()): Promise<PolicySetupResult> {
  const docsRoot = projectDocsRoot(cwd);
  if (!(await pathExists(docsRoot))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }

  const policyPath = path.join(docsRoot, "policy.json");
  if (await pathExists(policyPath)) {
    return {
      created: false,
      policyPath,
    };
  }

  await writeJsonDeterministic(policyPath, defaultPolicyFileDocument());
  return {
    created: true,
    policyPath,
  };
}

function selectProfile(
  raw: Record<string, unknown>,
  envProfile: string | null,
): { name: string; value: unknown } | null {
  const profiles = asRecord(raw.profiles);
  if (!profiles) {
    return null;
  }

  const defaultProfile = typeof raw.defaultProfile === "string" ? raw.defaultProfile : "default";
  const profileName = envProfile ?? defaultProfile;

  if (profileName in profiles) {
    return {
      name: profileName,
      value: profiles[profileName],
    };
  }

  if ("default" in profiles) {
    return {
      name: "default",
      value: profiles.default,
    };
  }

  return null;
}

function normalizePolicyProfile(input: unknown): PolicyProfile {
  const value = asRecord(input);
  if (!value) {
    return DEFAULT_POLICY_PROFILE;
  }

  const timing = normalizeTimingPolicy(value.timing);
  if (!timing) {
    return DEFAULT_POLICY_PROFILE;
  }

  return {
    timing: {
      phase: mergeScope(DEFAULT_POLICY_PROFILE.timing.phase, timing.phase),
      milestone: mergeScope(DEFAULT_POLICY_PROFILE.timing.milestone, timing.milestone),
    },
  };
}

function normalizeTimingPolicy(input: unknown): TimingPolicy | null {
  const value = asRecord(input);
  if (!value) {
    return null;
  }

  return {
    phase: normalizeTimingScope(value.phase, DEFAULT_POLICY_PROFILE.timing.phase),
    milestone: normalizeTimingScope(value.milestone, DEFAULT_POLICY_PROFILE.timing.milestone),
  };
}

function normalizeTimingScope(input: unknown, defaults: TimingScopePolicy): TimingScopePolicy {
  const value = asRecord(input);
  if (!value) {
    return defaults;
  }

  const enforceStatuses = normalizeStatuses(value.enforceStatuses) ?? defaults.enforceStatuses;
  const skipDoneIfCompletedContainer =
    typeof value.skipDoneIfCompletedContainer === "boolean"
      ? value.skipDoneIfCompletedContainer
      : defaults.skipDoneIfCompletedContainer;

  const completionMode = normalizeCompletionMode(value.completionMode) ?? defaults.completionMode;

  return {
    enforceStatuses,
    skipDoneIfCompletedContainer,
    completionMode,
  };
}

function normalizeStatuses(input: unknown): CanonicalTaskStatus[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  const statuses = input
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeTaskStatus(item))
    .filter((item): item is CanonicalTaskStatus => item !== null);

  if (statuses.length === 0) {
    return null;
  }

  return CANONICAL_TASK_STATUSES.filter((status) => statuses.includes(status));
}

function normalizeCompletionMode(input: unknown): CompletionMode | null {
  if (
    input === "metadata_only" ||
    input === "all_tasks_done" ||
    input === "metadata_or_all_tasks_done"
  ) {
    return input;
  }
  return null;
}

function mergeScope(base: TimingScopePolicy, override: TimingScopePolicy): TimingScopePolicy {
  return {
    enforceStatuses: [...override.enforceStatuses],
    skipDoneIfCompletedContainer: override.skipDoneIfCompletedContainer,
    completionMode: override.completionMode,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeProfileName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
