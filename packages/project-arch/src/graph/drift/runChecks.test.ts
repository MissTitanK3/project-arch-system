import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { writeJsonDeterministic } from "../../utils/fs";
import { writeFile } from "../../fs/writeFile";
import { runDriftChecks } from "./runChecks";
import { TaskRecord } from "../../core/validation/tasks";
import { DecisionRecord } from "../../core/validation/decisions";

function taskRecord(
  codeTargets: string[],
  tags: string[] = [],
  decisions: string[] = [],
): TaskRecord {
  return {
    projectId: "shared",
    phaseId: "phase-1",
    milestoneId: "milestone-1",
    lane: "planned",
    filePath: "roadmap/projects/shared/phases/phase-1/milestones/milestone-1/tasks/planned/001-task.md",
    frontmatter: {
      schemaVersion: "2.0",
      id: "001",
      slug: "task",
      title: "Task",
      lane: "planned",
      status: "todo",
      createdAt: "2026-03-07",
      updatedAt: "2026-03-07",
      discoveredFromTask: null,
      tags,
      codeTargets,
      publicDocs: [],
      decisions,
      completionCriteria: [],
    },
  };
}

function decisionRecord(codeTargets: string[]): DecisionRecord {
  return {
    filePath: "roadmap/decisions/test.md",
    frontmatter: {
      schemaVersion: "2.0",
      type: "decision",
      id: "project:20260307:test",
      title: "Decision",
      status: "accepted",
      scope: { kind: "project" },
      drivers: [],
      decision: { summary: "summary" },
      alternatives: [],
      consequences: { positive: [], negative: [] },
      links: { tasks: [], codeTargets, publicDocs: [] },
    },
  };
}

describe("graph/drift/runChecks", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "drift-run-checks-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("should aggregate findings from all drift checks", async () => {
    await writeFile(path.join(tempDir, "packages", "lib", "src", "index.ts"), "export {};\n");

    const result = await runDriftChecks({
      cwd: tempDir,
      taskRecords: [taskRecord([])],
      decisionRecords: [decisionRecord([])],
      completenessThreshold: 100,
    });
    const findings = result.findings;

    expect(findings.some((f) => f.code === "ARCH_MAP_MISSING")).toBe(true);
    expect(findings.some((f) => f.code === "ARCH_DOMAINS_MISSING")).toBe(true);
    expect(result.graphCompleteness.summary.totalDecisionNodes).toBeGreaterThanOrEqual(0);
  });

  it("should include layer violations from import checks", async () => {
    await writeFile(
      path.join(tempDir, "packages", "lib", "src", "layer.ts"),
      "import { x } from 'apps/web/lib/x';\nexport { x };\n",
    );
    await writeJsonDeterministic(path.join(tempDir, "arch-model", "modules.json"), { modules: [] });
    await writeJsonDeterministic(path.join(tempDir, "arch-domains", "domains.json"), {
      domains: [],
    });

    const result = await runDriftChecks({
      cwd: tempDir,
      taskRecords: [taskRecord(["packages/lib"])],
      decisionRecords: [decisionRecord(["packages/lib"])],
      completenessThreshold: 100,
    });
    const findings = result.findings;

    expect(findings.some((f) => f.code === "LAYER_VIOLATION")).toBe(true);
  });

  it("should return empty findings when everything is mapped and tracked", async () => {
    await writeFile(path.join(tempDir, "packages", "payments", "src", "index.ts"), "export {};\n");
    await writeJsonDeterministic(path.join(tempDir, "arch-model", "modules.json"), {
      modules: [{ name: "packages/payments" }],
    });
    await writeJsonDeterministic(path.join(tempDir, "arch-domains", "domains.json"), {
      domains: [{ name: "payments", ownedPackages: ["packages/payments"] }],
    });
    await writeJsonDeterministic(path.join(tempDir, ".arch", "nodes", "decisions.json"), {
      decisions: [{ id: "project:20260307:test" }],
    });
    await writeJsonDeterministic(path.join(tempDir, ".arch", "nodes", "domains.json"), {
      domains: [{ name: "payments" }],
    });
    await writeJsonDeterministic(path.join(tempDir, ".arch", "edges", "decision_to_domain.json"), {
      edges: [{ decision: "project:20260307:test", domain: "payments" }],
    });

    const decisionId = "project:20260307:test";

    const result = await runDriftChecks({
      cwd: tempDir,
      taskRecords: [taskRecord(["packages/payments"], ["domain:payments"], [decisionId])],
      decisionRecords: [decisionRecord(["packages/payments"])],
      completenessThreshold: 100,
    });
    const findings = result.findings;

    expect(findings).toEqual([]);
    expect(result.graphCompleteness.summary.sufficient).toBe(true);
  });
});
