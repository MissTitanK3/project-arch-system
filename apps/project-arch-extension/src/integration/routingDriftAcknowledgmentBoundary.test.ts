import { describe, expect, it } from "vitest";
import type {
  NormalizedTaskWorkflow,
  TaskWorkflowRuntimePreference,
} from "../navigation/taskWorkflowParser";
import type {
  RuntimeLaunchProfileOption,
  RuntimeProfileLaunchBoundaryModel,
} from "./runtimeProfileLaunchBoundary";
import { createRoutingDriftAcknowledgmentBoundary } from "./routingDriftAcknowledgmentBoundary";
import { createStageRuntimeRoutingBoundary } from "./stageRuntimeRoutingBoundary";

function createMockWorkflow(
  stages: Array<{ id: string; runtimePreference: TaskWorkflowRuntimePreference }>,
): NormalizedTaskWorkflow {
  const mappedStages: NormalizedTaskWorkflow["workflow"]["stages"] = stages.map((stage, index) => ({
    id: stage.id,
    title: `Stage ${index + 1}`,
    state: "not_started",
    runtimePreference: stage.runtimePreference,
    source: "frontmatter",
    items: [
      {
        id: `item-${index}`,
        label: "Test item",
        status: "planned",
        runtimePreference: stage.runtimePreference,
        source: "frontmatter",
        evidencePaths: [],
      },
    ],
    summary: {
      total: 1,
      planned: 1,
      inProgress: 0,
      done: 0,
      blocked: 0,
      skipped: 0,
      completionRatio: 0,
    },
  }));

  return {
    task: {
      id: "task-001",
      slug: "test-task",
      title: "Test Task",
      lane: "planned",
      status: "planned",
      taskType: "implementation",
    },
    workflow: {
      schemaVersion: "2.0",
      template: "default-implementation",
      sources: {
        authoritativeWorkflow: "frontmatter",
        authoritativeCompletion: "frontmatter",
        supportingMarkdownMirror: "absent",
        supportingSections: [],
      },
      stages: mappedStages,
      summary: {
        totalStages: mappedStages.length,
        notStartedStages: mappedStages.length,
        inProgressStages: 0,
        completedStages: 0,
        blockedStages: 0,
        overallState: "not_started",
        items: {
          total: mappedStages.length,
          planned: mappedStages.length,
          inProgress: 0,
          done: 0,
          blocked: 0,
          skipped: 0,
          completionRatio: 0,
        },
      },
    },
  };
}

function createMockRuntimeProfiles(
  profiles: Array<{
    runtime: "local" | "cloud";
    readiness: RuntimeLaunchProfileOption["readiness"];
    enabled?: boolean;
  }>,
): RuntimeProfileLaunchBoundaryModel {
  return {
    source: {
      authority: "project-arch-cli-json",
      inventoryCommand: "pa runtime list --json",
      readinessCommand: "pa runtime check <profileId> --json",
      mode: "bounded-combination",
    },
    defaultProfile: "default-local",
    options: profiles.map(
      (profile): RuntimeLaunchProfileOption => ({
        id: `profile-${profile.runtime}`,
        runtime: profile.runtime,
        isDefault: profile.runtime === "local",
        enabled: profile.enabled ?? true,
        readiness: profile.readiness,
        status: !(profile.enabled ?? true)
          ? "disabled"
          : profile.readiness === "ready"
            ? "ready"
            : profile.readiness === "disabled"
              ? "disabled"
              : "not-ready",
        eligibility: !(profile.enabled ?? true)
          ? "disabled"
          : profile.readiness === "ready"
            ? "ready"
            : profile.readiness === "disabled"
              ? "disabled"
              : "blocked",
        inlineSummary: profile.runtime,
        diagnostics: [],
      }),
    ),
    decision: {
      state: "selected-default-ready",
      selectedProfileId: "profile-local",
      reason: "default profile is ready",
      nextStep: "ready to use",
    },
  };
}

describe("routingDriftAcknowledgmentBoundary", () => {
  it("detects drift mismatches from degraded and blocked routing states", () => {
    const routingBoundary = createStageRuntimeRoutingBoundary();
    const driftBoundary = createRoutingDriftAcknowledgmentBoundary();

    const workflow = createMockWorkflow([
      { id: "context", runtimePreference: "local" },
      { id: "implementation", runtimePreference: "cloud" },
    ]);

    const runtimeProfiles = createMockRuntimeProfiles([
      { runtime: "local", readiness: "ready" },
      { runtime: "cloud", readiness: "runtime-unavailable" },
    ]);

    const model = routingBoundary.resolveWorkflowStageRoutings(workflow, runtimeProfiles);
    const drift = driftBoundary.detectRoutingDrift(model);

    expect(drift).toHaveLength(1);
    expect(drift[0].stageId).toBe("implementation");
    expect(drift[0].routingState).toBe("degraded");
    expect(drift[0].validationReason).toBe("fallback-ready");
  });

  it("suppresses repeat warnings after acknowledgment for same task and fingerprint", async () => {
    const routingBoundary = createStageRuntimeRoutingBoundary();
    const driftBoundary = createRoutingDriftAcknowledgmentBoundary();

    const state: Record<string, unknown> = {};
    const stateStore = {
      get: <T>(key: string): T | undefined => state[key] as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        state[key] = value;
      },
    };

    const workflow = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
    const runtimeProfiles = createMockRuntimeProfiles([
      { runtime: "local", readiness: "ready" },
      { runtime: "cloud", readiness: "runtime-unavailable" },
    ]);

    const model = routingBoundary.resolveWorkflowStageRoutings(workflow, runtimeProfiles);

    const beforeAck = driftBoundary.evaluateRoutingDrift({
      taskPath: "feedback/tasks/planned/001-test.md",
      workflow,
      model,
      stateStore,
      stateKey: "routing-drift-acks",
    });

    expect(beforeAck.shouldWarn).toBe(true);

    await driftBoundary.acknowledgeRoutingDrift({
      taskPath: beforeAck.taskPath,
      fingerprint: beforeAck.fingerprint,
      stateStore,
      stateKey: "routing-drift-acks",
    });

    const afterAck = driftBoundary.evaluateRoutingDrift({
      taskPath: "feedback/tasks/planned/001-test.md",
      workflow,
      model,
      stateStore,
      stateKey: "routing-drift-acks",
    });

    expect(afterAck.shouldWarn).toBe(false);
  });

  it("invalidates acknowledgment when routing intent fingerprint changes", async () => {
    const routingBoundary = createStageRuntimeRoutingBoundary();
    const driftBoundary = createRoutingDriftAcknowledgmentBoundary();

    const state: Record<string, unknown> = {};
    const stateStore = {
      get: <T>(key: string): T | undefined => state[key] as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        state[key] = value;
      },
    };

    const workflowV1 = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
    const runtimeProfiles = createMockRuntimeProfiles([
      { runtime: "local", readiness: "runtime-unavailable" },
      { runtime: "cloud", readiness: "ready" },
    ]);
    const modelV1 = routingBoundary.resolveWorkflowStageRoutings(workflowV1, runtimeProfiles);

    const initial = driftBoundary.evaluateRoutingDrift({
      taskPath: "feedback/tasks/planned/001-test.md",
      workflow: workflowV1,
      model: modelV1,
      stateStore,
      stateKey: "routing-drift-acks",
    });

    await driftBoundary.acknowledgeRoutingDrift({
      taskPath: initial.taskPath,
      fingerprint: initial.fingerprint,
      stateStore,
      stateKey: "routing-drift-acks",
    });

    const workflowV2 = createMockWorkflow([{ id: "implementation", runtimePreference: "local" }]);
    const modelV2 = routingBoundary.resolveWorkflowStageRoutings(workflowV2, runtimeProfiles);

    const afterIntentChange = driftBoundary.evaluateRoutingDrift({
      taskPath: "feedback/tasks/planned/001-test.md",
      workflow: workflowV2,
      model: modelV2,
      stateStore,
      stateKey: "routing-drift-acks",
    });

    expect(afterIntentChange.shouldWarn).toBe(true);
    expect(afterIntentChange.fingerprint).not.toBe(initial.fingerprint);
  });
});
