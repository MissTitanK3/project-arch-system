import { describe, expect, it } from "vitest";
import type { ArtifactBrowserModel } from "./types";
import {
  createInitialViewState,
  getActiveNode,
  getBreadcrumbPaths,
  openDirectory,
  openParentDirectory,
  selectWorkflowStage,
  setStageChatIntentDraft,
  selectFile,
} from "./experimentalArtifactBrowserNavigationState";

function createModel(): ArtifactBrowserModel {
  return {
    generatedAt: "2026-04-08T00:00:00.000Z",
    nodes: {
      "": {
        relativePath: "",
        label: "Repository",
        directories: [
          { relativePath: "feedback", label: "feedback" },
          { relativePath: "roadmap", label: "roadmap" },
        ],
        files: [],
      },
      feedback: {
        relativePath: "feedback",
        label: "feedback",
        parentRelativePath: "",
        directories: [{ relativePath: "feedback/phases", label: "phases" }],
        files: [
          {
            relativePath: "feedback/overview.md",
            label: "overview.md",
            isMarkdown: true,
            taskMetadata: {
              tags: [],
              dependsOn: [],
              blocks: [],
              workflowDetail: {
                overallState: "in_progress",
                stages: [
                  {
                    id: "implementation",
                    title: "Implementation",
                    state: "in_progress",
                    items: [
                      {
                        id: "implement-slice",
                        label: "Implement slice",
                        status: "in_progress",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
      "feedback/phases": {
        relativePath: "feedback/phases",
        label: "phases",
        parentRelativePath: "feedback",
        directories: [],
        files: [
          { relativePath: "feedback/phases/overview.md", label: "overview.md", isMarkdown: true },
        ],
      },
      roadmap: {
        relativePath: "roadmap",
        label: "roadmap",
        parentRelativePath: "",
        directories: [],
        files: [{ relativePath: "roadmap/plan.md", label: "plan.md", isMarkdown: true }],
      },
    },
  };
}

describe("experimentalArtifactBrowserNavigationState", () => {
  it("falls back to repository root for unknown initial directory", () => {
    const model = createModel();

    const state = createInitialViewState(model, { activeDirectoryPath: "missing/path" });

    expect(state).toEqual({ activeDirectoryPath: "" });
  });

  it("opens an existing directory and clears file selection", () => {
    const model = createModel();
    const initialState = createInitialViewState(model, {
      activeDirectoryPath: "feedback",
      selectedFilePath: "feedback/overview.md",
    });

    const state = openDirectory(model, initialState, "feedback/phases");

    expect(state).toEqual({ activeDirectoryPath: "feedback/phases" });
  });

  it("moves to parent directory for drill-out behavior", () => {
    const model = createModel();
    const initialState = createInitialViewState(model, { activeDirectoryPath: "feedback/phases" });

    const state = openParentDirectory(model, initialState);

    expect(state.activeDirectoryPath).toBe("feedback");
  });

  it("selects files only from the active directory", () => {
    const model = createModel();
    const initialState = createInitialViewState(model, { activeDirectoryPath: "feedback" });

    const selected = selectFile(model, initialState, "feedback/overview.md");
    const rejected = selectFile(model, initialState, "roadmap/plan.md");

    expect(selected.selectedFilePath).toBe("feedback/overview.md");
    expect(rejected).toEqual(initialState);
  });

  it("builds breadcrumb paths from root to active directory", () => {
    const model = createModel();

    const breadcrumbs = getBreadcrumbPaths(model, "feedback/phases");

    expect(breadcrumbs).toEqual(["", "feedback", "feedback/phases"]);
  });

  it("returns active node for rendering directory contents", () => {
    const model = createModel();
    const state = createInitialViewState(model, { activeDirectoryPath: "roadmap" });

    const node = getActiveNode(model, state);

    expect(node.relativePath).toBe("roadmap");
    expect(node.files.map((file) => file.relativePath)).toEqual(["roadmap/plan.md"]);
  });

  it("persists workflow stage selection when selected file exposes that stage", () => {
    const model = createModel();
    const base = createInitialViewState(model, {
      activeDirectoryPath: "feedback",
      selectedFilePath: "feedback/overview.md",
    });

    const selectedStage = selectWorkflowStage(model, base, "implementation");

    expect(selectedStage.selectedWorkflowStageId).toBe("implementation");
  });

  it("persists stage-chat intent draft across initial-state restoration", () => {
    const model = createModel();
    const base = createInitialViewState(model, {
      activeDirectoryPath: "feedback",
      selectedFilePath: "feedback/overview.md",
    });
    const withDraft = setStageChatIntentDraft(base, "Review the stage before coding.");

    const restored = createInitialViewState(model, withDraft);

    expect(restored.stageChatIntentDraft).toBe("Review the stage before coding.");
  });
});
