import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { Command } from "commander";
import { pathExists, readFile } from "fs-extra";
import { registerFeedbackCommand } from "./feedback";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { IssueStore } from "../../feedback/issue-store";
import { ObservationStore } from "../../feedback/observation-store";
import { FeedbackIssue } from "../../feedback/types";

function createIssue(overrides: Partial<FeedbackIssue> = {}): FeedbackIssue {
  return {
    id: "FB-AMB-001",
    title: "Ambiguity issue",
    status: "open",
    category: "ambiguity",
    severity: "high",
    confidence: "high",
    resolutionScope: "project-arch",
    firstSeenAt: "2026-03-01T10:00:00Z",
    lastSeenAt: "2026-03-09T15:30:00Z",
    occurrenceCount: 3,
    distinctDays: 4,
    affectedCommands: ["pa task create"],
    affectedAreas: ["roadmap"],
    rootCauseHypothesis: "Ambiguous naming",
    evidenceIds: ["obs-001", "obs-002"],
    summary: "Recurring ambiguity",
    recommendedActions: ["clarify-identifiers"],
    ...overrides,
  };
}

async function writeObservationDateFile(
  archDir: string,
  date: string,
  lines: Array<Record<string, unknown>>,
): Promise<void> {
  const filePath = path.join(archDir, "feedback", "observations", `${date}.jsonl`);
  const content = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
  await pathExists(path.dirname(filePath));
  await (await import("fs-extra")).ensureDir(path.dirname(filePath));
  await (await import("fs-extra")).writeFile(filePath, content, "utf8");
}

describe("cli/commands/feedback", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    context = await createTestProject(originalCwd);
  }, 120_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await context.cleanup();
    process.exitCode = undefined;
  }, 120_000);

  it("registers feedback command with list and show subcommands", () => {
    const program = new Command();
    registerFeedbackCommand(program);

    const feedback = program.commands.find((cmd) => cmd.name() === "feedback");
    expect(feedback).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "list")).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "show")).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "export")).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "prune")).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "rebuild")).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "refresh")).toBeDefined();
    expect(feedback?.commands.find((cmd) => cmd.name() === "review")).toBeDefined();
  });

  it("list returns open issues by default", async () => {
    const issueStore = new IssueStore(path.join(process.cwd(), ".arch"));
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-AMB-001", status: "open" }));
    await issueStore.saveIssue(createIssue({ id: "FB-OPT-001", status: "dismissed" }));

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "list"]);

    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output).toContain("FB-AMB-001");
    expect(output).not.toContain("FB-OPT-001");
  });

  it("list supports category, severity, repo-area, and resolution-scope filters", async () => {
    const issueStore = new IssueStore(path.join(process.cwd(), ".arch"));
    await issueStore.initialize();

    await issueStore.saveIssue(
      createIssue({
        id: "FB-AMB-001",
        category: "ambiguity",
        severity: "high",
        resolutionScope: "project-arch",
        affectedAreas: ["roadmap"],
      }),
    );

    await issueStore.saveIssue(
      createIssue({
        id: "FB-TRACE-001",
        category: "traceability-gap",
        severity: "medium",
        resolutionScope: "shared",
        affectedAreas: ["architecture"],
      }),
    );

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "feedback",
      "list",
      "--category",
      "ambiguity",
      "--severity",
      "high",
      "--repo-area",
      "roadmap",
      "--resolution-scope",
      "project-arch",
    ]);

    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output).toContain("FB-AMB-001");
    expect(output).not.toContain("FB-TRACE-001");
  });

  it("show prints full issue detail with recurrence, evidence, and actions", async () => {
    const issueStore = new IssueStore(path.join(process.cwd(), ".arch"));
    await issueStore.initialize();

    await issueStore.saveIssue(
      createIssue({
        id: "FB-AMB-002",
        occurrenceCount: 5,
        distinctDays: 3,
        evidenceIds: ["obs-001", "obs-002", "obs-003"],
        recommendedActions: ["clarify-identifiers", "update-schema"],
      }),
    );

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "show", "FB-AMB-002"]);

    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output).toContain("ID: FB-AMB-002");
    expect(output).toContain("Recurrence:");
    expect(output).toContain("Occurrences: 5");
    expect(output).toContain("Distinct Days: 3");
    expect(output).toContain("Evidence:");
    expect(output).toContain("Count: 3");
    expect(output).toContain("Recommended Actions:");
    expect(output).toContain("clarify-identifiers");
  });

  it("show sets non-zero exit when issue is not found", async () => {
    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "show", "FB-MISS-001"]);

    expect(errSpy).toHaveBeenCalledWith("Feedback issue not found: FB-MISS-001");
    expect(process.exitCode).toBe(1);
  });

  it("list output includes readable table headers", async () => {
    const issueStore = new IssueStore(path.join(process.cwd(), ".arch"));
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-AMB-010" }));

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "list"]);

    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output).toContain("ID");
    expect(output).toContain("Category");
    expect(output).toContain("Severity");
    expect(output).toContain("Occurrences");
  });

  it("review --dismiss requires confirmation", async () => {
    const issueStore = new IssueStore(path.join(process.cwd(), ".arch"));
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-AMB-200" }));

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "review", "FB-AMB-200", "--dismiss"]);

    expect(errSpy).toHaveBeenCalledWith("Confirmation required for --dismiss. Re-run with --yes.");
    expect(process.exitCode).toBe(1);
  });

  it("review --dismiss deletes issue and linked observations, writes audit, regenerates summary", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    const issueStore = new IssueStore(archDir);
    await issueStore.initialize();

    await issueStore.saveIssue(
      createIssue({ id: "FB-AMB-201", evidenceIds: ["obs-dismiss-1"], affectedAreas: ["roadmap"] }),
    );

    await writeObservationDateFile(archDir, "2026-03-09", [
      {
        id: "obs-dismiss-1",
        timestamp: "2026-03-09T10:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-1.md"],
        summary: "x",
        context: {},
      },
    ]);

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "feedback",
      "review",
      "FB-AMB-201",
      "--dismiss",
      "--yes",
    ]);

    expect(await issueStore.getIssue("FB-AMB-201")).toBeNull();

    const observationStore = new ObservationStore(archDir);
    await observationStore.initialize();
    const observations = await observationStore.readObservationsByDate("2026-03-09");
    expect(observations.map((obs) => obs.id)).not.toContain("obs-dismiss-1");

    const auditPath = path.join(archDir, "feedback", "reviews", "audit.jsonl");
    expect(await pathExists(auditPath)).toBe(true);
    const auditContent = await readFile(auditPath, "utf8");
    expect(auditContent).toContain("FB-AMB-201");
    expect(auditContent).toContain("dismiss");

    const summaryPath = path.join(process.cwd(), "architecture", "feedback", "open-feedback.md");
    expect(await pathExists(summaryPath)).toBe(true);
    const optimizationPath = path.join(
      process.cwd(),
      "architecture",
      "feedback",
      "optimization-candidates.md",
    );
    expect(await pathExists(optimizationPath)).toBe(true);
  });

  it("review --mitigated-locally deletes issue and linked observations", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    const issueStore = new IssueStore(archDir);
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-AMB-202", evidenceIds: ["obs-mit-1"] }));

    await writeObservationDateFile(archDir, "2026-03-09", [
      {
        id: "obs-mit-1",
        timestamp: "2026-03-09T10:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-1.md"],
        summary: "x",
        context: {},
      },
    ]);

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "feedback",
      "review",
      "FB-AMB-202",
      "--mitigated-locally",
      "--yes",
    ]);

    expect(await issueStore.getIssue("FB-AMB-202")).toBeNull();
  });

  it("review --defer keeps issue as deferred with minimal recent evidence", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    const issueStore = new IssueStore(archDir);
    await issueStore.initialize();

    await issueStore.saveIssue(
      createIssue({
        id: "FB-AMB-203",
        evidenceIds: ["obs-defer-new", "obs-defer-old"],
      }),
    );

    await writeObservationDateFile(archDir, "2026-03-09", [
      {
        id: "obs-defer-new",
        timestamp: new Date().toISOString(),
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-1.md"],
        summary: "x",
        context: {},
      },
    ]);

    await writeObservationDateFile(archDir, "2025-01-01", [
      {
        id: "obs-defer-old",
        timestamp: "2025-01-01T10:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-2.md"],
        summary: "x",
        context: {},
      },
    ]);

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    await program.parseAsync(["node", "test", "feedback", "review", "FB-AMB-203", "--defer"]);

    const deferred = await issueStore.getIssue("FB-AMB-203");
    expect(deferred?.status).toBe("deferred");
    expect(deferred?.evidenceIds).toContain("obs-defer-new");
    expect(deferred?.evidenceIds).not.toContain("obs-defer-old");
  });

  it("review --escalate creates export artifact before deletion", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    const issueStore = new IssueStore(archDir);
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-AMB-204", evidenceIds: [] }));

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "feedback",
      "review",
      "FB-AMB-204",
      "--escalate",
      "--yes",
    ]);

    expect(await issueStore.getIssue("FB-AMB-204")).toBeNull();

    const exportsDir = path.join(archDir, "feedback", "exports");
    expect(await pathExists(exportsDir)).toBe(true);
    const { readdir } = await import("fs-extra");
    const files = await readdir(exportsDir);
    expect(files.some((name) => name.startsWith("FB-AMB-204-"))).toBe(true);
  });

  it("export outputs markdown by default without mutating issue state", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    const issueStore = new IssueStore(archDir);
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-AMB-300" }));

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "export", "FB-AMB-300"]);

    const exportsDir = path.join(archDir, "feedback", "exports");
    const { readdir } = await import("fs-extra");
    const files = await readdir(exportsDir);
    const markdownFile = files.find(
      (name) => name.startsWith("FB-AMB-300-") && name.endsWith(".md"),
    );
    expect(markdownFile).toBeDefined();

    const persisted = await issueStore.getIssue("FB-AMB-300");
    expect(persisted).not.toBeNull();
    expect(logSpy).toHaveBeenCalled();
  });

  it("export promotes reconciliation feedbackCandidates into tooling-feedback reports", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await (await import("fs-extra")).ensureDir(reconcileDir);
    await (
      await import("fs-extra")
    ).writeJson(path.join(reconcileDir, "001-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-001-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "001",
      date: "2026-03-12",
      changedFiles: ["packages/project-arch/src/cli/commands/reconcile.ts"],
      affectedAreas: ["packages/project-arch/src/cli"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: ["Add pa status summary for outstanding tooling feedback"],
    });

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "export", "reconcile-001-2026-03-12"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Generated tooling-feedback reports: 1");

    const feedbackDir = path.join(process.cwd(), ".project-arch", "feedback");
    const files = await (await import("fs-extra")).readdir(feedbackDir);
    expect(
      files.some((name) => name.includes("tooling-feedback-001-01") && name.endsWith(".json")),
    ).toBe(true);
    expect(
      files.some((name) => name.includes("tooling-feedback-001-01") && name.endsWith(".md")),
    ).toBe(true);
  });

  it("export excludes sensitive changedFiles by default for reconciliation promotion", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await (await import("fs-extra")).ensureDir(reconcileDir);
    await (
      await import("fs-extra")
    ).writeJson(path.join(reconcileDir, "003-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-003-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "003",
      date: "2026-03-12",
      changedFiles: [
        "packages/project-arch/src/core/reconciliation/feedbackExport.ts",
        ".env",
        "secrets.txt",
      ],
      affectedAreas: ["packages/project-arch/src/core/reconciliation"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: ["Improve feedback export diagnostics"],
    });

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "export", "reconcile-003-2026-03-12"]);

    const feedbackDir = path.join(process.cwd(), ".project-arch", "feedback");
    const files = await (await import("fs-extra")).readdir(feedbackDir);
    const jsonName = files.find(
      (name) => name.includes("tooling-feedback-003-01") && name.endsWith(".json"),
    );
    expect(jsonName).toBeDefined();

    const payload = await (await import("fs-extra")).readJson(path.join(feedbackDir, jsonName!));
    expect(payload.changedFiles).toEqual([
      "packages/project-arch/src/core/reconciliation/feedbackExport.ts",
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Excluded sensitive changedFiles by default"),
    );
  });

  it("export includes sensitive changedFiles only with --allow-sensitive-paths", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await (await import("fs-extra")).ensureDir(reconcileDir);
    await (
      await import("fs-extra")
    ).writeJson(path.join(reconcileDir, "004-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-004-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "004",
      date: "2026-03-12",
      changedFiles: ["packages/project-arch/src/core/reconciliation/feedbackExport.ts", ".env"],
      affectedAreas: ["packages/project-arch/src/core/reconciliation"],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: ["Allow explicit unsafe inclusion"],
    });

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "feedback",
      "export",
      "reconcile-004-2026-03-12",
      "--allow-sensitive-paths",
    ]);

    const feedbackDir = path.join(process.cwd(), ".project-arch", "feedback");
    const files = await (await import("fs-extra")).readdir(feedbackDir);
    const jsonName = files.find(
      (name) => name.includes("tooling-feedback-004-01") && name.endsWith(".json"),
    );
    expect(jsonName).toBeDefined();

    const payload = await (await import("fs-extra")).readJson(path.join(feedbackDir, jsonName!));
    expect(payload.changedFiles).toEqual([
      "packages/project-arch/src/core/reconciliation/feedbackExport.ts",
      ".env",
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("export reports when reconciliation source has no feedbackCandidates", async () => {
    const reconcileDir = path.join(process.cwd(), ".project-arch", "reconcile");
    await (await import("fs-extra")).ensureDir(reconcileDir);
    await (
      await import("fs-extra")
    ).writeJson(path.join(reconcileDir, "002-2026-03-12.json"), {
      schemaVersion: "1.0",
      id: "reconcile-002-2026-03-12",
      type: "local-reconciliation",
      status: "reconciliation complete",
      taskId: "002",
      date: "2026-03-12",
      changedFiles: [],
      affectedAreas: [],
      missingUpdates: [],
      missingTraceLinks: [],
      decisionCandidates: [],
      standardsGaps: [],
      proposedActions: [],
      feedbackCandidates: [],
    });

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "export", "reconcile-002-2026-03-12"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("No feedbackCandidates found in reconciliation report.");
  });

  it("prune --dry-run reports deletions without removing retained files", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    await writeObservationDateFile(archDir, "2026-02-01", [
      {
        id: "obs-old-prune",
        timestamp: "2026-02-01T10:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-1.md"],
        summary: "x",
        context: {},
      },
    ]);

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "feedback", "prune", "--dry-run"]);

    const observationStore = new ObservationStore(archDir);
    await observationStore.initialize();
    const retained = await observationStore.readObservationsByDate("2026-02-01");
    expect(retained.map((obs) => obs.id)).toContain("obs-old-prune");

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("[dry-run] Observations removed:");
  });

  it("rebuild regenerates issue index from retained observations", async () => {
    const archDir = path.join(process.cwd(), ".arch");
    const issueStore = new IssueStore(archDir);
    await issueStore.initialize();
    await issueStore.saveIssue(createIssue({ id: "FB-OLD-001", evidenceIds: ["obs-unused"] }));

    await writeObservationDateFile(archDir, "2026-03-09", [
      {
        id: "obs-rebuild-1",
        timestamp: "2026-03-09T10:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-1.md"],
        summary: "x",
        context: {},
      },
      {
        id: "obs-rebuild-2",
        timestamp: "2026-03-09T11:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-2.md"],
        summary: "x",
        context: {},
      },
      {
        id: "obs-rebuild-3",
        timestamp: "2026-03-09T12:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-3.md"],
        summary: "x",
        context: {},
      },
    ]);

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    await program.parseAsync(["node", "test", "feedback", "rebuild"]);

    const rebuiltIssues = await issueStore.getAllIssues();
    expect(rebuiltIssues.some((issue) => issue.id === "FB-OLD-001")).toBe(false);
    expect(rebuiltIssues.length).toBeGreaterThan(0);

    const openReport = await readFile(
      path.join(process.cwd(), "architecture", "feedback", "open-feedback.md"),
      "utf8",
    );
    expect(openReport).toContain("## Issues by Severity");
    expect(openReport).toContain("Recurrence:");
  });

  it("refresh clears derived export state and rebuilds summaries", async () => {
    const archDir = path.join(process.cwd(), ".arch");

    await writeObservationDateFile(archDir, "2026-03-09", [
      {
        id: "obs-refresh-1",
        timestamp: "2026-03-09T10:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-1.md"],
        summary: "x",
        context: {},
      },
      {
        id: "obs-refresh-2",
        timestamp: "2026-03-09T11:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-2.md"],
        summary: "x",
        context: {},
      },
      {
        id: "obs-refresh-3",
        timestamp: "2026-03-09T12:00:00Z",
        command: "pa task create",
        source: "resolver",
        category: "ambiguity",
        kind: "multiple-candidates",
        severity: "high",
        confidence: "high",
        repoArea: "roadmap",
        paths: ["/roadmap/tasks/task-3.md"],
        summary: "x",
        context: {},
      },
    ]);

    const exportsDir = path.join(archDir, "feedback", "exports");
    await (await import("fs-extra")).ensureDir(exportsDir);
    await (await import("fs-extra")).writeFile(path.join(exportsDir, "stale.md"), "x", "utf8");

    const program = new Command();
    program.exitOverride();
    registerFeedbackCommand(program);

    await program.parseAsync(["node", "test", "feedback", "refresh"]);

    expect(await pathExists(path.join(exportsDir, "stale.md"))).toBe(false);
    const summaryPath = path.join(process.cwd(), "architecture", "feedback", "open-feedback.md");
    expect(await pathExists(summaryPath)).toBe(true);
    const optimizationPath = path.join(
      process.cwd(),
      "architecture",
      "feedback",
      "optimization-candidates.md",
    );
    expect(await pathExists(optimizationPath)).toBe(true);
  });
});
