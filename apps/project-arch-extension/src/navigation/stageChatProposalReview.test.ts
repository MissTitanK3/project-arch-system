import { describe, expect, it } from "vitest";
import {
  ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID,
  buildChecklistUpdateProposal,
  buildProposalSet,
  buildStatusUpdateProposal,
  buildTaskContentProposal,
  computeContentDiff,
  REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID,
  renderChecklistUpdateProposal,
  renderDiffLine,
  renderProposal,
  renderProposalSet,
  renderStatusUpdateProposal,
  renderTaskContentProposal,
  type StageChatChecklistItemChange,
  type StageChatChecklistUpdateProposal,
  type StageChatStatusUpdateProposal,
  type StageChatTaskContentProposal,
} from "./stageChatProposalReview";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const THREAD_KEY = "001::implementation";

const BEFORE_TEXT = `# Task 001

## Scope
Do the thing.

## Acceptance Checks
- [ ] Feature works.
`;

const AFTER_TEXT = `# Task 001

## Scope
Do the thing (revised).

## Acceptance Checks
- [ ] Feature works.
- [ ] Tests pass.
`;

function makeTaskContentProposal(
  overrides: Partial<StageChatTaskContentProposal> = {},
): StageChatTaskContentProposal {
  return {
    ...buildTaskContentProposal({
      id: "prop-001",
      threadKey: THREAD_KEY,
      label: "Suggested task update",
      artifactPath: "feedback/tasks/001-task.md",
      before: BEFORE_TEXT,
      after: AFTER_TEXT,
      rationale: "Adds a missing test acceptance check.",
      createdAt: "2026-04-06T10:00:00.000Z",
    }),
    ...overrides,
  };
}

function makeChecklistProposal(
  overrides: Partial<StageChatChecklistUpdateProposal> = {},
): StageChatChecklistUpdateProposal {
  const changes: StageChatChecklistItemChange[] = [
    { itemId: "check-1", itemLabel: "Feature works", beforeStatus: "planned", afterStatus: "done" },
    {
      itemId: "check-2",
      itemLabel: "Tests pass",
      beforeStatus: "planned",
      afterStatus: "in_progress",
    },
  ];

  return {
    ...buildChecklistUpdateProposal({
      id: "prop-002",
      threadKey: THREAD_KEY,
      label: "Mark checklist items complete",
      artifactPath: "feedback/tasks/001-task.md",
      changes,
      createdAt: "2026-04-06T10:00:00.000Z",
    }),
    ...overrides,
  };
}

function makeStatusProposal(
  overrides: Partial<StageChatStatusUpdateProposal> = {},
): StageChatStatusUpdateProposal {
  return {
    ...buildStatusUpdateProposal({
      id: "prop-003",
      threadKey: THREAD_KEY,
      label: "Mark task in-progress",
      artifactPath: "feedback/tasks/001-task.md",
      change: {
        beforeStatus: "planned",
        afterStatus: "in_progress",
        beforeLane: "planned",
        afterLane: "in-progress",
      },
      createdAt: "2026-04-06T10:00:00.000Z",
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeContentDiff
// ---------------------------------------------------------------------------

describe("computeContentDiff", () => {
  it("returns empty lines for identical before and after", () => {
    const diff = computeContentDiff("hello\nworld", "hello\nworld");

    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);
  });

  it("counts added lines correctly", () => {
    const diff = computeContentDiff("line1\nline2", "line1\nline2\nline3");

    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(0);
  });

  it("counts removed lines correctly", () => {
    const diff = computeContentDiff("line1\nline2\nline3", "line1\nline3");

    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(0);
  });

  it("handles completely different content", () => {
    const diff = computeContentDiff("foo", "bar");

    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(1);
  });

  it("handles empty before (pure addition)", () => {
    const diff = computeContentDiff("", "new line");

    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(0);
  });

  it("handles empty after (pure deletion)", () => {
    const diff = computeContentDiff("old line", "");

    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(0);
  });

  it("emits added, removed, and context lines with correct kinds", () => {
    const diff = computeContentDiff("a\nb\nc", "a\nB\nc");

    const kinds = diff.lines.map((l) => l.kind);
    expect(kinds).toContain("added");
    expect(kinds).toContain("removed");
    expect(kinds).toContain("context");
  });

  it("trims distant context lines to ellipsis sentinels", () => {
    const many = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const changed = many.replace("line10", "LINE10");
    const diff = computeContentDiff(many, changed, 2);

    const textValues = diff.lines.map((l) => l.text);
    expect(textValues).toContain("...");
  });

  it("preserves before and after text verbatim", () => {
    const diff = computeContentDiff(BEFORE_TEXT, AFTER_TEXT);

    expect(diff.beforeText).toBe(BEFORE_TEXT);
    expect(diff.afterText).toBe(AFTER_TEXT);
  });

  it("the real fixture has addedCount > 0", () => {
    const diff = computeContentDiff(BEFORE_TEXT, AFTER_TEXT);

    expect(diff.addedCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildTaskContentProposal
// ---------------------------------------------------------------------------

describe("buildTaskContentProposal", () => {
  it("sets kind to task-content", () => {
    expect(makeTaskContentProposal().kind).toBe("task-content");
  });

  it("defaults status to pending", () => {
    expect(makeTaskContentProposal().status).toBe("pending");
  });

  it("accepts explicit status", () => {
    const p = buildTaskContentProposal({
      id: "x",
      threadKey: THREAD_KEY,
      label: "label",
      artifactPath: "path",
      before: "a",
      after: "b",
      status: "accepted",
    });

    expect(p.status).toBe("accepted");
  });

  it("computes a diff automatically", () => {
    const p = makeTaskContentProposal();

    expect(p.diff.lines.length).toBeGreaterThan(0);
  });

  it("carries rationale when provided", () => {
    expect(makeTaskContentProposal().rationale).toBe("Adds a missing test acceptance check.");
  });
});

// ---------------------------------------------------------------------------
// buildChecklistUpdateProposal
// ---------------------------------------------------------------------------

describe("buildChecklistUpdateProposal", () => {
  it("sets kind to checklist-update", () => {
    expect(makeChecklistProposal().kind).toBe("checklist-update");
  });

  it("defaults status to pending", () => {
    expect(makeChecklistProposal().status).toBe("pending");
  });

  it("preserves all item changes", () => {
    expect(makeChecklistProposal().changes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildStatusUpdateProposal
// ---------------------------------------------------------------------------

describe("buildStatusUpdateProposal", () => {
  it("sets kind to status-update", () => {
    expect(makeStatusProposal().kind).toBe("status-update");
  });

  it("defaults status to pending", () => {
    expect(makeStatusProposal().status).toBe("pending");
  });

  it("carries lane change when provided", () => {
    const p = makeStatusProposal();

    expect(p.change.beforeLane).toBe("planned");
    expect(p.change.afterLane).toBe("in-progress");
  });
});

// ---------------------------------------------------------------------------
// buildProposalSet
// ---------------------------------------------------------------------------

describe("buildProposalSet", () => {
  it("counts pending, accepted, and rejected proposals", () => {
    const proposals = [
      makeTaskContentProposal({ status: "pending" }),
      makeChecklistProposal({ status: "accepted" }),
      makeStatusProposal({ status: "rejected" }),
    ];
    const set = buildProposalSet(THREAD_KEY, proposals);

    expect(set.pendingCount).toBe(1);
    expect(set.acceptedCount).toBe(1);
    expect(set.rejectedCount).toBe(1);
  });

  it("returns zero counts for empty proposal list", () => {
    const set = buildProposalSet(THREAD_KEY, []);

    expect(set.pendingCount).toBe(0);
    expect(set.acceptedCount).toBe(0);
    expect(set.rejectedCount).toBe(0);
    expect(set.proposals).toHaveLength(0);
  });

  it("preserves proposal order", () => {
    const p1 = makeTaskContentProposal({ id: "a" });
    const p2 = makeChecklistProposal({ id: "b" });
    const set = buildProposalSet(THREAD_KEY, [p1, p2]);

    expect(set.proposals[0].id).toBe("a");
    expect(set.proposals[1].id).toBe("b");
  });

  it("passes threadKey through", () => {
    const set = buildProposalSet(THREAD_KEY, []);

    expect(set.threadKey).toBe(THREAD_KEY);
  });
});

// ---------------------------------------------------------------------------
// renderDiffLine
// ---------------------------------------------------------------------------

describe("renderDiffLine", () => {
  it("renders added line with + sigil and diff-added class", () => {
    const html = renderDiffLine({ kind: "added", text: "new content" });

    expect(html).toContain("diff-added");
    expect(html).toContain("+");
    expect(html).toContain("new content");
  });

  it("renders removed line with - sigil and diff-removed class", () => {
    const html = renderDiffLine({ kind: "removed", text: "old content" });

    expect(html).toContain("diff-removed");
    expect(html).toContain("-");
    expect(html).toContain("old content");
  });

  it("renders context line with space sigil and diff-context class", () => {
    const html = renderDiffLine({ kind: "context", text: "unchanged" });

    expect(html).toContain("diff-context");
    expect(html).toContain("unchanged");
  });

  it("renders elided context sentinel with diff-elided class", () => {
    const html = renderDiffLine({ kind: "context", text: "..." });

    expect(html).toContain("diff-elided");
  });

  it("escapes HTML in line text", () => {
    const html = renderDiffLine({ kind: "added", text: "<script>alert(1)</script>" });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

// ---------------------------------------------------------------------------
// renderTaskContentProposal
// ---------------------------------------------------------------------------

describe("renderTaskContentProposal", () => {
  it("includes the proposal label", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toContain("Suggested task update");
  });

  it("includes the artifact path", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toContain("feedback/tasks/001-task.md");
  });

  it("includes the rationale when present", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toContain("Adds a missing test acceptance check.");
  });

  it("omits rationale section when absent", () => {
    const p = buildTaskContentProposal({
      id: "x",
      threadKey: THREAD_KEY,
      label: "L",
      artifactPath: "p",
      before: "a",
      after: "b",
    });
    const html = renderTaskContentProposal(p);

    expect(html).not.toContain("proposal-rationale");
  });

  it("includes a diff summary with +/- counts", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toMatch(/\+\d+\s*-\d+/);
  });

  it("includes accept and reject buttons for pending proposals", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(html).toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(html).toContain("Accept Proposal");
    expect(html).toContain("Reject Proposal");
  });

  it("shows Accepted badge for accepted proposals instead of controls", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal({ status: "accepted" }));

    expect(html).toContain("Accepted");
    expect(html).not.toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
  });

  it("shows Rejected badge for rejected proposals instead of controls", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal({ status: "rejected" }));

    expect(html).toContain("Rejected");
    expect(html).not.toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
  });

  it("includes proposal id and thread key as data attributes", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toContain('data-proposal-id="prop-001"');
    expect(html).toContain(`data-thread-key="${THREAD_KEY}"`);
  });

  it("carries data-kind='task-content'", () => {
    const html = renderTaskContentProposal(makeTaskContentProposal());

    expect(html).toContain('data-kind="task-content"');
  });
});

// ---------------------------------------------------------------------------
// renderChecklistUpdateProposal
// ---------------------------------------------------------------------------

describe("renderChecklistUpdateProposal", () => {
  it("includes the proposal label", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal());

    expect(html).toContain("Mark checklist items complete");
  });

  it("renders each checklist item with before and after status", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal());

    expect(html).toContain("Feature works");
    expect(html).toContain("planned");
    expect(html).toContain("done");
    expect(html).toContain("Tests pass");
    expect(html).toContain("in_progress");
  });

  it("includes a summary with item count", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal());

    expect(html).toContain("2 checklist updates proposed");
  });

  it("uses singular 'item' for a single change", () => {
    const p = buildChecklistUpdateProposal({
      id: "p",
      threadKey: THREAD_KEY,
      label: "L",
      artifactPath: "path",
      changes: [
        { itemId: "c1", itemLabel: "One item", beforeStatus: "planned", afterStatus: "done" },
      ],
    });
    const html = renderChecklistUpdateProposal(p);

    expect(html).toContain("1 checklist update proposed");
  });

  it("includes accept and reject buttons for pending proposals", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal());

    expect(html).toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(html).toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
  });

  it("carries data-kind='checklist-update'", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal());

    expect(html).toContain('data-kind="checklist-update"');
  });

  it("shows Accepted badge when proposal is accepted", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal({ status: "accepted" }));

    expect(html).toContain("Accepted");
    expect(html).not.toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
  });

  it("includes proposal id and thread key as data attributes", () => {
    const html = renderChecklistUpdateProposal(makeChecklistProposal());

    expect(html).toContain('data-proposal-id="prop-002"');
    expect(html).toContain(`data-thread-key="${THREAD_KEY}"`);
  });
});

// ---------------------------------------------------------------------------
// renderStatusUpdateProposal
// ---------------------------------------------------------------------------

describe("renderStatusUpdateProposal", () => {
  it("includes the proposal label", () => {
    const html = renderStatusUpdateProposal(makeStatusProposal());

    expect(html).toContain("Mark task in-progress");
  });

  it("renders before and after status", () => {
    const html = renderStatusUpdateProposal(makeStatusProposal());

    expect(html).toContain("planned");
    expect(html).toContain("in_progress");
  });

  it("renders lane change when present", () => {
    const html = renderStatusUpdateProposal(makeStatusProposal());

    expect(html).toContain("Lane");
    expect(html).toContain("in-progress");
  });

  it("omits lane row when no lane change is provided", () => {
    const p = buildStatusUpdateProposal({
      id: "p",
      threadKey: THREAD_KEY,
      label: "L",
      artifactPath: "path",
      change: { beforeStatus: "planned", afterStatus: "in_progress" },
    });
    const html = renderStatusUpdateProposal(p);

    expect(html).not.toContain("Lane");
  });

  it("includes accept and reject buttons for pending proposals", () => {
    const html = renderStatusUpdateProposal(makeStatusProposal());

    expect(html).toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(html).toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
  });

  it("carries data-kind='status-update'", () => {
    const html = renderStatusUpdateProposal(makeStatusProposal());

    expect(html).toContain('data-kind="status-update"');
  });

  it("shows Rejected badge when proposal is rejected", () => {
    const html = renderStatusUpdateProposal(makeStatusProposal({ status: "rejected" }));

    expect(html).toContain("Rejected");
    expect(html).not.toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
  });
});

// ---------------------------------------------------------------------------
// renderProposal (dispatcher)
// ---------------------------------------------------------------------------

describe("renderProposal", () => {
  it("dispatches task-content to task-content renderer", () => {
    const html = renderProposal(makeTaskContentProposal());

    expect(html).toContain('data-kind="task-content"');
    expect(html).toContain("diff-view");
  });

  it("dispatches checklist-update to checklist renderer", () => {
    const html = renderProposal(makeChecklistProposal());

    expect(html).toContain('data-kind="checklist-update"');
    expect(html).toContain("checklist-changes");
  });

  it("dispatches status-update to status renderer", () => {
    const html = renderProposal(makeStatusProposal());

    expect(html).toContain('data-kind="status-update"');
    expect(html).toContain("status-changes");
  });
});

// ---------------------------------------------------------------------------
// renderProposalSet
// ---------------------------------------------------------------------------

describe("renderProposalSet", () => {
  it("returns empty string when there are no proposals", () => {
    const set = buildProposalSet(THREAD_KEY, []);

    expect(renderProposalSet(set)).toBe("");
  });

  it("includes pending count in header", () => {
    const set = buildProposalSet(THREAD_KEY, [makeTaskContentProposal()]);
    const html = renderProposalSet(set);

    expect(html).toContain("1 pending");
  });

  it("includes accepted count in header when nonzero", () => {
    const set = buildProposalSet(THREAD_KEY, [makeTaskContentProposal({ status: "accepted" })]);
    const html = renderProposalSet(set);

    expect(html).toContain("1 accepted");
  });

  it("includes rejected count in header when nonzero", () => {
    const set = buildProposalSet(THREAD_KEY, [makeStatusProposal({ status: "rejected" })]);
    const html = renderProposalSet(set);

    expect(html).toContain("1 rejected");
  });

  it("omits zero-count labels from header", () => {
    const set = buildProposalSet(THREAD_KEY, [makeTaskContentProposal()]);
    const html = renderProposalSet(set);

    expect(html).not.toContain("accepted");
    expect(html).not.toContain("rejected");
  });

  it("renders all proposal cards", () => {
    const set = buildProposalSet(THREAD_KEY, [
      makeTaskContentProposal(),
      makeChecklistProposal(),
      makeStatusProposal(),
    ]);
    const html = renderProposalSet(set);

    expect(html).toContain('data-kind="task-content"');
    expect(html).toContain('data-kind="checklist-update"');
    expect(html).toContain('data-kind="status-update"');
  });

  it("wraps everything in proposal-set element with thread key", () => {
    const set = buildProposalSet(THREAD_KEY, [makeTaskContentProposal()]);
    const html = renderProposalSet(set);

    expect(html).toContain("proposal-set");
    expect(html).toContain(`data-thread-key="${THREAD_KEY}"`);
  });
});
