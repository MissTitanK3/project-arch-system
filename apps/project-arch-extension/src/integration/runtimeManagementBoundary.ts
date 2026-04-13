import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
  type ProjectArchArtifactByKind,
  type ProjectArchRuntimeInventoryProfile,
  type ProjectArchRuntimeInventoryRuntime,
  type ProjectArchRuntimeScanCandidate,
  type ProjectArchRuntimeReadinessDiagnostic,
} from "./projectArchBoundary";

// ---------------------------------------------------------------------------
// Authority boundary metadata
// ---------------------------------------------------------------------------

export const EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY = {
  authority: "project-arch-cli-json",
  inventoryCommand: "pa runtime list --json",
  readinessCommand: "pa runtime check <profileId> --json",
  scanCommand: "pa runtime scan --json",
  mode: "runtime-management",
} as const;

// ---------------------------------------------------------------------------
// Profile mutation affordances
// ---------------------------------------------------------------------------

export type RuntimeManagementProfileMutationKind =
  | "enable"
  | "disable"
  | "set-default"
  | "unlink"
  | "update"
  | "inspect";

export interface RuntimeManagementProfileMutationAffordance {
  kind: RuntimeManagementProfileMutationKind;
  command: string;
  label: string;
}

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

/**
 * Per-profile view model for the runtime-management panel.
 * Separate from `RunsPanelRuntimeProfileOption` which only concerns launch eligibility.
 */
export interface RuntimeManagementProfileViewModel {
  id: string;
  runtime: string;
  runtimeDisplayName: string;
  model?: string | null;
  label?: string;
  purpose?: string;
  enabled: boolean;
  isDefault: boolean;
  linked: boolean;
  available: boolean;
  readiness: ProjectArchRuntimeInventoryProfile["readiness"];
  status: ProjectArchRuntimeInventoryProfile["status"];
  diagnostics: ProjectArchRuntimeReadinessDiagnostic[];
  availabilitySource: string;
  origin?: string;
  /** Ordered list of in-context mutations that can be applied to this profile. */
  affordances: RuntimeManagementProfileMutationAffordance[];
  /** One-line human-readable readiness summary for presentation. */
  readinessSummary: string;
}

/**
 * Per-runtime view model for the runtime-management panel.
 * Separate from `RunsPanelRuntimeScanCandidate` which concerns scan-candidate presentation.
 */
export interface RuntimeManagementRuntimeViewModel {
  runtime: string;
  displayName: string;
  description?: string;
  available: boolean;
  availabilitySource: string;
  linkedProfileCount: number;
  readyProfileCount: number;
  profileIds: string[];
}

/**
 * Per-candidate view model for the runtime-discovery / onboarding surface.
 * Marks whether a candidate already has a linked profile so the UI can show
 * "register" vs "already linked" affordances without merging scan and inventory logic.
 */
export interface RuntimeManagementCandidateViewModel {
  runtime: string;
  displayName: string;
  description?: string;
  confidence: "high" | "medium" | "low";
  source: ProjectArchRuntimeScanCandidate["source"];
  suggestedModel?: string;
  suggestedLabel?: string;
  alreadyLinked: boolean;
  registerCommand: string;
  diagnostics: ProjectArchRuntimeReadinessDiagnostic[];
}

/**
 * Full runtime-management inventory view model driving the management panel.
 * Distinct from `RunsPanelRuntimeProfilesModel` which drives launch selection UX.
 */
export interface RuntimeManagementInventoryViewModel {
  source: typeof EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY;
  generatedAt?: string;
  projectRoot?: string;
  defaultProfile?: string;
  runtimes: RuntimeManagementRuntimeViewModel[];
  profiles: RuntimeManagementProfileViewModel[];
  summary: {
    totalRuntimes: number;
    availableRuntimes: number;
    totalProfiles: number;
    readyProfiles: number;
    blockedProfiles: number;
    disabledProfiles: number;
  };
}

/**
 * Readiness check view model for the profile detail / drill-in surface.
 */
export interface RuntimeManagementReadinessViewModel {
  source: typeof EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY;
  checkedAt: string;
  profileId?: string;
  profiles: RuntimeManagementProfileViewModel[];
  allReady: boolean;
  blockedCount: number;
}

/**
 * Runtime scan view model for onboarding and discovery in the dedicated
 * runtime-management panel.
 */
export interface RuntimeManagementScanViewModel {
  source: typeof EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY;
  scannedAt: string;
  scanStatus: ProjectArchArtifactByKind["runtime-scan-result"]["scanStatus"];
  candidates: RuntimeManagementCandidateViewModel[];
  diagnostics: ProjectArchRuntimeReadinessDiagnostic[];
}

// ---------------------------------------------------------------------------
// Shaping helpers
// ---------------------------------------------------------------------------

function readinessSummaryText(profile: ProjectArchRuntimeInventoryProfile): string {
  if (profile.readiness === "ready") {
    return "Ready to launch.";
  }

  if (profile.readiness === "disabled") {
    return "Profile is disabled.";
  }

  const first = profile.diagnostics[0];
  return first?.message ?? `Not ready: ${profile.readiness}.`;
}

function buildProfileAffordances(
  profile: ProjectArchRuntimeInventoryProfile,
  defaultProfile?: string,
): RuntimeManagementProfileMutationAffordance[] {
  const affordances: RuntimeManagementProfileMutationAffordance[] = [];

  affordances.push({
    kind: "inspect",
    command: `pa runtime check ${profile.id} --json`,
    label: "Inspect readiness",
  });

  if (profile.enabled) {
    affordances.push({
      kind: "disable",
      command: `pa runtime disable ${profile.id}`,
      label: "Disable profile",
    });
  } else {
    affordances.push({
      kind: "enable",
      command: `pa runtime enable ${profile.id}`,
      label: "Enable profile",
    });
  }

  if (!profile.default && defaultProfile !== profile.id) {
    affordances.push({
      kind: "set-default",
      command: `pa runtime default ${profile.id}`,
      label: "Set as default",
    });
  }

  affordances.push({
    kind: "update",
    command: `pa runtime update ${profile.id}`,
    label: "Update profile",
  });

  if (profile.linked) {
    affordances.push({
      kind: "unlink",
      command: `pa runtime unlink ${profile.id}`,
      label: "Unlink profile",
    });
  }

  return affordances;
}

export function mapRuntimeManagementProfileViewModel(
  profile: ProjectArchRuntimeInventoryProfile,
  runtimeDisplayName: string,
  defaultProfile?: string,
): RuntimeManagementProfileViewModel {
  return {
    id: profile.id,
    runtime: profile.runtime,
    runtimeDisplayName,
    model: profile.model,
    label: profile.label,
    purpose: profile.purpose,
    enabled: profile.enabled,
    isDefault: profile.default,
    linked: profile.linked,
    available: profile.available,
    readiness: profile.readiness,
    status: profile.status,
    diagnostics: profile.diagnostics,
    availabilitySource: profile.available ? "adapter-registry" : "none",
    origin: profile.origin,
    affordances: buildProfileAffordances(profile, defaultProfile),
    readinessSummary: readinessSummaryText(profile),
  };
}

export function mapRuntimeManagementRuntimeViewModel(
  runtime: ProjectArchRuntimeInventoryRuntime,
  profiles: RuntimeManagementProfileViewModel[],
): RuntimeManagementRuntimeViewModel {
  const readyProfileCount = profiles.filter(
    (p) => p.runtime === runtime.runtime && p.readiness === "ready",
  ).length;

  return {
    runtime: runtime.runtime,
    displayName: runtime.displayName,
    description: runtime.description,
    available: runtime.available,
    availabilitySource: runtime.availabilitySource,
    linkedProfileCount: runtime.profiles.length,
    readyProfileCount,
    profileIds: runtime.profiles,
  };
}

export function mapRuntimeManagementCandidateViewModel(
  candidate: ProjectArchRuntimeScanCandidate,
  linkedRuntimeIds: Set<string>,
): RuntimeManagementCandidateViewModel {
  const alreadyLinked = linkedRuntimeIds.has(candidate.runtime);

  return {
    runtime: candidate.runtime,
    displayName: candidate.displayName,
    description: candidate.description,
    confidence: candidate.confidence,
    source: candidate.source,
    suggestedModel: candidate.suggestedModel,
    suggestedLabel: candidate.suggestedLabel,
    alreadyLinked,
    registerCommand:
      candidate.runtime === "ollama"
        ? `pa runtime link ${candidate.runtime} --profile main${candidate.suggestedModel ? ` --model ${candidate.suggestedModel}` : ""}`
        : `pa runtime link ${candidate.runtime} --profile <id>${candidate.suggestedModel ? ` --model ${candidate.suggestedModel}` : ""}`,
    diagnostics: candidate.diagnostics,
  };
}

export function buildRuntimeManagementInventoryViewModel(
  inventory: ProjectArchArtifactByKind["runtime-inventory-list-result"],
): RuntimeManagementInventoryViewModel {
  const runtimeDisplayNameById = new Map(inventory.runtimes.map((r) => [r.runtime, r.displayName]));

  const profileViewModels = inventory.profiles.map((profile) =>
    mapRuntimeManagementProfileViewModel(
      profile,
      runtimeDisplayNameById.get(profile.runtime) ?? profile.runtime,
      inventory.defaultProfile,
    ),
  );

  const runtimeViewModels = inventory.runtimes.map((runtime) =>
    mapRuntimeManagementRuntimeViewModel(runtime, profileViewModels),
  );

  const readyProfiles = profileViewModels.filter((p) => p.readiness === "ready").length;
  const blockedProfiles = profileViewModels.filter(
    (p) => p.readiness !== "ready" && p.readiness !== "disabled",
  ).length;
  const disabledProfiles = profileViewModels.filter((p) => p.readiness === "disabled").length;
  const availableRuntimes = runtimeViewModels.filter((r) => r.available).length;

  return {
    source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
    generatedAt: inventory.generatedAt,
    projectRoot: inventory.projectRoot,
    defaultProfile: inventory.defaultProfile,
    runtimes: runtimeViewModels,
    profiles: profileViewModels,
    summary: {
      totalRuntimes: runtimeViewModels.length,
      availableRuntimes,
      totalProfiles: profileViewModels.length,
      readyProfiles,
      blockedProfiles,
      disabledProfiles,
    },
  };
}

export function buildRuntimeManagementReadinessViewModel(
  readiness: ProjectArchArtifactByKind["runtime-readiness-check-result"],
  inventory?: ProjectArchArtifactByKind["runtime-inventory-list-result"],
): RuntimeManagementReadinessViewModel {
  const runtimeDisplayNameById = new Map(
    (inventory?.runtimes ?? []).map((r) => [r.runtime, r.displayName]),
  );

  const profileViewModels = readiness.profiles.map((profile) =>
    mapRuntimeManagementProfileViewModel(
      profile,
      runtimeDisplayNameById.get(profile.runtime) ?? profile.runtime,
      inventory?.defaultProfile,
    ),
  );

  const blockedCount = profileViewModels.filter(
    (p) => p.readiness !== "ready" && p.readiness !== "disabled",
  ).length;

  return {
    source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
    checkedAt: readiness.checkedAt,
    profileId: readiness.profileId,
    profiles: profileViewModels,
    allReady: blockedCount === 0 && profileViewModels.every((p) => p.readiness === "ready"),
    blockedCount,
  };
}

export function buildRuntimeManagementScanViewModel(
  scan: ProjectArchArtifactByKind["runtime-scan-result"],
  linkedRuntimeIds: Iterable<string> = [],
): RuntimeManagementScanViewModel {
  const linkedSet = new Set(linkedRuntimeIds);

  return {
    source: EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
    scannedAt: scan.scannedAt,
    scanStatus: scan.scanStatus,
    candidates: scan.candidates.map((candidate) =>
      mapRuntimeManagementCandidateViewModel(candidate, linkedSet),
    ),
    diagnostics: scan.diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Async loaders
// ---------------------------------------------------------------------------

export async function loadRuntimeManagementInventoryViewModel(
  input: {
    boundary?: ProjectArchBoundary;
    cwd?: string;
  } = {},
): Promise<RuntimeManagementInventoryViewModel> {
  const boundary = input.boundary ?? createProjectArchBoundary();
  const inventory = await boundary.readRuntimeInventoryList({ cwd: input.cwd });
  return buildRuntimeManagementInventoryViewModel(inventory);
}

export async function loadRuntimeManagementReadinessViewModel(
  input: {
    boundary?: ProjectArchBoundary;
    cwd?: string;
    profileId?: string;
    inventory?: ProjectArchArtifactByKind["runtime-inventory-list-result"];
  } = {},
): Promise<RuntimeManagementReadinessViewModel> {
  const boundary = input.boundary ?? createProjectArchBoundary();
  const readiness = await boundary.readRuntimeReadinessCheck({
    cwd: input.cwd,
    profileId: input.profileId,
  });
  return buildRuntimeManagementReadinessViewModel(readiness, input.inventory);
}

export async function loadRuntimeManagementScanViewModel(
  input: {
    boundary?: ProjectArchBoundary;
    cwd?: string;
    linkedRuntimeIds?: Iterable<string>;
  } = {},
): Promise<RuntimeManagementScanViewModel> {
  const boundary = input.boundary ?? createProjectArchBoundary();
  const scan = await boundary.readRuntimeScan({ cwd: input.cwd });
  return buildRuntimeManagementScanViewModel(scan, input.linkedRuntimeIds);
}
