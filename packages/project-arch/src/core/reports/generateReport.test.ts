import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { createTestProject, createTempDir, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, setDecisionStatus } from "../decisions/createDecision";
import { readMarkdownWithFrontmatter, writeJsonDeterministic } from "../../utils/fs";
import { writeFile } from "../../fs/writeFile";
import { generateReport } from "./generateReport";
import { loadPhaseManifest, savePhaseManifest } from "../../graph/manifests";

describe.sequential("core/reports/generateReport", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should render a metrics table", async () => {
    const report = await generateReport(tempDir);

    expect(report).toContain("Metric");
    expect(report).toContain("Value");
    expect(report).toContain("active phase");
    expect(report).toContain("tasks by status");
    expect(report).toContain("decisions by status");
    expect(report).toContain("docs coverage");
  }, 120_000);

  it("should include task and decision status counts", async () => {
    await createPhase("report-phase", tempDir);
    await createMilestone("report-phase", "report-milestone", tempDir);

    await createTask({
      phaseId: "report-phase",
      milestoneId: "report-milestone",
      lane: "planned",
      title: "Report Task",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const decisionPath = await createDecision(
      {
        scope: "milestone",
        phase: "report-phase",
        milestone: "report-milestone",
        title: "Report Decision",
      },
      tempDir,
    );

    const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );
    await setDecisionStatus(decisionDoc.data.id, "accepted", tempDir);

    const report = await generateReport(tempDir);

    expect(report).toContain("todo:");
    expect(report).toContain("accepted:");
  }, 120_000);

  it("should handle empty repository-like directory", async () => {
    const emptyContext = await createTempDir();

    try {
      const report = await generateReport(emptyContext.tempDir);
      expect(report).toContain("active phase");
      expect(report).toContain("none");
      expect(report).toContain("docs coverage");
      expect(report).toContain("0/0");
    } finally {
      await emptyContext.cleanup();
    }
  });

  it("should count docs coverage with existing and missing references", async () => {
    await createPhase("docs-phase", tempDir);
    await createMilestone("docs-phase", "docs-milestone", tempDir);

    const decisionPath = await createDecision(
      {
        scope: "milestone",
        phase: "docs-phase",
        milestone: "docs-milestone",
        title: "Docs Coverage Decision",
      },
      tempDir,
    );

    const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, decisionPath),
    );

    await setDecisionStatus(decisionDoc.data.id, "accepted", tempDir);

    await writeFile(path.join(tempDir, "docs", "exists.md"), "# Exists\n");

    const decisionFile = await readMarkdownWithFrontmatter<Record<string, unknown>>(
      path.join(tempDir, decisionPath),
    );
    const updatedFrontmatter = {
      ...decisionFile.data,
      links: {
        ...(decisionFile.data.links as Record<string, unknown>),
        publicDocs: ["docs/exists.md", "docs/missing.md"],
      },
    };

    await writeFile(
      path.join(tempDir, decisionPath),
      `---\n${Object.entries(updatedFrontmatter)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n---\n\n${decisionFile.content}`,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("docs coverage");
    expect(report).toContain("1/2");
  }, 120_000);

  it("should render sorted task and decision status buckets", async () => {
    await createPhase("sort-phase", tempDir);
    await createMilestone("sort-phase", "sort-milestone", tempDir);

    const taskPath = await createTask({
      phaseId: "sort-phase",
      milestoneId: "sort-milestone",
      lane: "planned",
      title: "Task For Sorting",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const taskDoc = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
    await writeFile(
      taskPath,
      `---\n${Object.entries({ ...taskDoc.data, status: "done" })
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n---\n\n${taskDoc.content}`,
    );

    const firstDecisionPath = await createDecision(
      {
        scope: "milestone",
        phase: "sort-phase",
        milestone: "sort-milestone",
        title: "Accepted Decision",
      },
      tempDir,
    );
    const firstDecisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(
      path.join(tempDir, firstDecisionPath),
    );
    await setDecisionStatus(firstDecisionDoc.data.id, "accepted", tempDir);

    await createDecision(
      {
        scope: "milestone",
        phase: "sort-phase",
        milestone: "sort-milestone",
        title: "Proposed Decision",
      },
      tempDir,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("tasks by status");
    expect(report).toContain("done:");
    expect(report).toContain("todo:");
    expect(report).toContain("accepted:");
    expect(report).toContain("proposed:");
  }, 120_000);

  it("should read active milestone from manifest", async () => {
    await createPhase("milestone-phase", tempDir);
    await createMilestone("milestone-phase", "milestone-1-foundation", tempDir);
    await createMilestone("milestone-phase", "milestone-2-build", tempDir);

    // Set both activePhase and activeMilestone in manifest
    const manifest = await loadPhaseManifest(tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "milestone-phase",
        activeMilestone: "milestone-2-build",
      },
      tempDir,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("milestone-phase");
    expect(report).toContain("milestone-2-build");
  }, 120_000);

  it("should emit consistency diagnostics when manifest activeMilestone mismatches filesystem", async () => {
    await createPhase("mismatch-phase", tempDir);
    await createMilestone("mismatch-phase", "milestone-first", tempDir);
    await createMilestone("mismatch-phase", "milestone-second", tempDir);

    // Set activePhase and activeMilestone in manifest
    const manifest = await loadPhaseManifest(tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "mismatch-phase",
        activeMilestone: "milestone-second",
      },
      tempDir,
    );

    const report = await generateReport(tempDir);

    // The report should reflect manifest state
    expect(report).toContain("milestone-second");

    // The report should include consistency checks section showing the mismatch
    // (first milestone found on filesystem vs second in manifest)
    expect(report).toContain("Consistency Checks");
    expect(report).toContain("activeMilestone");
    expect(report).toContain("filesystem");
    expect(report).toContain("roadmap/phases/mismatch-phase/milestones/*");
  }, 120_000);

  it("should emit consistency diagnostics when manifest activePhase mismatches filesystem", async () => {
    await createPhase("phase-a", tempDir);
    await createPhase("phase-z", tempDir);

    const manifest = await loadPhaseManifest(tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: "phase-z",
        activeMilestone: null,
      },
      tempDir,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("active phase");
    expect(report).toContain("phase-z");
    expect(report).toContain("Consistency Checks");
    expect(report).toContain("activePhase");
    expect(report).toContain("roadmap/phases/*");
  }, 120_000);

  it("should handle no active phase with manifest activeMilestone as none", async () => {
    const manifest = await loadPhaseManifest(tempDir);
    await savePhaseManifest(
      {
        ...manifest,
        activePhase: null,
        activeMilestone: null,
      },
      tempDir,
    );

    const report = await generateReport(tempDir);

    expect(report).toContain("none");
    expect(report).toContain("active phase");
    expect(report).toContain("active milestone");
  }, 120_000);

  it("should include discovered ratio percentage in report", async () => {
    await createPhase("ratio-phase", tempDir);
    await createMilestone("ratio-phase", "ratio-milestone", tempDir);

    await createTask({
      phaseId: "ratio-phase",
      milestoneId: "ratio-milestone",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    await createTask({
      phaseId: "ratio-phase",
      milestoneId: "ratio-milestone",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });

    const report = await generateReport(tempDir);

    expect(report).toContain("discovered ratio");
    expect(report).toMatch(/discovered ratio\s+\|\s+\d+(?:\.\d+)?% \(threshold 40%\)/);
    expect(report).toContain("threshold 40%");
  }, 120_000);

  it("should emit governance warning when discovered ratio exceeds threshold", async () => {
    await createPhase("warn-phase", tempDir);
    await createMilestone("warn-phase", "warn-milestone", tempDir);

    await createTask({
      phaseId: "warn-phase",
      milestoneId: "warn-milestone",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    for (let i = 0; i < 8; i++) {
      await createTask({
        phaseId: "warn-phase",
        milestoneId: "warn-milestone",
        lane: "discovered",
        discoveredFromTask: "001",
        title: `Discovered ${i}`,
        cwd: tempDir,
      });
    }

    const report = await generateReport(tempDir);

    expect(report).toContain("Planning Governance Warnings");
    expect(report).toContain("exceeds threshold");
  }, 120_000);

  it("should honor configurable discovered-load threshold", async () => {
    await createPhase("threshold-phase", tempDir);
    await createMilestone("threshold-phase", "threshold-milestone", tempDir);

    await writeJsonDeterministic(path.join(tempDir, "roadmap", "governance.json"), {
      discoveredLoadThresholdPercent: 60,
    });

    await createTask({
      phaseId: "threshold-phase",
      milestoneId: "threshold-milestone",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    await createTask({
      phaseId: "threshold-phase",
      milestoneId: "threshold-milestone",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });

    const report = await generateReport(tempDir);

    expect(report).toContain("threshold 60%");
    expect(report).not.toContain("Planning Governance Warnings");
  }, 120_000);

  describe("provenance and diagnostics", () => {
    it("should include provenance annotations for all metrics", async () => {
      const report = await generateReport(tempDir);

      expect(report).toContain("[source: roadmap/manifest.json]");
      expect(report).toContain("[source: roadmap/phases/*/milestones/*/tasks/**/*.md]");
      expect(report).toContain("[source: roadmap task frontmatter]");
      expect(report).toContain("[source: calculated]");
      expect(report).toContain("[source: roadmap/decisions/**/*.md]");
      expect(report).toContain("[source: task/decision publicDocs fields]");
    }, 120_000);

    it("should include graph sync status with timestamp when graph exists", async () => {
      await createPhase("sync-phase", tempDir);
      await createMilestone("sync-phase", "sync-milestone", tempDir);

      await createTask({
        phaseId: "sync-phase",
        milestoneId: "sync-milestone",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const report = await generateReport(tempDir);

      expect(report).toContain("graph sync status");
      expect(report).toContain("last sync:");
    }, 120_000);

    it("should show graph not synced when graph file is missing", async () => {
      const emptyContext = await createTempDir();

      try {
        const report = await generateReport(emptyContext.tempDir);

        expect(report).toContain("graph sync status");
        expect(report).toContain("(graph not synced)");
      } finally {
        await emptyContext.cleanup();
      }
    }, 120_000);

    it("should include parity check summary with PASS status", async () => {
      await createPhase("parity-phase", tempDir);
      await createMilestone("parity-phase", "parity-milestone", tempDir);

      await createTask({
        phaseId: "parity-phase",
        milestoneId: "parity-milestone",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const report = await generateReport(tempDir);

      expect(report).toContain("Roadmap-Graph Parity Check");
      expect(report).toContain("Status: ✓ PASS");
      expect(report).toContain("Tasks checked:");
      expect(report).toContain("Status mismatches: 0");
    }, 120_000);

    it("should include parity check summary with FAIL status when mismatches exist", async () => {
      await createPhase("fail-phase", tempDir);
      await createMilestone("fail-phase", "fail-milestone", tempDir);

      await createTask({
        phaseId: "fail-phase",
        milestoneId: "fail-milestone",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Manually corrupt the graph to create a mismatch
      const graphTasksPath = path.join(tempDir, ".arch", "nodes", "tasks.json");

      // Read graph tasks file properly
      const fs = await import("fs-extra");
      if (await fs.pathExists(graphTasksPath)) {
        const graphData = await fs.readJson(graphTasksPath);
        if (graphData.tasks && graphData.tasks.length > 0) {
          graphData.tasks[0].status = "done"; // Mismatch: roadmap has "todo", graph has "done"
          await fs.writeJson(graphTasksPath, graphData);
        }
      }

      const report = await generateReport(tempDir);

      expect(report).toContain("Roadmap-Graph Parity Check");
      expect(report).toContain("Status: ✗ FAIL");
      expect(report).toContain("Status mismatches:");
    }, 120_000);

    it("should not include inconsistency table in non-verbose mode", async () => {
      await createPhase("concise-phase", tempDir);
      await createMilestone("concise-phase", "concise-milestone", tempDir);

      await createTask({
        phaseId: "concise-phase",
        milestoneId: "concise-milestone",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const report = await generateReport(tempDir, { verbose: false });

      expect(report).not.toContain("Status Inconsistencies Detected");
      expect(report).not.toContain("Roadmap Status");
      expect(report).not.toContain("Graph Status");
    }, 120_000);

    it("should include full inconsistency table in verbose mode", async () => {
      await createPhase("verbose-phase", tempDir);
      await createMilestone("verbose-phase", "verbose-milestone", tempDir);

      await createTask({
        phaseId: "verbose-phase",
        milestoneId: "verbose-milestone",
        lane: "planned",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Create a mismatch by modifying graph directly
      const fs = await import("fs-extra");
      const graphTasksPath = path.join(tempDir, ".arch", "nodes", "tasks.json");
      if (await fs.pathExists(graphTasksPath)) {
        const graphData = await fs.readJson(graphTasksPath);

        // Find the verbose-phase task and change its status
        const verboseTask = graphData.tasks.find((t: { id: string }) =>
          t.id.startsWith("verbose-phase/verbose-milestone/"),
        );

        if (verboseTask) {
          verboseTask.status = "done"; // Roadmap has "todo", graph has "done"
          await fs.writeJson(graphTasksPath, graphData);
        }
      }

      const report = await generateReport(tempDir, { verbose: true });

      expect(report).toContain("Status Inconsistencies Detected");
      expect(report).toContain("Task ID");
      expect(report).toContain("Roadmap Status");
      expect(report).toContain("Graph Status");
      expect(report).toContain("File Path");
      expect(report).toContain("verbose-phase/verbose-milestone");
      expect(report).toContain("todo");
      expect(report).toContain("done");
    }, 120_000);

    it("should show empty parity check when graph not built", async () => {
      const emptyContext = await createTempDir();

      try {
        const report = await generateReport(emptyContext.tempDir);

        expect(report).toContain("Roadmap-Graph Parity Check");
        expect(report).toContain("Tasks checked: 0");
        expect(report).toContain("Status mismatches: 0");
      } finally {
        await emptyContext.cleanup();
      }
    }, 120_000);
  });
});
