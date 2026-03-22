import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { writeJsonDeterministic } from "../../utils/fs";
import { checkDecisionCompleteness } from "./checkDecisionCompleteness";
import { TaskRecord } from "../../core/validation/tasks";
import { DecisionRecord } from "../../core/validation/decisions";

function taskRecord(decisions: string[]): TaskRecord {
  return {
    phaseId: "phase-1",
    milestoneId: "milestone-1",
    lane: "planned",
    filePath: "roadmap/phases/phase-1/milestones/milestone-1/tasks/planned/001-task.md",
    frontmatter: {
      schemaVersion: "1.0",
      id: "001",
      slug: "task",
      title: "Task",
      lane: "planned",
      status: "todo",
      createdAt: "2026-03-22",
      updatedAt: "2026-03-22",
      discoveredFromTask: null,
      tags: [],
      codeTargets: [],
      publicDocs: [],
      decisions,
      completionCriteria: [],
    },
  };
}

function decisionRecord(id: string): DecisionRecord {
  return {
    filePath: `roadmap/decisions/${id}.md`,
    frontmatter: {
      schemaVersion: "1.0",
      type: "decision",
      id,
      title: "Decision",
      status: "accepted",
      scope: { kind: "project" },
      drivers: [],
      decision: { summary: "summary" },
      alternatives: [],
      consequences: { positive: [], negative: [] },
      links: { tasks: [], codeTargets: [], publicDocs: [] },
    },
  };
}

describe("graph/drift/checkDecisionCompleteness", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "drift-decision-completeness-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("reports disconnected nodes, unresolved references, and threshold failures", async () => {
    await writeJsonDeterministic(path.join(tempDir, ".arch", "nodes", "decisions.json"), {
      decisions: [{ id: "project:20260322:d1" }, { id: "project:20260322:d2" }],
    });
    await writeJsonDeterministic(path.join(tempDir, ".arch", "nodes", "domains.json"), {
      domains: [{ name: "api" }, { name: "web" }],
    });
    await writeJsonDeterministic(path.join(tempDir, ".arch", "edges", "decision_to_domain.json"), {
      edges: [{ decision: "project:20260322:d1", domain: "api" }],
    });

    const result = await checkDecisionCompleteness(
      tempDir,
      [taskRecord(["project:20260322:d1", "project:20260322:missing"])],
      [decisionRecord("project:20260322:d1"), decisionRecord("project:20260322:d2")],
      80,
    );

    expect(result.summary.score).toBe(50);
    expect(result.summary.sufficient).toBe(false);
    expect(result.disconnected.decisionsWithoutDomain).toEqual(["project:20260322:d2"]);
    expect(result.disconnected.domainsWithoutDecisions).toEqual(["web"]);
    expect(result.disconnected.taskReferencesToMissingDecisions).toEqual([
      {
        task: "phase-1/milestone-1/001",
        decision: "project:20260322:missing",
      },
    ]);

    expect(result.findings.some((finding) => finding.code === "DECISION_DOMAIN_LINK_MISSING")).toBe(
      true,
    );
    expect(result.findings.some((finding) => finding.code === "TASK_DECISION_ID_UNRESOLVED")).toBe(
      true,
    );
    expect(
      result.findings.some((finding) => finding.code === "GRAPH_COMPLETENESS_BELOW_THRESHOLD"),
    ).toBe(true);
  });

  it("skips completeness checks when graph artifacts are missing", async () => {
    const result = await checkDecisionCompleteness(
      tempDir,
      [taskRecord([])],
      [decisionRecord("project:20260322:d1")],
      100,
    );

    expect(result.summary.sufficient).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].code).toBe("DECISION_COMPLETENESS_SKIPPED");
  });
});
