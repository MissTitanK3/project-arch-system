import { describe, expect, it } from "vitest";
import {
  artifactBrowserShellNavigationItems,
  createArtifactFileActionsGuidancePayload,
  createArtifactNavigationGuidancePayload,
  createArtifactBrowserShellSurfaceSlots,
  createArtifactBrowserSurfaceGuidancePayload,
  createArtifactStageChatGuidancePayload,
} from "./artifactBrowserShellConfig";
import { RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./surfaceMigrationBoundary";

describe("artifact browser shell config", () => {
  it("defines the migrated artifact browser as the primary shell surface", () => {
    expect(artifactBrowserShellNavigationItems[0]).toMatchObject({
      id: "artifacts",
      label: "Artifacts",
    });
    expect(artifactBrowserShellNavigationItems).toHaveLength(5);
  });

  it("creates generic shell guidance payloads from the active surface", () => {
    const payload = createArtifactBrowserSurfaceGuidancePayload(
      artifactBrowserShellNavigationItems[0],
    );

    expect(payload.id).toBe("surface-artifacts");
    expect(payload.title).toContain("Artifacts");
    expect(payload.items).toHaveLength(2);
  });

  it("creates per-surface shared guidance payloads for all migrated shell surfaces", () => {
    const byId = new Map(artifactBrowserShellNavigationItems.map((item) => [item.id, item]));

    const runsPayload = createArtifactBrowserSurfaceGuidancePayload(byId.get("runs"));
    const runtimesPayload = createArtifactBrowserSurfaceGuidancePayload(byId.get("runtimes"));
    const lifecyclePayload = createArtifactBrowserSurfaceGuidancePayload(byId.get("lifecycle"));
    const commandsPayload = createArtifactBrowserSurfaceGuidancePayload(byId.get("commands"));

    expect(runsPayload.title).toBe("Runs Guidance");
    expect(runtimesPayload.title).toBe("Runtimes Guidance");
    expect(lifecyclePayload.title).toBe("Lifecycle Guidance");
    expect(commandsPayload.title).toBe("Commands Guidance");

    expect(runsPayload.summary).toContain(RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH);
    expect(runtimesPayload.summary).toContain(RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH);
    expect(lifecyclePayload.summary).toContain(RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH);
    expect(commandsPayload.summary).toContain(RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH);
  });

  it("creates shell slots with the artifact surface as the real migrated pane", () => {
    const slots = createArtifactBrowserShellSurfaceSlots({
      artifactSurface: "artifact-surface",
      runsSurface: "runs-surface",
      runtimesSurface: "runtimes-surface",
      lifecycleSurface: "lifecycle-surface",
      commandsSurface: "commands-surface",
    });

    expect(slots.map((slot) => slot.id)).toEqual([
      "artifacts",
      "runs",
      "runtimes",
      "lifecycle",
      "commands",
    ]);
  });

  it("creates artifact-context guidance payloads for navigation, file actions, and stage chat", () => {
    const navigationPayload = createArtifactNavigationGuidancePayload({
      activeDirectoryPath: "feedback/phases/phase-a",
      breadcrumbCount: 3,
    });
    const fileActionsPayload = createArtifactFileActionsGuidancePayload({
      selectedFilePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/001-test.md",
      hasWorkflowContext: true,
      stagedCommandCount: 6,
    });
    const stageChatPayload = createArtifactStageChatGuidancePayload({
      selectedFilePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/001-test.md",
      stageId: "implementation",
      stageTitle: "Implementation",
    });

    expect(navigationPayload.id).toContain("artifacts-navigation");
    expect(fileActionsPayload.id).toContain("artifacts-file-actions");
    expect(stageChatPayload.id).toContain("artifacts-stage-chat");
    expect(fileActionsPayload.items.length).toBeGreaterThan(1);
    expect(stageChatPayload.items.length).toBeGreaterThan(1);
  });
});
