import { describe, expect, it } from "vitest";
import {
  buildStageChatTransferSummary,
  formatStageChatTransferSummary,
} from "./stageChatRuntimeHandoff";

describe("stageChatRuntimeHandoff", () => {
  it("builds structured summary with required fields and compact optional fields", () => {
    const summary = buildStageChatTransferSummary({
      direction: "local-to-cloud",
      seed: {
        threadContext: { taskId: "004", stageId: "implementation" },
        seedText: "seed",
        contextPackage: {
          task: {
            id: "004",
            title: "Task",
            status: "in-progress",
            taskType: "implementation",
          },
          stage: {
            id: "implementation",
            title: "Implementation",
            description: undefined,
            runtimePreference: "cloud",
            state: "in_progress",
            items: [],
          },
          bodySectionRef: undefined,
          codeTargets: ["src/a.ts", "src/a.ts", "src/b.ts"],
          evidencePaths: ["docs/evidence.md"],
          dependsOnTaskIds: [],
          blocksTaskIds: [],
          routingState: undefined,
        },
      },
      summarizedHistory: {
        recentTurns: [],
        summarizedHistory: [],
        restoredAttachments: [],
        lastUpdatedAt: 1700000000000,
        rollingSummary: {
          keyFacts: ["A", "A", "B", "C", "D", "E", "F"],
          decisions: ["D1", "D1", "D2"],
          nextSteps: ["N1", "N2", "N3", "N4", "N5", "N6"],
        },
      },
      openQuestions: ["Q1", "Q1", "Q2"],
      pinnedNotes: ["P1", "P2", "P2", "P3", "P4", "P5", "P6"],
      referencedArtifacts: ["src/a.ts", "README.md"],
    });

    expect(summary.stage).toContain("Implementation");
    expect(summary.currentGoal.length).toBeGreaterThan(0);
    expect(summary.keyFacts).toEqual(["A", "B", "C", "D", "E"]);
    expect(summary.decisionsMade).toEqual(["D1", "D2"]);
    expect(summary.openQuestions).toEqual(["Q1", "Q2"]);
    expect(summary.proposedNextSteps).toEqual(["N1", "N2", "N3", "N4", "N5"]);
    expect(summary.pinnedNotes).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(summary.referencedArtifacts).toEqual([
      "src/a.ts",
      "README.md",
      "src/b.ts",
      "docs/evidence.md",
    ]);
  });

  it("omits optional fields from formatted summary when empty", () => {
    const summary = buildStageChatTransferSummary({
      direction: "cloud-to-local",
      currentGoal: "Stabilize after escalation",
      openQuestions: [],
    });

    const text = formatStageChatTransferSummary(summary);
    expect(text).toContain("## Runtime Handoff Summary");
    expect(text).toContain("- Stage: Unknown stage");
    expect(text).toContain("- Current goal: Stabilize after escalation");
    expect(text).not.toContain("### Proposed Next Steps");
    expect(text).not.toContain("### Pinned Notes");
    expect(text).not.toContain("### Referenced Artifacts");
  });
});
