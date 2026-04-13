import type { NormalizedTaskWorkflow } from "../navigation/taskWorkflowParser";
import type { StageRuntimeRoutingModel } from "./stageRuntimeRoutingBoundary";
import { computeWorkflowRoutingFingerprint } from "./stageRuntimeRoutingBoundary";

export interface RoutingDriftSignal {
  stageId: string;
  stageTitle: string;
  routingState: "degraded" | "blocked";
  validationReason: "fallback-ready" | "no-viable-path";
  preferredKind: "local" | "cloud" | "hybrid" | "deterministic";
  availableAlternatives: Array<"local" | "cloud" | "hybrid" | "deterministic">;
}

export interface RoutingDriftAcknowledgmentRecord {
  fingerprint: string;
  acknowledgedAt: number;
}

export interface RoutingDriftStateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface RoutingDriftEvaluation {
  shouldWarn: boolean;
  taskPath: string;
  fingerprint: string;
  driftSignals: RoutingDriftSignal[];
}

export interface RoutingDriftAcknowledgmentBoundary {
  detectRoutingDrift(model: StageRuntimeRoutingModel): RoutingDriftSignal[];
  evaluateRoutingDrift(input: {
    taskPath: string;
    workflow: NormalizedTaskWorkflow;
    model: StageRuntimeRoutingModel;
    stateStore: RoutingDriftStateStore;
    stateKey: string;
  }): RoutingDriftEvaluation;
  acknowledgeRoutingDrift(input: {
    taskPath: string;
    fingerprint: string;
    stateStore: RoutingDriftStateStore;
    stateKey: string;
  }): Promise<void>;
}

function normalizeTaskPath(taskPath: string): string {
  return taskPath.trim();
}

function readStateMap(
  stateStore: RoutingDriftStateStore,
  stateKey: string,
): Record<string, RoutingDriftAcknowledgmentRecord> {
  const raw = stateStore.get<unknown>(stateKey);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as Record<string, RoutingDriftAcknowledgmentRecord>;
}

export function detectRoutingDrift(model: StageRuntimeRoutingModel): RoutingDriftSignal[] {
  const driftSignals: RoutingDriftSignal[] = [];

  for (const stage of model.stageRoutings) {
    if (stage.routingState === "compatible") {
      continue;
    }

    if (
      stage.validationReason !== "fallback-ready" &&
      stage.validationReason !== "no-viable-path"
    ) {
      continue;
    }

    driftSignals.push({
      stageId: stage.stage.id,
      stageTitle: stage.stage.title,
      routingState: stage.routingState,
      validationReason: stage.validationReason,
      preferredKind: stage.preferredKind,
      availableAlternatives: stage.availableAlternatives,
    });
  }

  return driftSignals;
}

export function evaluateRoutingDrift(input: {
  taskPath: string;
  workflow: NormalizedTaskWorkflow;
  model: StageRuntimeRoutingModel;
  stateStore: RoutingDriftStateStore;
  stateKey: string;
}): RoutingDriftEvaluation {
  const taskPath = normalizeTaskPath(input.taskPath);
  const fingerprint = computeWorkflowRoutingFingerprint(input.workflow);
  const driftSignals = detectRoutingDrift(input.model);

  if (!taskPath || driftSignals.length === 0) {
    return {
      shouldWarn: false,
      taskPath,
      fingerprint,
      driftSignals,
    };
  }

  const stateMap = readStateMap(input.stateStore, input.stateKey);
  const priorAcknowledgment = stateMap[taskPath];

  const shouldWarn =
    !priorAcknowledgment || priorAcknowledgment.fingerprint.trim() !== fingerprint.trim();

  return {
    shouldWarn,
    taskPath,
    fingerprint,
    driftSignals,
  };
}

export async function acknowledgeRoutingDrift(input: {
  taskPath: string;
  fingerprint: string;
  stateStore: RoutingDriftStateStore;
  stateKey: string;
}): Promise<void> {
  const taskPath = normalizeTaskPath(input.taskPath);
  if (!taskPath) {
    return;
  }

  const stateMap = readStateMap(input.stateStore, input.stateKey);
  stateMap[taskPath] = {
    fingerprint: input.fingerprint.trim(),
    acknowledgedAt: Date.now(),
  };

  await input.stateStore.update(input.stateKey, stateMap);
}

export function createRoutingDriftAcknowledgmentBoundary(): RoutingDriftAcknowledgmentBoundary {
  return {
    detectRoutingDrift,
    evaluateRoutingDrift,
    acknowledgeRoutingDrift,
  };
}
