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
import {
  createStageChatSummarizedHistoryBoundary,
  type StageChatTurnRecord,
} from "./stageChatSummarizedHistoryBoundary";

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

function createWorkflowFixture(taskId: string): NormalizedTaskWorkflow {
  return {
    task: {
      id: taskId,
      slug: `milestone-4-e2e-${taskId}`,
      title: `Milestone 4 E2E ${taskId}`,
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
          description: "Validate stage-chat end-to-end flow",
          runtimePreference: "cloud",
          source: "frontmatter",
          state: "in_progress",
          items: [
            {
              id: "apply-writeback",
              label: "Apply accepted writeback",
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

function createTaskArtifactContent(taskId: string): string {
  return `---
id: "${taskId}"
slug: "milestone-4-e2e-${taskId}"
title: "Milestone 4 E2E ${taskId}"
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
        - id: apply-writeback
          label: "Apply accepted writeback"
          status: planned
---

## Scope
Validate milestone-4 end-to-end flow.

## Workflow Checklist (Mirrored)

### Implementation
- [ ] Apply accepted writeback
`;
}

function createTurns(count: number): StageChatTurnRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `turn-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text:
      index % 3 === 0
        ? `Decision: keep proposal boundary explicit ${index + 1}`
        : index % 3 === 1
          ? `Next step: preserve thread continuity ${index + 1}`
          : `Key fact: keep canonical writes user-approved ${index + 1}`,
    createdAt: 1700000000000 + index,
    estimatedTokens: 220,
  }));
}

describe("stageChatMilestone4EndToEndValidation", () => {
  it("validates a local-first path with session lifecycle, proposal review, and explicit writeback", async () => {
    const workspaceState = createWorkspaceStateStore();
    const boundary = resolveStageChatSessionBoundary({
      context: { workspaceState: workspaceState.store },
    });
    const summarizedHistory = createStageChatSummarizedHistoryBoundary({
      stateStore: workspaceState.store,
      summarizeAfterTurns: 10,
      retainRecentTurns: 10,
    });

    const workflow = createWorkflowFixture("401");
    const identity = { taskId: "401", stageId: "implementation" };

    const opened = await boundary.openOrResume({
      identity,
      runtimeClass: "local",
      backingSessionId: "local-401",
      now: 1700000000100,
      seedContext: {
        workflow,
        stageId: "implementation",
        codeTargets: ["apps/project-arch-extension/src/integration/"],
      },
    });

    const retained = await summarizedHistory.retainTurns({
      identity,
      turns: createTurns(14),
      now: 1700000000200,
    });

    const stageChatModel = buildStageChatWorkflowViewModel({
      taskId: "401",
      layer: { kind: "stage-chat", stageId: "implementation", stageTitle: "Implementation" },
      stages: [
        {
          id: "implementation",
          title: "Implementation",
          description: "Validate stage-chat end-to-end flow",
        },
      ],
      boundary,
      now: 1700000000300,
    });
    const stageChatHtml = renderStageChatWorkflowPanel(stageChatModel);

    const taskProposal = buildTaskContentProposal({
      id: "proposal-local-task",
      threadKey: opened.session.threadKey,
      label: "Append local validation note",
      artifactPath: "feedback/tasks/401.md",
      before: createTaskArtifactContent("401"),
      after: `${createTaskArtifactContent("401")}\n## Notes\n- Local-only flow validated.\n`,
    });
    const proposalSet = buildProposalSet(opened.session.threadKey, [taskProposal]);
    const proposalHtml = renderProposalSet(proposalSet);

    const workspaceRoot = "/workspace/repo";
    const absolutePath = `${workspaceRoot}/feedback/tasks/401.md`;
    const files = new Map<string, string>([[absolutePath, createTaskArtifactContent("401")]]);

    const writeback = createStageChatProposalWritebackBoundary({
      readFile: vi.fn(async (absolute) => {
        const content = files.get(absolute);
        if (!content) {
          throw new Error("ENOENT");
        }
        return content;
      }),
      writeFile: vi.fn(async (absolute, content) => {
        files.set(absolute, content);
      }),
    });

    const accepted = await writeback.executeProposalAction({
      workspaceRoot,
      proposal: taskProposal,
      action: "accept",
    });

    const closed = await boundary.discard({ identity });

    expect(opened.operation).toBe("opened");
    expect(opened.seedSource).toBe("created");
    expect(retained.summarized).toBe(true);
    expect(stageChatModel.surface?.sessionStatus).toBe("active");
    expect(stageChatHtml).toContain("Return to workflow");
    expect(proposalHtml).toContain(ACCEPT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(proposalHtml).toContain(REJECT_STAGE_CHAT_PROPOSAL_COMMAND_ID);
    expect(accepted.mutatedCanonicalArtifact).toBe(true);
    expect(files.get(absolutePath)).toContain("Local-only flow validated");
    expect(closed.removed).toBe(true);
  });

  it("validates a runtime-transition path with handoff markers, proposal review, and accepted/rejected writeback outcomes", async () => {
    const workspaceState = createWorkspaceStateStore();
    const boundary = resolveStageChatSessionBoundary({
      context: { workspaceState: workspaceState.store },
    });
    const summarizedHistory = createStageChatSummarizedHistoryBoundary({
      stateStore: workspaceState.store,
      summarizeAfterTurns: 12,
      retainRecentTurns: 10,
    });

    const workflow = createWorkflowFixture("402");
    const identity = { taskId: "402", stageId: "implementation" };

    const opened = await boundary.openOrResume({
      identity,
      runtimeClass: "local",
      backingSessionId: "local-402",
      now: 1700000001100,
      seedContext: {
        workflow,
        stageId: "implementation",
        codeTargets: ["apps/project-arch-extension/src/navigation/"],
      },
    });

    await summarizedHistory.retainTurns({
      identity,
      turns: createTurns(18),
      now: 1700000001200,
    });

    const escalated = await boundary.escalate({
      identity,
      backingSessionId: "cloud-402",
      now: 1700000001300,
      handoffContext: {
        currentGoal: "Use cloud reasoning for cross-artifact proposal decisions",
        openQuestions: ["Should status writes be rejected in this scenario?"],
      },
    });

    const deescalated = await boundary.deescalate({
      identity,
      backingSessionId: "local-402b",
      now: 1700000001400,
      handoffContext: {
        currentGoal: "Return to local after transfer summary",
      },
    });

    const handoffs = boundary.lookupHandoffs({ identity });
    const transitions = buildThreadTransitionView(handoffs.threadKey, handoffs.handoffs);
    const transitionsHtml = renderThreadTransitionView(transitions);

    const checklistProposal = buildChecklistUpdateProposal({
      id: "proposal-transition-checklist",
      threadKey: opened.session.threadKey,
      label: "Advance checklist item",
      artifactPath: "feedback/tasks/402.md",
      changes: [
        {
          itemId: "apply-writeback",
          itemLabel: "Apply accepted writeback",
          beforeStatus: "planned",
          afterStatus: "done",
        },
      ],
    });

    const statusProposal = buildStatusUpdateProposal({
      id: "proposal-transition-status",
      threadKey: opened.session.threadKey,
      label: "Move top-level status",
      artifactPath: "feedback/tasks/402.md",
      change: {
        beforeStatus: "planned",
        afterStatus: "done",
      },
    });

    const proposalSet = buildProposalSet(opened.session.threadKey, [
      checklistProposal,
      statusProposal,
    ]);
    const proposalHtml = renderProposalSet(proposalSet);

    const workspaceRoot = "/workspace/repo";
    const absolutePath = `${workspaceRoot}/feedback/tasks/402.md`;
    const files = new Map<string, string>([[absolutePath, createTaskArtifactContent("402")]]);

    const readFile = vi.fn(async (absolute: string) => {
      const content = files.get(absolute);
      if (!content) {
        throw new Error("ENOENT");
      }
      return content;
    });
    const writeFile = vi.fn(async (absolute: string, content: string) => {
      files.set(absolute, content);
    });

    const writeback = createStageChatProposalWritebackBoundary({ readFile, writeFile });

    const checklistAccepted = await writeback.executeProposalAction({
      workspaceRoot,
      proposal: checklistProposal,
      action: "accept",
    });
    const contentAfterChecklist = files.get(absolutePath) ?? "";

    const statusRejected = await writeback.executeProposalAction({
      workspaceRoot,
      proposal: statusProposal,
      action: "reject",
    });
    const contentAfterRejected = files.get(absolutePath) ?? "";

    expect(opened.operation).toBe("opened");
    expect(escalated.operation).toBe("escalated");
    expect(deescalated.operation).toBe("deescalated");
    expect(transitions.transitionCount).toBe(2);
    expect(transitions.hasEscalations).toBe(true);
    expect(transitions.hasDeescalations).toBe(true);
    expect(transitionsHtml).toContain("runtime transitions");
    expect(transitionsHtml).toContain("Show diagnostics");
    expect(proposalHtml).toContain('data-kind="checklist-update"');
    expect(proposalHtml).toContain('data-kind="status-update"');
    expect(checklistAccepted.mutatedCanonicalArtifact).toBe(true);
    expect(contentAfterChecklist).toContain("id: apply-writeback");
    expect(contentAfterChecklist).toContain("status: done");
    expect(statusRejected.mutatedCanonicalArtifact).toBe(false);
    expect(contentAfterRejected).toBe(contentAfterChecklist);
  });
});
