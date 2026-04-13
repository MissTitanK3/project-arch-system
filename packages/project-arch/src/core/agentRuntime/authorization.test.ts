import { describe, expect, it } from "vitest";
import type { TaskRecord } from "../validation/tasks";
import { resolveAgentWorkAuthorization } from "./authorization";

function makeTaskRecord(
  overrides: Partial<TaskRecord["frontmatter"]> = {},
  lane: TaskRecord["lane"] = "planned",
): TaskRecord {
  return {
    projectId: "shared",
    phaseId: "phase-agent-control-plane",
    milestoneId: "milestone-1-work-authorization-and-context-packaging",
    lane,
    filePath:
      "/repo/roadmap/projects/shared/phases/phase-agent-control-plane/milestones/milestone-1-work-authorization-and-context-packaging/tasks/planned/001-task.md",
    frontmatter: {
      schemaVersion: "2.0",
      id: "001",
      slug: "task",
      title: "Task",
      lane,
      status: "todo",
      createdAt: "2026-04-01",
      updatedAt: "2026-04-01",
      discoveredFromTask: lane === "discovered" ? "001" : null,
      tags: ["agent-runtime"],
      codeTargets: ["packages/project-arch/src/core/agentRuntime/prepare.ts"],
      publicDocs: [],
      decisions: [],
      completionCriteria: ["done"],
      ...overrides,
    },
  };
}

describe("core/agentRuntime/authorization", () => {
  it("authorizes planned tasks by default", () => {
    const decision = resolveAgentWorkAuthorization(makeTaskRecord());
    expect(decision.authorized).toBe(true);
    expect(decision.boundary).toBe("executable");
    expect(decision.requiresPromotion).toBe(false);
    expect(decision.source).toBe("task-frontmatter");
  });

  it("rejects discovered tasks unless explicitly promoted", () => {
    const denied = resolveAgentWorkAuthorization(makeTaskRecord({}, "discovered"));
    expect(denied.authorized).toBe(false);
    expect(denied.boundary).toBe("approval-required");
    expect(denied.requiresPromotion).toBe(true);
    expect(denied.reasonCode).toBe("task-discovered-requires-promotion");
    expect(denied.nextStep).toContain("agent.executable=true");

    const allowed = resolveAgentWorkAuthorization(
      makeTaskRecord({ agent: { executable: true } }, "discovered"),
    );
    expect(allowed.authorized).toBe(true);
    expect(allowed.boundary).toBe("executable");
  });

  it("treats discovered remediation tasks as approval-required until promoted", () => {
    const decision = resolveAgentWorkAuthorization(
      makeTaskRecord({ tags: ["agent-runtime", "remediation"] }, "discovered"),
    );

    expect(decision.authorized).toBe(false);
    expect(decision.boundary).toBe("approval-required");
    expect(decision.reasonCode).toBe("task-remediation-requires-promotion");
  });

  it("rejects backlog tasks", () => {
    const decision = resolveAgentWorkAuthorization(makeTaskRecord({}, "backlog"));
    expect(decision.authorized).toBe(false);
    expect(decision.boundary).toBe("ineligible");
    expect(decision.reasonCode).toBe("task-backlog");
  });

  it("rejects planned tasks explicitly disabled for execution", () => {
    const decision = resolveAgentWorkAuthorization(
      makeTaskRecord({ agent: { executable: false } }, "planned"),
    );
    expect(decision.authorized).toBe(false);
    expect(decision.boundary).toBe("ineligible");
    expect(decision.reasonCode).toBe("task-explicitly-disabled");
  });

  it("rejects done tasks and tasks without code targets", () => {
    const doneDecision = resolveAgentWorkAuthorization(makeTaskRecord({ status: "done" }));
    expect(doneDecision.authorized).toBe(false);
    expect(doneDecision.reasonCode).toBe("task-already-done");

    const noTargetsDecision = resolveAgentWorkAuthorization(makeTaskRecord({ codeTargets: [] }));
    expect(noTargetsDecision.authorized).toBe(false);
    expect(noTargetsDecision.reasonCode).toBe("task-missing-code-targets");
  });

  it("authorizes planned doc-only tasks when publicDocs are declared", () => {
    const decision = resolveAgentWorkAuthorization(
      makeTaskRecord({
        codeTargets: [],
        publicDocs: ["architecture/product-framing/project-overview.md"],
      }),
    );

    expect(decision.authorized).toBe(true);
    expect(decision.boundary).toBe("executable");
  });
});
