import {
  createProjectArchBoundary,
  type ProjectArchBoundary,
  type ProjectArchArtifactByKind,
  type ProjectArchRuntimeInventoryProfile,
} from "./projectArchBoundary";

export const EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY = {
  authority: "project-arch-cli-json",
  inventoryCommand: "pa runtime list --json",
  readinessCommand: "pa runtime check <profileId> --json",
  mode: "bounded-combination",
} as const;

export type RuntimeLaunchEligibility = "ready" | "disabled" | "blocked";

export interface RuntimeLaunchProfileOption {
  id: string;
  runtime: string;
  model?: string | null;
  isDefault: boolean;
  enabled: boolean;
  readiness: ProjectArchArtifactByKind["runtime-inventory-list-result"]["profiles"][number]["readiness"];
  status: ProjectArchArtifactByKind["runtime-inventory-list-result"]["profiles"][number]["status"];
  eligibility: RuntimeLaunchEligibility;
  inlineSummary: string;
  diagnostics: ProjectArchArtifactByKind["runtime-inventory-list-result"]["profiles"][number]["diagnostics"];
}

export type RuntimeLaunchSelectionState =
  | "empty-inventory"
  | "selected-default-ready"
  | "default-disabled-fallback-ready"
  | "default-blocked-fallback-ready"
  | "default-disabled-no-ready"
  | "default-blocked-no-ready"
  | "selected-first-ready"
  | "no-ready-profiles";

export interface RuntimeLaunchTargetDecision {
  state: RuntimeLaunchSelectionState;
  selectedProfileId?: string;
  reason: string;
  nextStep: string;
}

export interface RuntimeProfileDiagnosticPresentation {
  mode: "inline-only" | "inline-with-drill-in";
  summary: string;
  detailsCommand?: string;
  refreshCommand: "pa runtime list --json";
}

export interface RuntimeProfileLaunchBoundaryModel {
  source: typeof EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY;
  defaultProfile?: string;
  options: RuntimeLaunchProfileOption[];
  decision: RuntimeLaunchTargetDecision;
}

function toEligibility(
  readiness: RuntimeLaunchProfileOption["readiness"],
): RuntimeLaunchEligibility {
  if (readiness === "ready") {
    return "ready";
  }

  if (readiness === "disabled") {
    return "disabled";
  }

  return "blocked";
}

function inlineSummary(input: {
  eligibility: RuntimeLaunchEligibility;
  readiness: RuntimeLaunchProfileOption["readiness"];
  diagnostics: RuntimeLaunchProfileOption["diagnostics"];
}): string {
  if (input.eligibility === "ready") {
    return "Ready to launch.";
  }

  if (input.eligibility === "disabled") {
    return "Profile is disabled in runtime config.";
  }

  const first = input.diagnostics[0];
  return first?.message ?? `Profile is not ready: ${input.readiness}.`;
}

export function mapRuntimeLaunchOptions(
  inventory: ProjectArchArtifactByKind["runtime-inventory-list-result"],
): RuntimeLaunchProfileOption[] {
  return inventory.profiles.map((profile: ProjectArchRuntimeInventoryProfile) => {
    const eligibility = toEligibility(profile.readiness);

    return {
      id: profile.id,
      runtime: profile.runtime,
      model: profile.model,
      isDefault: profile.default,
      enabled: profile.enabled,
      readiness: profile.readiness,
      status: profile.status,
      eligibility,
      inlineSummary: inlineSummary({
        eligibility,
        readiness: profile.readiness,
        diagnostics: profile.diagnostics,
      }),
      diagnostics: profile.diagnostics,
    };
  });
}

function firstReady(options: RuntimeLaunchProfileOption[]): RuntimeLaunchProfileOption | undefined {
  return options.find((option) => option.eligibility === "ready");
}

export function selectRuntimeLaunchTarget(input: {
  options: RuntimeLaunchProfileOption[];
  defaultProfile?: string;
}): RuntimeLaunchTargetDecision {
  if (input.options.length === 0) {
    return {
      state: "empty-inventory",
      reason: "No linked runtime profiles are available in this repository.",
      nextStep: "Link a runtime profile with pa runtime link and refresh the Runs panel.",
    };
  }

  const byId = new Map(input.options.map((option) => [option.id, option]));
  const readyFallback = firstReady(input.options);

  if (input.defaultProfile) {
    const defaultOption = byId.get(input.defaultProfile);
    if (defaultOption?.eligibility === "ready") {
      return {
        state: "selected-default-ready",
        selectedProfileId: defaultOption.id,
        reason: "Default runtime profile is ready.",
        nextStep: "Launch with the default profile or choose another ready profile.",
      };
    }

    if (defaultOption?.eligibility === "disabled") {
      if (readyFallback) {
        return {
          state: "default-disabled-fallback-ready",
          selectedProfileId: readyFallback.id,
          reason: `Default profile '${defaultOption.id}' is disabled; selected ready fallback '${readyFallback.id}'.`,
          nextStep: `Enable '${defaultOption.id}' with pa runtime enable ${defaultOption.id} or keep fallback selection.`,
        };
      }

      return {
        state: "default-disabled-no-ready",
        reason: `Default profile '${defaultOption.id}' is disabled and no ready profiles are available.`,
        nextStep: `Enable '${defaultOption.id}' or fix another profile, then refresh runtime inventory.`,
      };
    }

    if (defaultOption && defaultOption.eligibility === "blocked") {
      if (readyFallback) {
        return {
          state: "default-blocked-fallback-ready",
          selectedProfileId: readyFallback.id,
          reason: `Default profile '${defaultOption.id}' is not ready; selected ready fallback '${readyFallback.id}'.`,
          nextStep: `Inspect diagnostics for '${defaultOption.id}' via pa runtime check ${defaultOption.id} --json.`,
        };
      }

      return {
        state: "default-blocked-no-ready",
        reason: `Default profile '${defaultOption.id}' is not ready and no ready fallback exists.`,
        nextStep: `Resolve readiness diagnostics with pa runtime check ${defaultOption.id} --json and refresh inventory.`,
      };
    }
  }

  if (readyFallback) {
    return {
      state: "selected-first-ready",
      selectedProfileId: readyFallback.id,
      reason: "No ready default profile; selected first ready profile.",
      nextStep: "Launch with selected profile or update default profile preference.",
    };
  }

  return {
    state: "no-ready-profiles",
    reason: "Linked profiles exist, but none are launch-ready.",
    nextStep: "Inspect profile diagnostics and run pa runtime check <profileId> --json.",
  };
}

export function buildRuntimeDiagnosticPresentation(
  option: RuntimeLaunchProfileOption,
): RuntimeProfileDiagnosticPresentation {
  if (option.eligibility === "ready") {
    return {
      mode: "inline-only",
      summary: option.inlineSummary,
      refreshCommand: "pa runtime list --json",
    };
  }

  return {
    mode: "inline-with-drill-in",
    summary: option.inlineSummary,
    detailsCommand: `pa runtime check ${option.id} --json`,
    refreshCommand: "pa runtime list --json",
  };
}

export function buildRuntimeProfileLaunchBoundaryModel(
  inventory: ProjectArchArtifactByKind["runtime-inventory-list-result"],
): RuntimeProfileLaunchBoundaryModel {
  const options = mapRuntimeLaunchOptions(inventory);
  const decision = selectRuntimeLaunchTarget({
    options,
    defaultProfile: inventory.defaultProfile,
  });

  return {
    source: EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY,
    defaultProfile: inventory.defaultProfile,
    options,
    decision,
  };
}

export async function loadRuntimeProfileLaunchBoundaryModel(
  input: {
    boundary?: ProjectArchBoundary;
    cwd?: string;
  } = {},
): Promise<RuntimeProfileLaunchBoundaryModel> {
  const boundary = input.boundary ?? createProjectArchBoundary();
  const inventory = await boundary.readRuntimeInventoryList({
    cwd: input.cwd,
  });

  return buildRuntimeProfileLaunchBoundaryModel(inventory);
}
