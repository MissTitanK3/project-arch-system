import { describe, expect, it } from "vitest";
import {
  buildCommandStagingActions,
  parseTaskContext,
  resolveTaskWorkflowContext,
  toCreateDiscoveredFromSelectedTaskMessage,
  toCreateLaneTaskMessage,
  toLaunchTaskMessage,
  toOpenArtifactInspectorMessage,
  toStageChatOpenMessage,
  toStageChatSendIntentMessage,
  toStagedRunCommandMessage,
  toUpdateWorkflowChecklistItemMessage,
} from "./experimentalArtifactBrowserActions";

describe("experimentalArtifactBrowserActions", () => {
  it("parses task context from canonical task markdown paths", () => {
    const context = parseTaskContext(
      "feedback/phases/phase-a/milestones/milestone-1/tasks/planned/002-action-parity.md",
    );

    expect(context).toEqual({
      phaseId: "phase-a",
      milestoneId: "milestone-1",
      lane: "planned",
      taskId: "002",
    });
  });

  it("returns undefined for non-task artifact paths", () => {
    const context = parseTaskContext("feedback/phases/phase-a/overview.md");

    expect(context).toBeUndefined();
  });

  it("builds staged command presets for task-scoped artifacts", () => {
    const actions = buildCommandStagingActions(
      "feedback/phases/phase-a/milestones/milestone-1/tasks/discovered/019-follow-up.md",
    );

    expect(actions.map((action) => action.id)).toEqual([
      "agent-orchestrate",
      "agent-run",
      "agent-status",
      "agent-validate",
      "agent-reconcile",
      "result-import",
    ]);
    expect(actions[0]?.command).toBe(
      "pa agent orchestrate phase-a/milestone-1/019 --runtime <runtime> --json --timeout-ms <ms>",
    );
    expect(actions[1]?.command).toBe(
      "pa agent run phase-a/milestone-1/019 --runtime <runtime> --json --timeout-ms <ms>",
    );
  });

  it("returns no command presets for non-task selections", () => {
    const actions = buildCommandStagingActions("feedback/phases/phase-a/overview.md");

    expect(actions).toEqual([]);
  });

  it("creates staged runCommand messages aligned with host semantics", () => {
    const message = toStagedRunCommandMessage({
      command: "pa agent status <runId> --json",
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
    });

    expect(message).toEqual({
      type: "runCommand",
      command: "pa agent status <runId> --json",
      execute: false,
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
    });
  });

  it("builds task workflow context with scoped task ref", () => {
    const context = resolveTaskWorkflowContext(
      "feedback/phases/phase-a/milestones/milestone-1/tasks/planned/002-action-parity.md",
    );

    expect(context?.taskRef).toBe("phase-a/milestone-1/002");
    expect(context?.taskContext.lane).toBe("planned");
  });

  it("builds inspector handoff messages", () => {
    const taskInspector = toOpenArtifactInspectorMessage({
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
      label: "002-action-parity.md",
    });
    const auditInspector = toOpenArtifactInspectorMessage({
      relativePath: ".project-arch/agent-runtime/logs/execution.jsonl",
      label: "execution.jsonl",
    });

    expect(taskInspector.type).toBe("openArtifactInspector");
    expect(taskInspector.kind).toBe("task");
    expect(auditInspector.kind).toBe("audit");
  });

  it("builds workflow-aware message payloads", () => {
    expect(
      toLaunchTaskMessage({
        taskRef: "phase-a/m-1/002",
        relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
      }),
    ).toEqual({
      type: "launchTask",
      taskRef: "phase-a/m-1/002",
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
    });

    expect(
      toCreateDiscoveredFromSelectedTaskMessage({
        phaseId: "phase-a",
        milestoneId: "m-1",
        fromTaskId: "002",
      }),
    ).toEqual({
      type: "createDiscoveredFromSelectedTask",
      phaseId: "phase-a",
      milestoneId: "m-1",
      fromTaskId: "002",
    });

    expect(
      toCreateLaneTaskMessage({
        phaseId: "phase-a",
        milestoneId: "m-1",
        lane: "planned",
        withSlug: true,
      }),
    ).toEqual({
      type: "createLaneTask",
      phaseId: "phase-a",
      milestoneId: "m-1",
      lane: "planned",
      withSlug: true,
    });

    expect(
      toUpdateWorkflowChecklistItemMessage({
        relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
        stageId: "implementation",
        itemId: "implement-slice",
        status: "done",
      }),
    ).toEqual({
      type: "updateWorkflowChecklistItem",
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
      stageId: "implementation",
      itemId: "implement-slice",
      status: "done",
    });
  });

  it("builds stage-chat command and send-intent messages", () => {
    expect(
      toStageChatOpenMessage({
        relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
        stageId: "validation",
        stageTitle: "Validation",
        runtime: "local",
      }),
    ).toEqual({
      type: "stageChatCommand",
      command: "projectArch.openStageChat",
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
      stageId: "validation",
      stageTitle: "Validation",
      runtime: "local",
      action: "open",
    });

    expect(
      toStageChatSendIntentMessage({
        relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
        stageId: "validation",
        stageTitle: "Validation",
        runtime: "local",
        messageText: "Review this stage.",
      }),
    ).toEqual({
      type: "stageChatSendIntent",
      relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-action-parity.md",
      stageId: "validation",
      stageTitle: "Validation",
      runtime: "local",
      messageText: "Review this stage.",
    });
  });
});
