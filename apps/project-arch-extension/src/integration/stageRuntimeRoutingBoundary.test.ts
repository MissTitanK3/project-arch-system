import { describe, expect, it } from "vitest";
import type {
  NormalizedTaskWorkflow,
  TaskWorkflowRuntimePreference,
} from "../navigation/taskWorkflowParser";
import type {
  RuntimeLaunchProfileOption,
  RuntimeProfileLaunchBoundaryModel,
} from "./runtimeProfileLaunchBoundary";
import { createStageRuntimeRoutingBoundary } from "./stageRuntimeRoutingBoundary";

describe("stageRuntimeRoutingBoundary", () => {
  const boundary = createStageRuntimeRoutingBoundary();

  function createMockWorkflow(
    stages: Array<{ id: string; runtimePreference: TaskWorkflowRuntimePreference }>,
  ): NormalizedTaskWorkflow {
    const mappedStages: NormalizedTaskWorkflow["workflow"]["stages"] = stages.map(
      (stage, index) => ({
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
      }),
    );

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

  describe("resolveWorkflowStageRoutings", () => {
    it("classifies deterministic stages as always compatible", () => {
      const workflow = createMockWorkflow([{ id: "stage-1", runtimePreference: "deterministic" }]);
      const profiles = createMockRuntimeProfiles([{ runtime: "local", readiness: "blocked" }]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings).toHaveLength(1);
      expect(result.stageRoutings[0].routingState).toBe("compatible");
      expect(result.stageRoutings[0].preferredKind).toBe("deterministic");
      expect(result.stageRoutings[0].availableAlternatives).toHaveLength(0);
    });

    it("classifies local-prefer stages as compatible when local is ready", () => {
      const workflow = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const profiles = createMockRuntimeProfiles([{ runtime: "local", readiness: "ready" }]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("compatible");
      expect(result.stageRoutings[0].preferredKind).toBe("local");
    });

    it("classifies local-prefer stages as compatible with hybrid ready", () => {
      const workflow = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "ready" },
        { runtime: "cloud", readiness: "ready" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("compatible");
      expect(result.stageRoutings[0].preferredKind).toBe("local");
    });

    it("classifies local-prefer stages as degraded when only cloud is ready", () => {
      const workflow = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "blocked" },
        { runtime: "cloud", readiness: "ready" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("degraded");
      expect(result.stageRoutings[0].preferredKind).toBe("local");
      expect(result.stageRoutings[0].availableAlternatives).toContain("cloud");
    });

    it("classifies local-prefer stages as blocked when no runtime is ready", () => {
      const workflow = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "blocked" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("blocked");
      expect(result.stageRoutings[0].preferredKind).toBe("local");
    });

    it("classifies cloud-prefer stages as compatible when cloud is ready", () => {
      const workflow = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
      const profiles = createMockRuntimeProfiles([{ runtime: "cloud", readiness: "ready" }]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("compatible");
      expect(result.stageRoutings[0].preferredKind).toBe("cloud");
    });

    it("classifies cloud-prefer stages as degraded when only local is ready", () => {
      const workflow = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "ready" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("degraded");
      expect(result.stageRoutings[0].preferredKind).toBe("cloud");
      expect(result.stageRoutings[0].availableAlternatives).toContain("local");
      expect(result.stageRoutings[0].validationReason).toBe("fallback-ready");
    });

    it("handles temporary unavailability with soft degraded fallback", () => {
      const workflow = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "runtime-unavailable" },
        { runtime: "cloud", readiness: "ready" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("degraded");
      expect(result.stageRoutings[0].validationReason).toBe("fallback-ready");
      expect(result.stageRoutings[0].diagnostics).toContain("temporarily unavailable");
      expect(result.stageRoutings[0].availableAlternatives).toContain("cloud");
    });

    it("blocks when no viable runtime path exists", () => {
      const workflow = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "cloud", readiness: "runtime-unavailable" },
        { runtime: "local", readiness: "disabled", enabled: false },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("blocked");
      expect(result.stageRoutings[0].validationReason).toBe("no-viable-path");
      expect(result.stageRoutings[0].diagnostics).toContain("no viable runtime path available");
    });

    it("classifies hybrid-prefer stages as compatible with any ready runtime", () => {
      const workflow = createMockWorkflow([{ id: "validation", runtimePreference: "hybrid" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "ready" },
        { runtime: "cloud", readiness: "ready" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("compatible");
      expect(result.stageRoutings[0].preferredKind).toBe("hybrid");
    });

    it("classifies hybrid-prefer stages as blocked when no runtime is ready", () => {
      const workflow = createMockWorkflow([{ id: "validation", runtimePreference: "hybrid" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "blocked" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].routingState).toBe("blocked");
      expect(result.stageRoutings[0].preferredKind).toBe("hybrid");
    });

    it("processes multiple stages with mixed routing states", () => {
      const workflow = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "implementation", runtimePreference: "cloud" },
        { id: "validation", runtimePreference: "local" },
      ]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "ready" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings).toHaveLength(3);
      expect(result.stageRoutings[0].routingState).toBe("compatible");
      expect(result.stageRoutings[1].routingState).toBe("degraded");
      expect(result.stageRoutings[2].routingState).toBe("compatible");
    });

    it("includes diagnostic messages for each stage", () => {
      const workflow = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const profiles = createMockRuntimeProfiles([{ runtime: "local", readiness: "ready" }]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].diagnostics).toContain("compatible");
      expect(result.stageRoutings[0].diagnostics).toContain("Stage 1");
    });

    it("generates degraded diagnostic when preferred runtime unavailable", () => {
      const workflow = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "ready" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].diagnostics).toContain("fallback local is ready");
    });

    it("generates blocked diagnostic when no runtime available", () => {
      const workflow = createMockWorkflow([{ id: "implementation", runtimePreference: "cloud" }]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "blocked" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const result = boundary.resolveWorkflowStageRoutings(workflow, profiles);

      expect(result.stageRoutings[0].diagnostics).toContain("no viable runtime path available");
    });
  });

  describe("computeWorkflowRoutingFingerprint", () => {
    it("produces deterministic fingerprint for same workflow", () => {
      const workflow = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "implementation", runtimePreference: "cloud" },
      ]);

      const fp1 = boundary.computeWorkflowRoutingFingerprint(workflow);
      const fp2 = boundary.computeWorkflowRoutingFingerprint(workflow);

      expect(fp1).toBe(fp2);
    });

    it("produces different fingerprints for different runtime preferences", () => {
      const workflow1 = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const workflow2 = createMockWorkflow([{ id: "context", runtimePreference: "cloud" }]);

      const fp1 = boundary.computeWorkflowRoutingFingerprint(workflow1);
      const fp2 = boundary.computeWorkflowRoutingFingerprint(workflow2);

      expect(fp1).not.toBe(fp2);
    });

    it("produces different fingerprints for different stage orders", () => {
      const workflow1 = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "implementation", runtimePreference: "cloud" },
      ]);
      const workflow2 = createMockWorkflow([
        { id: "implementation", runtimePreference: "cloud" },
        { id: "context", runtimePreference: "local" },
      ]);

      const fp1 = boundary.computeWorkflowRoutingFingerprint(workflow1);
      const fp2 = boundary.computeWorkflowRoutingFingerprint(workflow2);

      expect(fp1).not.toBe(fp2);
    });

    it("produces different fingerprints for different templates", () => {
      const workflow1 = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const workflow2: NormalizedTaskWorkflow = {
        ...workflow1,
        workflow: {
          ...workflow1.workflow,
          template: "validation-only",
        },
      };

      const fp1 = boundary.computeWorkflowRoutingFingerprint(workflow1);
      const fp2 = boundary.computeWorkflowRoutingFingerprint(workflow2);

      expect(fp1).not.toBe(fp2);
    });

    it("produces different fingerprints for different task types", () => {
      const workflow1 = createMockWorkflow([{ id: "context", runtimePreference: "local" }]);
      const workflow2: NormalizedTaskWorkflow = {
        ...workflow1,
        task: {
          ...workflow1.task,
          taskType: "validation",
        },
      };

      const fp1 = boundary.computeWorkflowRoutingFingerprint(workflow1);
      const fp2 = boundary.computeWorkflowRoutingFingerprint(workflow2);

      expect(fp1).not.toBe(fp2);
    });
  });

  describe("computeWorkflowRoutingReadiness", () => {
    it("returns 'ready' when all stages are compatible", () => {
      const workflow = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "validation", runtimePreference: "local" },
      ]);
      const profiles = createMockRuntimeProfiles([{ runtime: "local", readiness: "ready" }]);

      const model = boundary.resolveWorkflowStageRoutings(workflow, profiles);
      const readiness = boundary.computeWorkflowRoutingReadiness(model);

      expect(readiness).toBe("ready");
    });

    it("returns 'degraded' when any stage is degraded (and none blocked)", () => {
      const workflow = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "implementation", runtimePreference: "cloud" },
      ]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "ready" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const model = boundary.resolveWorkflowStageRoutings(workflow, profiles);
      const readiness = boundary.computeWorkflowRoutingReadiness(model);

      expect(readiness).toBe("degraded");
    });

    it("returns 'blocked' when any stage is blocked", () => {
      const workflow = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "implementation", runtimePreference: "cloud" },
      ]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "blocked" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const model = boundary.resolveWorkflowStageRoutings(workflow, profiles);
      const readiness = boundary.computeWorkflowRoutingReadiness(model);

      expect(readiness).toBe("blocked");
    });

    it("prioritizes 'blocked' over 'degraded'", () => {
      const workflow = createMockWorkflow([
        { id: "context", runtimePreference: "local" },
        { id: "implementation", runtimePreference: "cloud" },
        { id: "validation", runtimePreference: "cloud" },
      ]);
      const profiles = createMockRuntimeProfiles([
        { runtime: "local", readiness: "blocked" },
        { runtime: "cloud", readiness: "blocked" },
      ]);

      const model = boundary.resolveWorkflowStageRoutings(workflow, profiles);
      const readiness = boundary.computeWorkflowRoutingReadiness(model);

      expect(readiness).toBe("blocked");
    });
  });
});
