import { describe, expect, it, vi } from "vitest";
import { resolveStageChatSessionBoundary } from "../navigation/stageChatSessionAccess";
import type { NormalizedTaskWorkflow } from "../navigation/taskWorkflowParser";
import {
  ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID,
  REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID,
  buildChecklistUpdateProposal,
  buildProposalSet,
  buildStatusUpdateProposal,
  buildTaskContentProposal,
  renderProposalSet,
} from "../navigation/stageChatProposalReview";
import {
  buildThreadTransitionView,
  renderThreadTransitionView,
} from "../navigation/stageChatTransitionMarkers";
import {
  buildStageChatWorkflowViewModel,
  renderStageChatWorkflowPanel,
} from "../navigation/stageChatWorkflowView";
import { createStageChatProposalWritebackBoundary } from "./stageChatProposalWriteback";

function createWorkspaceStateStore() {
  const values: Record<string, unknown> = {};
  return {
    values,
    store: {
      get: <T>(key: string): T | undefined => values[key] as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        values[key] = value;
      },
    },
  };
}

function createWorkflowFixture(): NormalizedTaskWorkflow {
  return {
    task: {
      id: "005",
      slug: "milestone-3-slice",
      title: "Milestone 3 Slice",
      lane: "planned",
      status: "in-progress",
      taskType: "implementation",
    },
    workflow: {
      schemaVersion: "2.0",
      template: "default-implementation",
      sources: {
        authoritativeWorkflow: "frontmatter",
        authoritativeCompletion: "frontmatter",
        supportingMarkdownMirror: "present",
        supportingSections: [],
      },
      stages: [
        {
          id: "implementation",
          title: "Implementation",
          description: "Implement stage-chat milestone 3 behavior",
          runtimePreference: "cloud",
          source: "frontmatter",
          state: "in_progress",
          items: [
            {
              id: "proposal-writeback",
              label: "Wire accepted proposals to explicit writeback",
              status: "planned",
              runtimePreference: "cloud",
              source: "frontmatter",
              evidencePaths: ["apps/project-arch-extension/src/integration/"],
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
        },
      ],
      summary: {
        totalStages: 1,
        notStartedStages: 0,
        inProgressStages: 1,
        completedStages: 0,
        blockedStages: 0,
        overallState: "in_progress",
        items: {
          total: 1,
          planned: 1,
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

function createTaskArtifactContent(): string {
  return `---
id: "005"
slug: "milestone-3-slice"
title: "Milestone 3 Slice"
lane: planned
status: planned
workflow:
  schemaVersion: "2.0"
  template: default-implementation
  stages:
    - id: implementation
      title: "Implementation"
      runtimePreference: cloud
      items:
        - id: proposal-writeback
          label: "Wire accepted proposals to explicit writeback"
          status: planned
---

## Scope
Ship milestone-3 stage-chat UX and writeback slice.

## Workflow Checklist (Mirrored)

### Implementation
- [ ] Wire accepted proposals to explicit writeback
`;
}

describe("stageChatMilestone3SliceAlignment", () => {
  it("keeps milestone-3 UX, transition details, proposal review, and explicit writeback coherent", async () => {
    const workspaceState = createWorkspaceStateStore();
    const boundary = resolveStageChatSessionBoundary({
      context: { workspaceState: workspaceState.store },
    });

    const workflow = createWorkflowFixture();
    const identity = { taskId: "005", stageId: "implementation" };

    const opened = await boundary.openOrResume({
      identity,
      runtimeClass: "local",
      backingSessionId: "local-1",
      now: 1700000000000,
      seedContext: {
        workflow,
        stageId: "implementation",
        codeTargets: ["apps/project-arch-extension/src/integration/"],
      },
    });

    const escalated = await boundary.escalate({
      identity,
      backingSessionId: "cloud-1",
      now: 1700000000500,
      handoffContext: {
        currentGoal: "Use cloud reasoning for proposal review decisions",
        openQuestions: ["Should checklist and status proposals share one writeback boundary?"],
      },
    });

    const deescalated = await boundary.deescalate({
      identity,
      backingSessionId: "local-2",
      now: 1700000001000,
      handoffContext: {
        currentGoal: "Return to local runtime after handoff summary is captured",
      },
    });

    const handoffsLookup = boundary.lookupHandoffs({ identity });
    const transitionView = buildThreadTransitionView(
      handoffsLookup.threadKey,
      handoffsLookup.handoffs,
    );
    const transitionHtml = renderThreadTransitionView(transitionView);

    const stageChatViewModel = buildStageChatWorkflowViewModel({
      taskId: "005",
      layer: {
        kind: "stage-chat",
        stageId: "implementation",
        stageTitle: "Implementation",
      },
      stages: [
        {
          id: "implementation",
          title: "Implementation",
          description: "Implement stage-chat milestone 3 behavior",
        },
      ],
      boundary,
      now: 1700000001500,
    });
    const stageChatHtml = renderStageChatWorkflowPanel(stageChatViewModel);

    const taskContentProposal = buildTaskContentProposal({
      id: "proposal-task-content",
      threadKey: opened.session.threadKey,
      label: "Suggested task body update",
      artifactPath: "feedback/tasks/005.md",
      before: createTaskArtifactContent(),
      after: `${createTaskArtifactContent()}\n## Notes\n- Proposal review completed with explicit writeback controls.\n`,
      rationale: "Capture explicit writeback expectation in task notes.",
    });

    const checklistProposal = buildChecklistUpdateProposal({
      id: "proposal-checklist",
      threadKey: opened.session.threadKey,
      label: "Mark checklist item in progress",
      artifactPath: "feedback/tasks/005.md",
      changes: [
        {
          itemId: "proposal-writeback",
          itemLabel: "Wire accepted proposals to explicit writeback",
          beforeStatus: "planned",
          afterStatus: "in_progress",
        },
      ],
    });

    const statusProposal = buildStatusUpdateProposal({
      id: "proposal-status",
      threadKey: opened.session.threadKey,
      label: "Advance top-level task status",
      artifactPath: "feedback/tasks/005.md",
      change: {
        beforeStatus: "planned",
        afterStatus: "done",
      },
    });

    const proposalSet = buildProposalSet(opened.session.threadKey, [
      taskContentProposal,
      checklistProposal,
      statusProposal,
    ]);
    const proposalHtml = renderProposalSet(proposalSet);

    const workspaceRoot = "/workspace/repo";
    const absoluteArtifactPath = `${workspaceRoot}/feedback/tasks/005.md`;
    const files = new Map<string, string>([[absoluteArtifactPath, createTaskArtifactContent()]]);

    const readFile = vi.fn(async (absolutePath: string) => {
      const content = files.get(absolutePath);
      if (!content) {
        throw new Error("ENOENT");
      }
      return content;
    });
    const writeFile = vi.fn(async (absolutePath: string, content: string) => {
      files.set(absolutePath, content);
    });

    const writeback = createStageChatProposalWritebackBoundary({ readFile, writeFile });

    const checklistAccepted = await writeback.executeProposalAction({
      workspaceRoot,
      proposal: checklistProposal,
      action: "accept",
    });
    const contentAfterChecklist = files.get(absoluteArtifactPath) ?? "";

    const taskContentAccepted = await writeback.executeProposalAction({
      workspaceRoot,
      proposal: buildTaskContentProposal({
        id: "proposal-task-content-accept",
        threadKey: opened.session.threadKey,
        label: "Append stage note",
        artifactPath: "feedback/tasks/005.md",
        before: contentAfterChecklist,
        after: `${contentAfterChecklist}\n## Stage Notes\n- Accepted proposal writeback executed.\n`,
      }),
      action: "accept",
    });
    const contentAfterTaskWrite = files.get(absoluteArtifactPath) ?? "";

    const statusRejected = await writeback.executeProposalAction({
      workspaceRoot,
      proposal: statusProposal,
      action: "reject",
    });
    const contentAfterRejectedStatus = files.get(absoluteArtifactPath) ?? "";

    expect(opened.operation).toBe("opened");
    expect(escalated.operation).toBe("escalated");
    expect(deescalated.operation).toBe("deescalated");

    expect(transitionView.transitionCount).toBe(2);
    expect(transitionView.hasEscalations).toBe(true);
    expect(transitionView.hasDeescalations).toBe(true);
    expect(transitionHtml).toContain("runtime transitions");
    expect(transitionHtml).toContain("Show diagnostics");

    expect(stageChatViewModel.surface?.sessionStatus).toBe("active");
    expect(stageChatHtml).toContain("Return to workflow");
    expect(stageChatHtml).toContain("Implementation");

    expect(proposalSet.pendingCount).toBe(3);
    expect(proposalHtml).toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(proposalHtml).toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(proposalHtml).toContain('data-kind="task-content"');
    expect(proposalHtml).toContain('data-kind="checklist-update"');
    expect(proposalHtml).toContain('data-kind="status-update"');

    expect(checklistAccepted.mutatedCanonicalArtifact).toBe(true);
    expect(contentAfterChecklist).toContain("id: proposal-writeback");
    expect(contentAfterChecklist).toContain("status: in_progress");

    expect(taskContentAccepted.mutatedCanonicalArtifact).toBe(true);
    expect(contentAfterTaskWrite).toContain("## Stage Notes");

    expect(statusRejected.mutatedCanonicalArtifact).toBe(false);
    expect(statusRejected.proposalStatus).toBe("rejected");
    expect(contentAfterRejectedStatus).toBe(contentAfterTaskWrite);
  });
});
