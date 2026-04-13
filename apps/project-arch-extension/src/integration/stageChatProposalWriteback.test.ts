import { describe, expect, it, vi } from "vitest";
import {
  buildChecklistUpdateProposal,
  buildStatusUpdateProposal,
  buildTaskContentProposal,
} from "../navigation/stageChatProposalReview";
import { createStageChatProposalWritebackBoundary } from "./stageChatProposalWriteback";

const WORKSPACE_ROOT = "/workspace/project";
const ARTIFACT_PATH = "feedback/tasks/001-task.md";
const ARTIFACT_ABSOLUTE_PATH = `${WORKSPACE_ROOT}/${ARTIFACT_PATH}`;

const TASK_DOC = `---
id: "001"
slug: "task"
title: "Task Title"
lane: planned
status: planned
workflow:
  schemaVersion: "2.0"
  template: implementation
  stages:
    - id: implementation
      title: "Implementation"
      runtimePreference: local
      items:
        - id: update-code
          label: "Update code"
          status: planned
        - id: run-tests
          label: "Run tests"
          status: planned
---

## Scope
Do work.

## Workflow Checklist (Mirrored)

### Implementation
- [ ] Update code
- [ ] Run tests
`;

function createMemoryFs(initialFiles: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(initialFiles));

  const readFile = vi.fn(async (absolutePath: string): Promise<string> => {
    const value = files.get(absolutePath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${absolutePath}`);
    }

    return value;
  });

  const writeFile = vi.fn(async (absolutePath: string, content: string): Promise<void> => {
    files.set(absolutePath, content);
  });

  return {
    readFile,
    writeFile,
    getFile: (absolutePath: string): string | undefined => files.get(absolutePath),
  };
}

describe("stageChatProposalWriteback", () => {
  it("reject action does not mutate canonical artifact", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-1",
      threadKey: "001::implementation",
      label: "Suggestion",
      artifactPath: ARTIFACT_PATH,
      before: TASK_DOC,
      after: `${TASK_DOC}\nExtra line`,
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "reject",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.proposalStatus).toBe("rejected");
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.getFile(ARTIFACT_ABSOLUTE_PATH)).toBe(TASK_DOC);
  });

  it("accept task-content writes proposal afterText to artifact", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const afterText = `${TASK_DOC}\n## Notes\nApplied from stage chat.`;
    const proposal = buildTaskContentProposal({
      id: "prop-2",
      threadKey: "001::implementation",
      label: "Rewrite task",
      artifactPath: ARTIFACT_PATH,
      before: TASK_DOC,
      after: afterText,
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(true);
    expect(result.proposalStatus).toBe("accepted");
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.getFile(ARTIFACT_ABSOLUTE_PATH)).toBe(afterText);
  });

  it("accept checklist-update updates targeted item statuses", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildChecklistUpdateProposal({
      id: "prop-3",
      threadKey: "001::implementation",
      label: "Checklist progression",
      artifactPath: ARTIFACT_PATH,
      changes: [
        {
          itemId: "update-code",
          itemLabel: "Update code",
          beforeStatus: "planned",
          afterStatus: "done",
        },
        {
          itemId: "run-tests",
          itemLabel: "Run tests",
          beforeStatus: "planned",
          afterStatus: "in_progress",
        },
      ],
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    const updated = fs.getFile(ARTIFACT_ABSOLUTE_PATH) ?? "";
    expect(result.mutatedCanonicalArtifact).toBe(true);
    expect(updated).toContain("id: update-code");
    expect(updated).toContain("status: done");
    expect(updated).toContain("id: run-tests");
    expect(updated).toContain("status: in_progress");
  });

  it("accept checklist-update is non-mutating when item does not exist", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildChecklistUpdateProposal({
      id: "prop-4",
      threadKey: "001::implementation",
      label: "Invalid item",
      artifactPath: ARTIFACT_PATH,
      changes: [
        {
          itemId: "missing-item",
          itemLabel: "Missing",
          beforeStatus: "planned",
          afterStatus: "done",
        },
      ],
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("missing-item");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("accept status-update mutates status and lane frontmatter scalars", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildStatusUpdateProposal({
      id: "prop-5",
      threadKey: "001::implementation",
      label: "Advance task",
      artifactPath: ARTIFACT_PATH,
      change: {
        beforeStatus: "planned",
        afterStatus: "in_progress",
        beforeLane: "planned",
        afterLane: "done",
      },
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    const updated = fs.getFile(ARTIFACT_ABSOLUTE_PATH) ?? "";
    expect(result.mutatedCanonicalArtifact).toBe(true);
    expect(updated).toContain("status: in_progress");
    expect(updated).toContain("lane: done");
  });

  it("accept status-update on malformed frontmatter is non-mutating", async () => {
    const malformed = `id: 001\nstatus: planned\n\nNo fences here`;
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: malformed });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildStatusUpdateProposal({
      id: "prop-6",
      threadKey: "001::implementation",
      label: "Status update",
      artifactPath: ARTIFACT_PATH,
      change: {
        beforeStatus: "planned",
        afterStatus: "done",
      },
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("malformed frontmatter");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("refuses writeback outside workspace root", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-7",
      threadKey: "001::implementation",
      label: "Path traversal",
      artifactPath: "../outside.md",
      before: "a",
      after: "b",
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("outside workspace root");
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("accept is non-mutating when target artifact cannot be read", async () => {
    const fs = createMemoryFs({});
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-8",
      threadKey: "001::implementation",
      label: "Missing file",
      artifactPath: ARTIFACT_PATH,
      before: "a",
      after: "b",
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("artifact could not be read");
  });

  it("accept is non-mutating when proposal afterText is empty", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-9",
      threadKey: "001::implementation",
      label: "Empty write",
      artifactPath: ARTIFACT_PATH,
      before: "A",
      after: "",
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("empty after-text");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("accept is blocked when proposal status is already rejected", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-10",
      threadKey: "001::implementation",
      label: "Already rejected",
      artifactPath: ARTIFACT_PATH,
      before: TASK_DOC,
      after: `${TASK_DOC}\nnoop`,
      status: "rejected",
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("already rejected");
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("accept is skipped when proposal status is already accepted", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-11",
      threadKey: "001::implementation",
      label: "Already accepted",
      artifactPath: ARTIFACT_PATH,
      before: TASK_DOC,
      after: `${TASK_DOC}\nnoop`,
      status: "accepted",
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("already accepted");
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("accept is non-mutating when proposal produces no content changes", async () => {
    const fs = createMemoryFs({ [ARTIFACT_ABSOLUTE_PATH]: TASK_DOC });
    const boundary = createStageChatProposalWritebackBoundary({
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    const proposal = buildTaskContentProposal({
      id: "prop-12",
      threadKey: "001::implementation",
      label: "No-op content",
      artifactPath: ARTIFACT_PATH,
      before: TASK_DOC,
      after: TASK_DOC,
    });

    const result = await boundary.executeProposalAction({
      workspaceRoot: WORKSPACE_ROOT,
      proposal,
      action: "accept",
    });

    expect(result.mutatedCanonicalArtifact).toBe(false);
    expect(result.message).toContain("no artifact changes were detected");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
