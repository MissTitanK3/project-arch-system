import type {
  NormalizedTaskWorkflow,
  NormalizedTaskWorkflowStage,
  TaskWorkflowRuntimePreference,
} from "../navigation/taskWorkflowParser";
import type { RuntimeProfileLaunchBoundaryModel } from "./runtimeProfileLaunchBoundary";

/**
 * Represents the compatibility state of a stage with available runtimes.
 *
 * - `compatible`: The preferred runtime is available and ready
 * - `degraded`: The preferred runtime is not ready, but alternatives exist
 * - `blocked`: No suitable runtime is available
 */
export type StageRoutingState = "compatible" | "degraded" | "blocked";

/**
 * Runtime kind classification for routing policy.
 *
 * - `local`: Can run on local development machines
 * - `cloud`: Requires cloud infrastructure
 * - `hybrid`: Can run on either local or cloud
 * - `deterministic`: Runtime-agnostic, always available
 */
export type RuntimeKind = "local" | "cloud" | "hybrid" | "deterministic";

export interface StageRoutingProfile {
  stage: NormalizedTaskWorkflowStage;
  routingState: StageRoutingState;
  preferredKind: RuntimeKind;
  availableAlternatives: RuntimeKind[];
  validationReason: "deterministic-stage" | "preferred-ready" | "fallback-ready" | "no-viable-path";
  diagnostics: string;
}

export interface StageRuntimeRoutingModel {
  workflow: NormalizedTaskWorkflow;
  stageRoutings: StageRoutingProfile[];
}

interface RuntimeKindAvailability {
  configuredProfiles: number;
  enabledProfiles: number;
  readyProfiles: number;
  unavailableProfiles: number;
  disabledProfiles: number;
}

interface RuntimeCapabilitySnapshot {
  local: RuntimeKindAvailability;
  cloud: RuntimeKindAvailability;
}

function collectKindAvailability(
  runtimeProfiles: RuntimeProfileLaunchBoundaryModel,
  runtimeKind: "local" | "cloud",
): RuntimeKindAvailability {
  const kindProfiles = runtimeProfiles.options.filter((profile) => profile.runtime === runtimeKind);

  let enabledProfiles = 0;
  let readyProfiles = 0;
  let unavailableProfiles = 0;
  let disabledProfiles = 0;

  for (const profile of kindProfiles) {
    if (!profile.enabled || profile.eligibility === "disabled") {
      disabledProfiles += 1;
      continue;
    }

    enabledProfiles += 1;

    if (profile.eligibility === "ready") {
      readyProfiles += 1;
      continue;
    }

    unavailableProfiles += 1;
  }

  return {
    configuredProfiles: kindProfiles.length,
    enabledProfiles,
    readyProfiles,
    unavailableProfiles,
    disabledProfiles,
  };
}

function collectRuntimeCapabilitySnapshot(
  runtimeProfiles: RuntimeProfileLaunchBoundaryModel,
): RuntimeCapabilitySnapshot {
  return {
    local: collectKindAvailability(runtimeProfiles, "local"),
    cloud: collectKindAvailability(runtimeProfiles, "cloud"),
  };
}

function resolveAvailableAlternatives(
  capability: RuntimeCapabilitySnapshot,
  excludeKind: RuntimeKind,
): RuntimeKind[] {
  const alternatives: RuntimeKind[] = [];

  if (excludeKind !== "local" && capability.local.readyProfiles > 0) {
    alternatives.push("local");
  }

  if (excludeKind !== "cloud" && capability.cloud.readyProfiles > 0) {
    alternatives.push("cloud");
  }

  return alternatives;
}

/**
 * Resolves stage routing state based on preference and available runtimes.
 */
function resolveStageRoutingState(
  preference: TaskWorkflowRuntimePreference,
  runtimeProfiles: RuntimeProfileLaunchBoundaryModel,
): {
  state: StageRoutingState;
  preferredKind: RuntimeKind;
  alternatives: RuntimeKind[];
  validationReason: StageRoutingProfile["validationReason"];
  capability: RuntimeCapabilitySnapshot;
} {
  const capability = collectRuntimeCapabilitySnapshot(runtimeProfiles);

  // Deterministic stages have no runtime routing concerns
  if (preference === "deterministic") {
    return {
      state: "compatible",
      preferredKind: "deterministic",
      alternatives: [],
      validationReason: "deterministic-stage",
      capability,
    };
  }

  // Map task preference to required runtime kind
  const preferredKind: RuntimeKind =
    preference === "local" ? "local" : preference === "cloud" ? "cloud" : "hybrid";
  if (preferredKind === "hybrid") {
    const alternatives = resolveAvailableAlternatives(capability, preferredKind);
    const anyReady = capability.local.readyProfiles > 0 || capability.cloud.readyProfiles > 0;

    return {
      state: anyReady ? "compatible" : "blocked",
      preferredKind,
      alternatives,
      validationReason: anyReady ? "preferred-ready" : "no-viable-path",
      capability,
    };
  }

  const preferredAvailability = preferredKind === "local" ? capability.local : capability.cloud;
  const alternatives = resolveAvailableAlternatives(capability, preferredKind);

  if (preferredAvailability.readyProfiles > 0) {
    return {
      state: "compatible",
      preferredKind,
      alternatives: [],
      validationReason: "preferred-ready",
      capability,
    };
  }

  if (alternatives.length > 0) {
    return {
      state: "degraded",
      preferredKind,
      alternatives,
      validationReason: "fallback-ready",
      capability,
    };
  }

  return {
    state: "blocked",
    preferredKind,
    alternatives,
    validationReason: "no-viable-path",
    capability,
  };
}

/**
 * Generates diagnostic message for a stage routing state.
 */
function generateRoutingDiagnostic(
  stage: NormalizedTaskWorkflowStage,
  state: StageRoutingState,
  preferredKind: RuntimeKind,
  alternatives: RuntimeKind[],
  validationReason: StageRoutingProfile["validationReason"],
  capability: RuntimeCapabilitySnapshot,
): string {
  const stageName = stage.title || stage.id;

  if (validationReason === "deterministic-stage") {
    return `Stage '${stageName}' (${stage.runtimePreference}): deterministic stage does not require runtime routing validation`;
  }

  if (state === "compatible") {
    return `Stage '${stageName}' (${stage.runtimePreference}): compatible with runtime config and capability`;
  }

  if (state === "degraded") {
    const alt = alternatives.join(" or ");
    const preferredAvailability = preferredKind === "local" ? capability.local : capability.cloud;

    if (preferredAvailability.unavailableProfiles > 0) {
      return `Stage '${stageName}' prefers ${preferredKind} but preferred profiles are temporarily unavailable; fallback ${alt} is ready`;
    }

    if (preferredAvailability.disabledProfiles > 0) {
      return `Stage '${stageName}' prefers ${preferredKind} but preferred profiles are disabled in runtime config; fallback ${alt} is ready`;
    }

    return `Stage '${stageName}' prefers ${preferredKind} but only ${alt} is currently viable`;
  }

  return `Stage '${stageName}' (${stage.runtimePreference}): no viable runtime path available from enabled runtime profiles`;
}

/**
 * Computes stage routing profiles for all stages in a workflow.
 */
export function resolveWorkflowStageRoutings(
  workflow: NormalizedTaskWorkflow,
  runtimeProfiles: RuntimeProfileLaunchBoundaryModel,
): StageRuntimeRoutingModel {
  const stageRoutings = workflow.workflow.stages.map((stage) => {
    const { state, preferredKind, alternatives, validationReason, capability } =
      resolveStageRoutingState(stage.runtimePreference, runtimeProfiles);

    return {
      stage,
      routingState: state,
      preferredKind,
      availableAlternatives: alternatives,
      validationReason,
      diagnostics: generateRoutingDiagnostic(
        stage,
        state,
        preferredKind,
        alternatives,
        validationReason,
        capability,
      ),
    };
  });

  return {
    workflow,
    stageRoutings,
  };
}

/**
 * Computes a fingerprint of workflow and runtime preferences for drift detection.
 * This fingerprint invalidates when routing intent changes materially.
 */
export function computeWorkflowRoutingFingerprint(workflow: NormalizedTaskWorkflow): string {
  const routingParts = [
    workflow.task.taskType,
    workflow.workflow.schemaVersion,
    workflow.workflow.template,
    ...workflow.workflow.stages.map((stage) => `${stage.id}:${stage.runtimePreference}`),
  ];

  // Simple hash-like combination for fingerprint
  return routingParts.join("|");
}

/**
 * Query the overall workflow routing readiness status.
 */
export function computeWorkflowRoutingReadiness(
  model: StageRuntimeRoutingModel,
): "ready" | "degraded" | "blocked" {
  const states = model.stageRoutings.map((sr) => sr.routingState);

  if (states.some((s) => s === "blocked")) {
    return "blocked";
  }

  if (states.some((s) => s === "degraded")) {
    return "degraded";
  }

  return "ready";
}

export interface StageRuntimeRoutingBoundary {
  resolveWorkflowStageRoutings(
    workflow: NormalizedTaskWorkflow,
    runtimeProfiles: RuntimeProfileLaunchBoundaryModel,
  ): StageRuntimeRoutingModel;
  computeWorkflowRoutingFingerprint(workflow: NormalizedTaskWorkflow): string;
  computeWorkflowRoutingReadiness(
    model: StageRuntimeRoutingModel,
  ): "ready" | "degraded" | "blocked";
}

export function createStageRuntimeRoutingBoundary(): StageRuntimeRoutingBoundary {
  return {
    resolveWorkflowStageRoutings,
    computeWorkflowRoutingFingerprint,
    computeWorkflowRoutingReadiness,
  };
}
