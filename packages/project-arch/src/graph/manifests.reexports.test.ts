import { describe, it, expect } from "vitest";
import * as manifestsApi from "./manifests";

describe("graph/manifests re-exports", () => {
  it("exports all expected manifest helpers", () => {
    expect(typeof manifestsApi.appendDecisionToIndex).toBe("function");
    expect(typeof manifestsApi.decisionMarkdownPath).toBe("function");
    expect(typeof manifestsApi.ensureDecisionIndex).toBe("function");
    expect(typeof manifestsApi.loadDecisionIndex).toBe("function");
    expect(typeof manifestsApi.loadMilestoneManifest).toBe("function");
    expect(typeof manifestsApi.loadPhaseManifest).toBe("function");
    expect(typeof manifestsApi.milestoneDecisionIndexDir).toBe("function");
    expect(typeof manifestsApi.milestoneOverviewPath).toBe("function");
    expect(typeof manifestsApi.phaseDecisionIndexDir).toBe("function");
    expect(typeof manifestsApi.phaseOverviewPath).toBe("function");
    expect(typeof manifestsApi.projectDecisionIndexDir).toBe("function");
    expect(typeof manifestsApi.rebuildArchitectureGraph).toBe("function");
    expect(typeof manifestsApi.saveMilestoneManifest).toBe("function");
    expect(typeof manifestsApi.savePhaseManifest).toBe("function");
  });

  it("exposes stable export keys", () => {
    const keys = Object.keys(manifestsApi);
    expect(keys).toEqual(
      expect.arrayContaining([
        "appendDecisionToIndex",
        "decisionMarkdownPath",
        "ensureDecisionIndex",
        "loadDecisionIndex",
        "loadMilestoneManifest",
        "loadPhaseManifest",
        "milestoneDecisionIndexDir",
        "milestoneOverviewPath",
        "phaseDecisionIndexDir",
        "phaseOverviewPath",
        "projectDecisionIndexDir",
        "rebuildArchitectureGraph",
        "saveMilestoneManifest",
        "savePhaseManifest",
      ]),
    );
  });
});
