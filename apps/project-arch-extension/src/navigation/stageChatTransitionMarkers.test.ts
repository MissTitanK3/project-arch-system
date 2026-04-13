import { describe, expect, it } from "vitest";
import {
  buildThreadTransitionView,
  buildTransitionMarker,
  formatRuntimeLabel,
  formatTransitionDirectionLabel,
  formatTransitionReasonLabel,
  renderThreadTransitionView,
  renderTransitionMarker,
  renderTransitionMarkerDefault,
  renderTransitionMarkerDiagnostics,
  type StageChatTransitionMarker,
} from "./stageChatTransitionMarkers";
import type { StageChatRuntimeHandoffRecord } from "../integration/stageChatSessionBoundary";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_SUMMARY = {
  stage: "Implementation (implementation)",
  currentGoal: "Finish the boundary layer",
  keyFacts: ["TypeScript target is ES2022", "Tests use Vitest"],
  decisionsMade: ["Use injectable state store"],
  openQuestions: ["Should escalation be automatic?"],
};

function makeHandoffRecord(
  overrides: Partial<StageChatRuntimeHandoffRecord> = {},
): StageChatRuntimeHandoffRecord {
  return {
    id: "001::implementation::handoff::local-to-cloud::1700000001000",
    threadKey: "001::implementation",
    direction: "local-to-cloud",
    fromRuntime: "local",
    toRuntime: "cloud",
    reason: "manual-escalation",
    createdAt: 1700000001000,
    summary: {
      ...BASE_SUMMARY,
      proposedNextSteps: ["Implement the handoff boundary"],
      pinnedNotes: ["Keep state extension-owned"],
      referencedArtifacts: ["src/integration/stageChatSessionBoundary.ts"],
    },
    summaryText: "## Runtime Handoff Summary\n- Stage: Implementation",
    ...overrides,
  };
}

function makeDeescalationRecord(
  overrides: Partial<StageChatRuntimeHandoffRecord> = {},
): StageChatRuntimeHandoffRecord {
  return makeHandoffRecord({
    id: "001::implementation::handoff::cloud-to-local::1700000002000",
    direction: "cloud-to-local",
    fromRuntime: "cloud",
    toRuntime: "local",
    reason: "manual-deescalation",
    createdAt: 1700000002000,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Label formatters
// ---------------------------------------------------------------------------

describe("formatTransitionDirectionLabel", () => {
  it("labels local-to-cloud as 'Switched to cloud'", () => {
    expect(formatTransitionDirectionLabel("local-to-cloud")).toBe("Switched to cloud");
  });

  it("labels cloud-to-local as 'Returned to local'", () => {
    expect(formatTransitionDirectionLabel("cloud-to-local")).toBe("Returned to local");
  });
});

describe("formatRuntimeLabel", () => {
  it("labels local as 'Local'", () => {
    expect(formatRuntimeLabel("local")).toBe("Local");
  });

  it("labels cloud as 'Cloud'", () => {
    expect(formatRuntimeLabel("cloud")).toBe("Cloud");
  });
});

describe("formatTransitionReasonLabel", () => {
  it("labels manual-escalation as 'Manual escalation'", () => {
    expect(formatTransitionReasonLabel("manual-escalation")).toBe("Manual escalation");
  });

  it("labels manual-deescalation as 'Manual de-escalation'", () => {
    expect(formatTransitionReasonLabel("manual-deescalation")).toBe("Manual de-escalation");
  });
});

// ---------------------------------------------------------------------------
// buildTransitionMarker
// ---------------------------------------------------------------------------

describe("buildTransitionMarker", () => {
  it("maps id and threadKey from the handoff record", () => {
    const record = makeHandoffRecord();
    const marker = buildTransitionMarker(record);

    expect(marker.id).toBe(record.id);
    expect(marker.threadKey).toBe(record.threadKey);
  });

  it("sets direction from the handoff record", () => {
    const escalation = buildTransitionMarker(makeHandoffRecord({ direction: "local-to-cloud" }));
    const deescalation = buildTransitionMarker(makeDeescalationRecord());

    expect(escalation.direction).toBe("local-to-cloud");
    expect(deescalation.direction).toBe("cloud-to-local");
  });

  it("populates defaultDetails with correct labels and runtime info", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());
    const d = marker.defaultDetails;

    expect(d.directionLabel).toBe("Switched to cloud");
    expect(d.fromRuntimeLabel).toBe("Local");
    expect(d.toRuntimeLabel).toBe("Cloud");
    expect(d.reasonLabel).toBe("Manual escalation");
  });

  it("defaultDetails.occurredAt is an ISO-8601 string derived from createdAt", () => {
    const record = makeHandoffRecord({ createdAt: 1700000001000 });
    const marker = buildTransitionMarker(record);

    expect(marker.defaultDetails.occurredAt).toBe(new Date(1700000001000).toISOString());
  });

  it("defaultDetails.currentGoal comes from summary.currentGoal", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.defaultDetails.currentGoal).toBe("Finish the boundary layer");
  });

  it("defaultDetails.openQuestionCount equals summary.openQuestions.length", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.defaultDetails.openQuestionCount).toBe(1);
  });

  it("defaultDetails.openQuestionCount is zero when openQuestions is empty", () => {
    const marker = buildTransitionMarker(
      makeHandoffRecord({ summary: { ...BASE_SUMMARY, openQuestions: [] } }),
    );

    expect(marker.defaultDetails.openQuestionCount).toBe(0);
  });

  it("diagnostics.keyFacts comes from summary.keyFacts", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.keyFacts).toEqual([
      "TypeScript target is ES2022",
      "Tests use Vitest",
    ]);
  });

  it("diagnostics.decisionsMade comes from summary.decisionsMade", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.decisionsMade).toEqual(["Use injectable state store"]);
  });

  it("diagnostics.openQuestions comes from summary.openQuestions", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.openQuestions).toEqual(["Should escalation be automatic?"]);
  });

  it("diagnostics.proposedNextSteps comes from summary.proposedNextSteps", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.proposedNextSteps).toEqual(["Implement the handoff boundary"]);
  });

  it("diagnostics.proposedNextSteps is empty array when summary has none", () => {
    const marker = buildTransitionMarker(makeHandoffRecord({ summary: { ...BASE_SUMMARY } }));

    expect(marker.diagnostics.proposedNextSteps).toEqual([]);
  });

  it("diagnostics.pinnedNotes comes from summary.pinnedNotes", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.pinnedNotes).toEqual(["Keep state extension-owned"]);
  });

  it("diagnostics.referencedArtifacts comes from summary.referencedArtifacts", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.referencedArtifacts).toEqual([
      "src/integration/stageChatSessionBoundary.ts",
    ]);
  });

  it("diagnostics.fullSummaryText comes from record.summaryText", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());

    expect(marker.diagnostics.fullSummaryText).toBe(
      "## Runtime Handoff Summary\n- Stage: Implementation",
    );
  });
});

// ---------------------------------------------------------------------------
// buildThreadTransitionView
// ---------------------------------------------------------------------------

describe("buildThreadTransitionView", () => {
  it("returns empty markers and zero count when records list is empty", () => {
    const view = buildThreadTransitionView("001::impl", []);

    expect(view.markers).toHaveLength(0);
    expect(view.transitionCount).toBe(0);
    expect(view.hasEscalations).toBe(false);
    expect(view.hasDeescalations).toBe(false);
  });

  it("produces one marker per record in order", () => {
    const records = [makeHandoffRecord(), makeDeescalationRecord()];
    const view = buildThreadTransitionView("001::implementation", records);

    expect(view.markers).toHaveLength(2);
    expect(view.markers[0].direction).toBe("local-to-cloud");
    expect(view.markers[1].direction).toBe("cloud-to-local");
  });

  it("transitionCount equals the number of records", () => {
    const view = buildThreadTransitionView("001::implementation", [
      makeHandoffRecord(),
      makeDeescalationRecord(),
    ]);

    expect(view.transitionCount).toBe(2);
  });

  it("hasEscalations is true when any marker is local-to-cloud", () => {
    const view = buildThreadTransitionView("001::implementation", [makeHandoffRecord()]);

    expect(view.hasEscalations).toBe(true);
    expect(view.hasDeescalations).toBe(false);
  });

  it("hasDeescalations is true when any marker is cloud-to-local", () => {
    const view = buildThreadTransitionView("001::implementation", [makeDeescalationRecord()]);

    expect(view.hasDeescalations).toBe(true);
    expect(view.hasEscalations).toBe(false);
  });

  it("both flags are true when both directions appear", () => {
    const view = buildThreadTransitionView("001::implementation", [
      makeHandoffRecord(),
      makeDeescalationRecord(),
    ]);

    expect(view.hasEscalations).toBe(true);
    expect(view.hasDeescalations).toBe(true);
  });

  it("threadKey is passed through to the view", () => {
    const view = buildThreadTransitionView("001::implementation", []);

    expect(view.threadKey).toBe("001::implementation");
  });
});

// ---------------------------------------------------------------------------
// renderTransitionMarkerDefault
// ---------------------------------------------------------------------------

describe("renderTransitionMarkerDefault", () => {
  function makeMarker(
    overrides: Partial<StageChatTransitionMarker> = {},
  ): StageChatTransitionMarker {
    return buildTransitionMarker({ ...makeHandoffRecord(), ...overrides });
  }

  it("contains the direction label", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain("Switched to cloud");
  });

  it("contains the runtime arrow", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain("Local");
    expect(html).toContain("Cloud");
    expect(html).toContain("→");
  });

  it("contains the reason label", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain("Manual escalation");
  });

  it("contains the current goal", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain("Finish the boundary layer");
  });

  it("shows open-question count when nonzero", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain("1 open question");
  });

  it("omits open-question hint when count is zero", () => {
    const record = makeHandoffRecord({ summary: { ...BASE_SUMMARY, openQuestions: [] } });
    const marker = buildTransitionMarker(record);
    const html = renderTransitionMarkerDefault(marker);

    expect(html).not.toContain("open question");
  });

  it("pluralises open questions correctly for more than one", () => {
    const record = makeHandoffRecord({
      summary: { ...BASE_SUMMARY, openQuestions: ["Q1?", "Q2?", "Q3?"] },
    });
    const html = renderTransitionMarkerDefault(buildTransitionMarker(record));

    expect(html).toContain("3 open questions");
  });

  it("has the expand-diagnostics affordance", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain('data-action="expand-diagnostics"');
    expect(html).toContain("Show diagnostics");
  });

  it("includes transition-escalation class for local-to-cloud", () => {
    const html = renderTransitionMarkerDefault(makeMarker());
    expect(html).toContain("transition-escalation");
  });

  it("includes transition-deescalation class for cloud-to-local", () => {
    const marker = buildTransitionMarker(makeDeescalationRecord());
    const html = renderTransitionMarkerDefault(marker);
    expect(html).toContain("transition-deescalation");
  });

  it("escapes HTML in goal text", () => {
    const record = makeHandoffRecord({
      summary: { ...BASE_SUMMARY, currentGoal: "<script>alert('x')</script>" },
    });
    const html = renderTransitionMarkerDefault(buildTransitionMarker(record));

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("includes marker id and thread key as data attributes", () => {
    const marker = makeMarker();
    const html = renderTransitionMarkerDefault(marker);

    expect(html).toContain(`data-marker-id="${marker.id}"`);
    expect(html).toContain(`data-thread-key="${marker.threadKey}"`);
  });
});

// ---------------------------------------------------------------------------
// renderTransitionMarkerDiagnostics
// ---------------------------------------------------------------------------

describe("renderTransitionMarkerDiagnostics", () => {
  it("renders key facts", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain("Key Facts");
    expect(html).toContain("TypeScript target is ES2022");
    expect(html).toContain("Tests use Vitest");
  });

  it("renders decisions made", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain("Decisions Made");
    expect(html).toContain("Use injectable state store");
  });

  it("renders open questions", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain("Open Questions");
    expect(html).toContain("Should escalation be automatic?");
  });

  it("renders proposed next steps when present", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain("Proposed Next Steps");
    expect(html).toContain("Implement the handoff boundary");
  });

  it("omits proposed next steps section when empty", () => {
    const marker = buildTransitionMarker(makeHandoffRecord({ summary: { ...BASE_SUMMARY } }));
    const html = renderTransitionMarkerDiagnostics(marker);

    expect(html).not.toContain("Proposed Next Steps");
  });

  it("renders pinned notes when present", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain("Pinned Notes");
    expect(html).toContain("Keep state extension-owned");
  });

  it("omits pinned notes section when empty", () => {
    const marker = buildTransitionMarker(makeHandoffRecord({ summary: { ...BASE_SUMMARY } }));
    const html = renderTransitionMarkerDiagnostics(marker);

    expect(html).not.toContain("Pinned Notes");
  });

  it("renders referenced artifacts when present", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain("Referenced Artifacts");
    expect(html).toContain("src/integration/stageChatSessionBoundary.ts");
  });

  it("omits referenced artifacts section when empty", () => {
    const marker = buildTransitionMarker(makeHandoffRecord({ summary: { ...BASE_SUMMARY } }));
    const html = renderTransitionMarkerDiagnostics(marker);

    expect(html).not.toContain("Referenced Artifacts");
  });

  it("shows 'None captured' when key facts are empty", () => {
    const record = makeHandoffRecord({ summary: { ...BASE_SUMMARY, keyFacts: [] } });
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(record));

    expect(html).toContain("None captured");
  });

  it("has the collapse-diagnostics affordance", () => {
    const html = renderTransitionMarkerDiagnostics(buildTransitionMarker(makeHandoffRecord()));

    expect(html).toContain('data-action="collapse-diagnostics"');
    expect(html).toContain("Hide diagnostics");
  });

  it("includes marker id as data attribute", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());
    const html = renderTransitionMarkerDiagnostics(marker);

    expect(html).toContain(`data-marker-id="${marker.id}"`);
  });
});

// ---------------------------------------------------------------------------
// renderTransitionMarker (combined)
// ---------------------------------------------------------------------------

describe("renderTransitionMarker", () => {
  it("contains both the default view and diagnostics panel", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());
    const html = renderTransitionMarker(marker);

    expect(html).toContain("expand-diagnostics");
    expect(html).toContain("collapse-diagnostics");
    expect(html).toContain("Switched to cloud");
    expect(html).toContain("Key Facts");
  });

  it("wraps both parts in a transition-marker-block element", () => {
    const marker = buildTransitionMarker(makeHandoffRecord());
    const html = renderTransitionMarker(marker);

    expect(html).toContain("transition-marker-block");
  });
});

// ---------------------------------------------------------------------------
// renderThreadTransitionView
// ---------------------------------------------------------------------------

describe("renderThreadTransitionView", () => {
  it("returns empty string when there are no transitions", () => {
    const view = buildThreadTransitionView("001::implementation", []);
    const html = renderThreadTransitionView(view);

    expect(html).toBe("");
  });

  it("renders a header with the transition count", () => {
    const view = buildThreadTransitionView("001::implementation", [makeHandoffRecord()]);
    const html = renderThreadTransitionView(view);

    expect(html).toContain("1 runtime transition");
  });

  it("pluralises 'transition' correctly for multiple transitions", () => {
    const view = buildThreadTransitionView("001::implementation", [
      makeHandoffRecord(),
      makeDeescalationRecord(),
    ]);
    const html = renderThreadTransitionView(view);

    expect(html).toContain("2 runtime transitions");
  });

  it("contains all marker blocks", () => {
    const view = buildThreadTransitionView("001::implementation", [
      makeHandoffRecord(),
      makeDeescalationRecord(),
    ]);
    const html = renderThreadTransitionView(view);

    expect(html).toContain("Switched to cloud");
    expect(html).toContain("Returned to local");
  });

  it("wraps everything in thread-transitions element with thread key", () => {
    const view = buildThreadTransitionView("001::implementation", [makeHandoffRecord()]);
    const html = renderThreadTransitionView(view);

    expect(html).toContain("thread-transitions");
    expect(html).toContain('data-thread-key="001::implementation"');
  });
});
