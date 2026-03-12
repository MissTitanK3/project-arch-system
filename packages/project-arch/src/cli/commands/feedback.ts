import path from "path";
import { appendFile, ensureDir, rm } from "fs-extra";
import { Command } from "commander";
import { IssueStore } from "../../feedback/issue-store";
import { ObservationStore } from "../../feedback/observation-store";
import { DEFAULT_FEEDBACK_CONFIG } from "../../feedback/types";
import { FeedbackIssue, FeedbackObservation } from "../../feedback/types";
import { FeedbackPruner } from "../../feedback/prune";
import { FeedbackPromoter } from "../../feedback/promoter";
import { writeFeedbackExportArtifact, type FeedbackExportFormat } from "../../feedback/exporter";
import { writeFeedbackReports } from "../../feedback/report-writer";
import { exportToolingFeedbackFromReconciliation } from "../../core/reconciliation/feedbackExport";
import { formatEnhancedHelp } from "../help/format";

type FeedbackListOptions = {
  category?: string;
  severity?: string;
  repoArea?: string;
  resolutionScope?: string;
};

type FeedbackReviewOptions = {
  dismiss?: boolean;
  mitigatedLocally?: boolean;
  defer?: boolean;
  escalate?: boolean;
  yes?: boolean;
};

type FeedbackExportOptions = {
  format?: FeedbackExportFormat;
};

type FeedbackPruneOptions = {
  dryRun?: boolean;
};

type FeedbackReviewOutcome = "dismiss" | "mitigated-locally" | "defer" | "escalate";

function formatDate(iso: string): string {
  return iso.split("T")[0] ?? iso;
}

function formatTable(issues: FeedbackIssue[]): string {
  const headers = ["ID", "Category", "Severity", "Scope", "Occurrences", "Last Seen", "Title"];

  const rows = issues.map((issue) => [
    issue.id,
    issue.category,
    issue.severity,
    issue.resolutionScope,
    String(issue.occurrenceCount),
    formatDate(issue.lastSeenAt),
    issue.title,
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );

  const formatRow = (values: string[]) =>
    values
      .map((value, index) => value.padEnd(widths[index]))
      .join("  ")
      .trimEnd();

  const separator = widths.map((width) => "-".repeat(width)).join("  ");

  return [formatRow(headers), separator, ...rows.map(formatRow)].join("\n");
}

function applyListFilters(issues: FeedbackIssue[], options: FeedbackListOptions): FeedbackIssue[] {
  return issues.filter((issue) => {
    if (options.category && issue.category !== options.category) {
      return false;
    }

    if (options.severity && issue.severity !== options.severity) {
      return false;
    }

    if (options.repoArea && !issue.affectedAreas.includes(options.repoArea)) {
      return false;
    }

    if (options.resolutionScope && issue.resolutionScope !== options.resolutionScope) {
      return false;
    }

    return true;
  });
}

function formatIssueDetails(issue: FeedbackIssue): string {
  const lines: string[] = [];

  lines.push(`ID: ${issue.id}`);
  lines.push(`Title: ${issue.title}`);
  lines.push(`Status: ${issue.status}`);
  lines.push(`Category: ${issue.category}`);
  lines.push(`Severity: ${issue.severity}`);
  lines.push(`Confidence: ${issue.confidence}`);
  lines.push(`Resolution Scope: ${issue.resolutionScope}`);
  lines.push("");

  lines.push("Recurrence:");
  lines.push(`- Occurrences: ${issue.occurrenceCount}`);
  lines.push(`- Distinct Days: ${issue.distinctDays}`);
  lines.push(`- First Seen: ${issue.firstSeenAt}`);
  lines.push(`- Last Seen: ${issue.lastSeenAt}`);
  lines.push("");

  lines.push("Evidence:");
  lines.push(`- Count: ${issue.evidenceIds.length}`);
  for (const evidenceId of issue.evidenceIds) {
    lines.push(`- ${evidenceId}`);
  }
  lines.push("");

  lines.push("Affected Commands:");
  for (const command of issue.affectedCommands) {
    lines.push(`- ${command}`);
  }
  lines.push("");

  lines.push("Affected Areas:");
  for (const area of issue.affectedAreas) {
    lines.push(`- ${area}`);
  }
  lines.push("");

  lines.push("Summary:");
  lines.push(issue.summary);
  lines.push("");

  lines.push("Root Cause Hypothesis:");
  lines.push(issue.rootCauseHypothesis);
  lines.push("");

  lines.push("Recommended Actions:");
  if (issue.recommendedActions.length === 0) {
    lines.push("- (none)");
  } else {
    for (const action of issue.recommendedActions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join("\n");
}

async function mapObservationsById(
  observationStore: ObservationStore,
): Promise<Map<string, { date: string; observation: FeedbackObservation }>> {
  const map = new Map<string, { date: string; observation: FeedbackObservation }>();
  const dates = await observationStore.getObservationDates();

  for (const date of dates) {
    const observations = await observationStore.readObservationsByDate(date);
    for (const observation of observations) {
      map.set(observation.id, { date, observation });
    }
  }

  return map;
}

async function cleanupObservationIds(
  observationStore: ObservationStore,
  observationIds: string[],
): Promise<string[]> {
  const idSet = new Set(observationIds);
  if (idSet.size === 0) {
    return [];
  }

  const deleted: string[] = [];
  const dates = await observationStore.getObservationDates();

  for (const date of dates) {
    const observations = await observationStore.readObservationsByDate(date);
    for (const observation of observations) {
      if (idSet.has(observation.id)) {
        await observationStore.deleteObservationById(date, observation.id);
        deleted.push(observation.id);
      }
    }
  }

  return deleted.sort((a, b) => a.localeCompare(b));
}

function selectRecentEvidenceIds(
  issue: FeedbackIssue,
  observationMap: Map<string, { date: string; observation: FeedbackObservation }>,
  now: Date,
): string[] {
  const retentionDays = DEFAULT_FEEDBACK_CONFIG.rawObservationRetentionDays;
  const retentionWindowMs = retentionDays * 24 * 60 * 60 * 1000;

  const evidence = issue.evidenceIds
    .map((id) => ({ id, found: observationMap.get(id) }))
    .filter(
      (entry): entry is { id: string; found: { date: string; observation: FeedbackObservation } } =>
        Boolean(entry.found),
    )
    .filter((entry) => {
      const timestampMs = new Date(entry.found.observation.timestamp).getTime();
      if (Number.isNaN(timestampMs)) {
        return false;
      }
      return now.getTime() - timestampMs <= retentionWindowMs;
    })
    .sort((a, b) => {
      const aTime = new Date(a.found.observation.timestamp).getTime();
      const bTime = new Date(b.found.observation.timestamp).getTime();
      return bTime - aTime;
    })
    .slice(0, 5)
    .map((entry) => entry.id);

  if (evidence.length > 0) {
    return evidence;
  }

  const fallback = issue.evidenceIds[issue.evidenceIds.length - 1];
  return fallback ? [fallback] : [];
}

async function appendFeedbackAudit(archDir: string, entry: Record<string, unknown>): Promise<void> {
  const reviewsDir = path.join(archDir, "feedback", "reviews");
  await ensureDir(reviewsDir);
  const auditPath = path.join(reviewsDir, "audit.jsonl");
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function collectAllObservations(
  observationStore: ObservationStore,
): Promise<FeedbackObservation[]> {
  const dates = await observationStore.getObservationDates();
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  const observations: FeedbackObservation[] = [];

  for (const date of sortedDates) {
    observations.push(...(await observationStore.readObservationsByDate(date)));
  }

  return observations;
}

async function rebuildFromRetainedObservations(archDir: string): Promise<{
  observationCount: number;
  issueCount: number;
  promotedCount: number;
  updatedCount: number;
  reportPaths: { openFeedbackPath: string; optimizationCandidatesPath: string };
}> {
  const observationStore = new ObservationStore(archDir);
  await observationStore.initialize();
  const observations = await collectAllObservations(observationStore);

  await rm(path.join(archDir, "feedback", "issues"), { recursive: true, force: true });

  const issueStore = new IssueStore(archDir);
  await issueStore.initialize();

  const promoter = new FeedbackPromoter(archDir);
  await promoter.initialize();
  const promotionResult = await promoter.promoteObservations(observations);

  const rebuiltIssues = await issueStore.getAllIssues();
  const reportPaths = await regenerateFeedbackReports(archDir);

  return {
    observationCount: observations.length,
    issueCount: rebuiltIssues.length,
    promotedCount: promotionResult.promoted.length,
    updatedCount: promotionResult.updated.length,
    reportPaths,
  };
}

async function clearDerivedFeedbackState(archDir: string): Promise<string[]> {
  const cleared: string[] = [];

  const derivedPaths = [
    path.join(archDir, "feedback", "issues"),
    path.join(archDir, "feedback", "exports"),
    path.join(process.cwd(), "architecture", "feedback", "open-feedback.md"),
    path.join(process.cwd(), "architecture", "feedback", "feedback-history.md"),
  ];

  for (const derivedPath of derivedPaths) {
    await rm(derivedPath, { recursive: true, force: true });
    cleared.push(derivedPath);
  }

  return cleared.sort((a, b) => a.localeCompare(b));
}

async function regenerateOpenFeedbackSummary(archDir: string): Promise<string> {
  const reportPaths = await regenerateFeedbackReports(archDir);
  return reportPaths.openFeedbackPath;
}

async function regenerateFeedbackReports(archDir: string): Promise<{
  openFeedbackPath: string;
  optimizationCandidatesPath: string;
}> {
  const issueStore = new IssueStore(archDir);
  await issueStore.initialize();
  const issues = await issueStore.getAllIssues();
  return writeFeedbackReports(process.cwd(), issues);
}

function parseReviewOutcome(options: FeedbackReviewOptions): FeedbackReviewOutcome | null {
  const outcomes: FeedbackReviewOutcome[] = [];

  if (options.dismiss) outcomes.push("dismiss");
  if (options.mitigatedLocally) outcomes.push("mitigated-locally");
  if (options.defer) outcomes.push("defer");
  if (options.escalate) outcomes.push("escalate");

  return outcomes.length === 1 ? outcomes[0] : null;
}

export function registerFeedbackCommand(program: Command): void {
  const command = program.command("feedback").description("Query and inspect feedback issues");

  command
    .command("list")
    .description("List open feedback issues")
    .option("--category <category>", "Filter by issue category")
    .option("--severity <severity>", "Filter by severity")
    .option("--repo-area <repoArea>", "Filter by affected repo area")
    .option("--resolution-scope <scope>", "Filter by resolution scope")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa feedback list [options]",
        description: "List open feedback issues with optional filters.",
        options: [
          { flag: "--category <category>", description: "Filter by category" },
          { flag: "--severity <severity>", description: "Filter by severity" },
          { flag: "--repo-area <repoArea>", description: "Filter by affected area" },
          { flag: "--resolution-scope <scope>", description: "Filter by resolution scope" },
        ],
        examples: [
          { description: "List open feedback issues", command: "pa feedback list" },
          {
            description: "Filter by category and severity",
            command: "pa feedback list --category ambiguity --severity high",
          },
        ],
        agentMetadata: {
          outputFormat: "Readable table of open issues",
        },
        relatedCommands: [{ command: "pa feedback show <id>", description: "Inspect one issue" }],
      }),
    )
    .action(async (options: FeedbackListOptions) => {
      const archDir = path.join(process.cwd(), ".arch");
      const issueStore = new IssueStore(archDir);
      await issueStore.initialize();

      const allIssues = await issueStore.getAllIssues();
      const openIssues = allIssues.filter((issue) => issue.status === "open");
      const filtered = applyListFilters(openIssues, options).sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      if (filtered.length === 0) {
        console.log("No open feedback issues found.");
        return;
      }

      console.log(formatTable(filtered));
    });

  command
    .command("show")
    .description("Show full detail for a feedback issue")
    .argument("<issueId>", "Issue ID (e.g. FB-AMB-001)")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa feedback show <issueId>",
        description: "Show detailed information for one feedback issue.",
        examples: [{ description: "Show issue detail", command: "pa feedback show FB-AMB-001" }],
        agentMetadata: {
          outputFormat: "Human-readable issue detail with recurrence and evidence summary",
        },
        relatedCommands: [{ command: "pa feedback list", description: "List open issues" }],
      }),
    )
    .action(async (issueId: string) => {
      const archDir = path.join(process.cwd(), ".arch");
      const issueStore = new IssueStore(archDir);
      await issueStore.initialize();

      const issue = await issueStore.getIssue(issueId);
      if (!issue) {
        console.error(`Feedback issue not found: ${issueId}`);
        process.exitCode = 1;
        return;
      }

      console.log(formatIssueDetails(issue));
    });

  command
    .command("export")
    .description("Export a feedback issue or promote reconciliation feedback candidates")
    .argument("<id>", "Issue ID (e.g. FB-AMB-001) or reconciliation report ID/path")
    .option("--format <format>", "Export format: md | json", "md")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa feedback export <id> [--format md|json]",
        description:
          "Generate a portable issue export artifact (FB-* IDs) or promote feedbackCandidates from a reconciliation report into tooling-feedback reports.",
        options: [{ flag: "--format <format>", description: "Export format (default: md)" }],
        examples: [
          { description: "Export markdown", command: "pa feedback export FB-AMB-001" },
          {
            description: "Export JSON",
            command: "pa feedback export FB-AMB-001 --format json",
          },
          {
            description: "Promote reconciliation feedback candidates",
            command: "pa feedback export reconcile-001-2026-03-12",
          },
        ],
      }),
    )
    .action(async (id: string, options: FeedbackExportOptions) => {
      if (!/^FB-/i.test(id)) {
        const result = await exportToolingFeedbackFromReconciliation({
          reconciliationId: id,
          cwd: process.cwd(),
        });

        if (result.generatedCount === 0) {
          console.log("No feedbackCandidates found in reconciliation report.");
          return;
        }

        console.log(`Generated tooling-feedback reports: ${result.generatedCount}`);
        for (const jsonPath of result.jsonPaths) {
          console.log(`json: ${path.relative(process.cwd(), jsonPath)}`);
        }
        for (const markdownPath of result.markdownPaths) {
          console.log(`md:   ${path.relative(process.cwd(), markdownPath)}`);
        }
        return;
      }

      const format = options.format === "json" ? "json" : options.format === "md" ? "md" : null;
      if (!format) {
        console.error(`Invalid export format: ${options.format}. Use 'md' or 'json'.`);
        process.exitCode = 1;
        return;
      }

      const archDir = path.join(process.cwd(), ".arch");
      const issueStore = new IssueStore(archDir);
      await issueStore.initialize();

      const issue = await issueStore.getIssue(id);
      if (!issue) {
        console.error(`Feedback issue not found: ${id}`);
        process.exitCode = 1;
        return;
      }

      const now = new Date();
      const exportPath = await writeFeedbackExportArtifact(archDir, issue, {
        format,
        status: "escalated-upstream",
        timestamp: now,
      });

      await appendFeedbackAudit(archDir, {
        command: "feedback export",
        issueId: id,
        format,
        timestamp: now.toISOString(),
        exportPath,
      });

      console.log(`Export written: ${exportPath}`);
    });

  command
    .command("prune")
    .description("Prune expired observations and stale deferred issues")
    .option("--dry-run", "Show deletions without writing changes")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa feedback prune [--dry-run]",
        description:
          "Delete expired observations and stale deferred issues using retention policy.",
        options: [{ flag: "--dry-run", description: "Report deletions without applying them" }],
        examples: [
          { description: "Preview prune impact", command: "pa feedback prune --dry-run" },
          { description: "Apply prune", command: "pa feedback prune" },
        ],
      }),
    )
    .action(async (options: FeedbackPruneOptions) => {
      const archDir = path.join(process.cwd(), ".arch");
      const now = new Date();
      const pruner = new FeedbackPruner(archDir);
      await pruner.initialize();

      const result = await pruner.prune({
        dryRun: options.dryRun ?? false,
        projectRoot: process.cwd(),
        now,
      });

      await appendFeedbackAudit(archDir, {
        command: "feedback prune",
        timestamp: now.toISOString(),
        dryRun: result.dryRun,
        deletedIssueIds: result.deletedIssueIds,
        deletedObservationIds: result.deletedObservationIds,
        deletedExportArtifacts: result.deletedExportArtifacts,
        deletedGeneratedSummaries: result.deletedGeneratedSummaries,
      });

      if (!result.dryRun) {
        await regenerateFeedbackReports(archDir);
      }

      const mode = result.dryRun ? "[dry-run] " : "";
      console.log(`${mode}Issues removed: ${result.deletedIssueIds.length}`);
      console.log(`${mode}Observations removed: ${result.deletedObservationIds.length}`);
      console.log(`${mode}Export artifacts removed: ${result.deletedExportArtifacts.length}`);
      console.log(`${mode}Generated summaries removed: ${result.deletedGeneratedSummaries.length}`);
    });

  command
    .command("rebuild")
    .description("Rebuild issue index and summaries from retained observations")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa feedback rebuild",
        description:
          "Recompute feedback issues from retained observations and regenerate summaries.",
        examples: [{ description: "Rebuild feedback state", command: "pa feedback rebuild" }],
      }),
    )
    .action(async () => {
      const archDir = path.join(process.cwd(), ".arch");
      const now = new Date();
      const rebuilt = await rebuildFromRetainedObservations(archDir);

      await appendFeedbackAudit(archDir, {
        command: "feedback rebuild",
        timestamp: now.toISOString(),
        observationCount: rebuilt.observationCount,
        issueCount: rebuilt.issueCount,
        promotedCount: rebuilt.promotedCount,
        updatedCount: rebuilt.updatedCount,
        openFeedbackPath: rebuilt.reportPaths.openFeedbackPath,
        optimizationCandidatesPath: rebuilt.reportPaths.optimizationCandidatesPath,
      });

      console.log(
        `Rebuild complete: observations=${rebuilt.observationCount}, issues=${rebuilt.issueCount}`,
      );
      console.log(`Open feedback report: ${rebuilt.reportPaths.openFeedbackPath}`);
      console.log(`Optimization report: ${rebuilt.reportPaths.optimizationCandidatesPath}`);
    });

  command
    .command("refresh")
    .description("Clear derived feedback state and rebuild from retained observations")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa feedback refresh",
        description:
          "Clear derived feedback state, then rebuild indexes and summaries from retained data.",
        examples: [
          { description: "Refresh derived feedback state", command: "pa feedback refresh" },
        ],
      }),
    )
    .action(async () => {
      const archDir = path.join(process.cwd(), ".arch");
      const now = new Date();

      const clearedPaths = await clearDerivedFeedbackState(archDir);
      const rebuilt = await rebuildFromRetainedObservations(archDir);

      await appendFeedbackAudit(archDir, {
        command: "feedback refresh",
        timestamp: now.toISOString(),
        clearedPaths,
        observationCount: rebuilt.observationCount,
        issueCount: rebuilt.issueCount,
        promotedCount: rebuilt.promotedCount,
        updatedCount: rebuilt.updatedCount,
        openFeedbackPath: rebuilt.reportPaths.openFeedbackPath,
        optimizationCandidatesPath: rebuilt.reportPaths.optimizationCandidatesPath,
      });

      console.log(`Refresh complete: cleared=${clearedPaths.length}, issues=${rebuilt.issueCount}`);
      console.log(`Open feedback report: ${rebuilt.reportPaths.openFeedbackPath}`);
      console.log(`Optimization report: ${rebuilt.reportPaths.optimizationCandidatesPath}`);
    });

  command
    .command("review")
    .description("Review a feedback issue with terminal or deferred outcomes")
    .argument("<issueId>", "Issue ID (e.g. FB-AMB-001)")
    .option("--dismiss", "Dismiss issue and remove local record")
    .option("--mitigated-locally", "Mark as mitigated locally and remove local record")
    .option("--defer", "Defer issue and keep minimal record")
    .option("--escalate", "Export for upstream and remove local record")
    .option("--yes", "Confirm irreversible operations")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage:
          "pa feedback review <issueId> [--dismiss|--mitigated-locally|--defer|--escalate] [--yes]",
        description:
          "Apply a review outcome to a feedback issue, including cleanup, optional export, and summary regeneration.",
        options: [
          { flag: "--dismiss", description: "Delete issue and eligible linked observations" },
          {
            flag: "--mitigated-locally",
            description: "Delete issue as locally mitigated and clean eligible observations",
          },
          { flag: "--defer", description: "Keep issue deferred with minimal recent evidence" },
          { flag: "--escalate", description: "Export issue and delete local issue" },
          { flag: "--yes", description: "Required for destructive operations" },
        ],
        examples: [
          {
            description: "Dismiss an issue",
            command: "pa feedback review FB-AMB-001 --dismiss --yes",
          },
          {
            description: "Escalate issue upstream",
            command: "pa feedback review FB-AMB-001 --escalate --yes",
          },
          {
            description: "Defer issue",
            command: "pa feedback review FB-AMB-001 --defer",
          },
        ],
        agentMetadata: {
          outputFormat: "Outcome summary with cleanup/export details",
        },
      }),
    )
    .action(async (issueId: string, options: FeedbackReviewOptions) => {
      const outcome = parseReviewOutcome(options);
      if (!outcome) {
        console.error(
          "Choose exactly one outcome: --dismiss, --mitigated-locally, --defer, or --escalate",
        );
        process.exitCode = 1;
        return;
      }

      const destructive =
        outcome === "dismiss" || outcome === "mitigated-locally" || outcome === "escalate";
      if (destructive && !options.yes) {
        console.error(`Confirmation required for --${outcome}. Re-run with --yes.`);
        process.exitCode = 1;
        return;
      }

      const archDir = path.join(process.cwd(), ".arch");
      const issueStore = new IssueStore(archDir);
      const observationStore = new ObservationStore(archDir);
      await issueStore.initialize();
      await observationStore.initialize();

      const issue = await issueStore.getIssue(issueId);
      if (!issue) {
        console.error(`Feedback issue not found: ${issueId}`);
        process.exitCode = 1;
        return;
      }

      const now = new Date();
      const allIssues = await issueStore.getAllIssues();
      const remainingIssues = allIssues.filter((candidate) => candidate.id !== issueId);
      const protectedEvidenceIds = new Set(
        remainingIssues.flatMap((candidate) => candidate.evidenceIds),
      );

      let deletedObservationIds: string[];
      let exportPath: string | undefined;

      if (outcome === "defer") {
        const observationMap = await mapObservationsById(observationStore);
        const keptEvidenceIds = selectRecentEvidenceIds(issue, observationMap, now);
        const removedEvidenceIds = issue.evidenceIds.filter((id) => !keptEvidenceIds.includes(id));
        const cleanupEligible = removedEvidenceIds.filter((id) => !protectedEvidenceIds.has(id));

        const deferredIssue: FeedbackIssue = {
          ...issue,
          status: "deferred",
          evidenceIds: keptEvidenceIds,
          lastSeenAt: now.toISOString(),
        };
        await issueStore.saveIssue(deferredIssue);

        deletedObservationIds = await cleanupObservationIds(observationStore, cleanupEligible);
      } else {
        if (outcome === "escalate") {
          exportPath = await writeFeedbackExportArtifact(archDir, issue, { format: "json" });
        }

        await issueStore.deleteIssue(issueId);
        const cleanupEligible = issue.evidenceIds.filter((id) => !protectedEvidenceIds.has(id));
        deletedObservationIds = await cleanupObservationIds(observationStore, cleanupEligible);
      }

      const summaryPath = await regenerateOpenFeedbackSummary(archDir);
      await appendFeedbackAudit(archDir, {
        command: "feedback review",
        issueId,
        outcome,
        timestamp: now.toISOString(),
        deletedObservationIds,
        exportPath,
      });

      console.log(`Review applied: ${issueId} -> ${outcome}`);
      if (exportPath) {
        console.log(`Export written: ${exportPath}`);
      }
      console.log(`Deleted observations: ${deletedObservationIds.length}`);
      console.log(`Summary regenerated: ${summaryPath}`);
    });
}
