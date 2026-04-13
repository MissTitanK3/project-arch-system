import { Command } from "commander";
import { check } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import { formatEnhancedHelp } from "../help/format";
import { filterCheckResult, toCheckDiagnosticsPayload } from "../../core/validation/check";
import { buildChangedScopePaths, detectChangedPaths } from "./checkChangedScope";
import { resolveWorkflowProfile } from "../../schemas/workflowProfile";
import type { WorkflowProfile } from "../../schemas/workflowProfile";
import path from "path";

function renderFailFastDiagnostic(diagnostic: {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: string | null;
  hint: string | null;
}): string {
  const lines = [`[${diagnostic.code}] ${diagnostic.message}`];
  if (diagnostic.path) {
    lines.push(`Location: ${diagnostic.path}`);
  }
  if (diagnostic.hint) {
    lines.push(`Hint: ${diagnostic.hint}`);
  }
  return lines.join("\n");
}

function parseCsvOrRepeatable(value: string, previous: string[]): string[] {
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...previous, ...items];
}

function parseSeverityValues(
  value: string,
  previous: Array<"error" | "warning">,
): Array<"error" | "warning"> {
  const parsed = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is "error" | "warning" => entry === "error" || entry === "warning");
  return [...previous, ...parsed];
}

function parseCompletenessThreshold(value: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return 100;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 100) {
    return 100;
  }
  return Number(parsed.toFixed(2));
}

export function registerCheckCommand(program: Command): void {
  const parseWorkflowProfile = (value: string): WorkflowProfile | undefined => {
    const lower = value.toLowerCase();
    if (lower === "quality" || lower === "balanced" || lower === "budget") {
      return lower as WorkflowProfile;
    }
    return undefined;
  };

  const parseCoverageMode = (value: string): "warning" | "error" =>
    value === "error" ? "error" : "warning";

  program
    .command("check")
    .description("Validate architecture consistency")
    .option("--json", "Output machine-readable diagnostics as JSON")
    .option(
      "--profile <quality|balanced|budget>",
      "Workflow profile: quality (strictest), balanced (default), or budget (minimal)",
      parseWorkflowProfile,
    )
    .option(
      "--completeness-threshold <0-100>",
      "Fail when decision-domain completeness falls below threshold percentage",
      parseCompletenessThreshold,
      100,
    )
    .option(
      "--coverage-mode <warning|error>",
      "Planning coverage diagnostics severity mode (default: warning)",
      parseCoverageMode,
      "warning",
    )
    .option(
      "--only <codes>",
      "Filter diagnostics by code (comma-separated or repeatable)",
      parseCsvOrRepeatable,
      [],
    )
    .option(
      "--severity <levels>",
      "Filter diagnostics by severity: error, warning (comma-separated or repeatable)",
      parseSeverityValues,
      [],
    )
    .option(
      "--paths <patterns>",
      "Filter diagnostics by path glob patterns (comma-separated or repeatable)",
      parseCsvOrRepeatable,
      [],
    )
    .option("--changed", "Limit reported diagnostics to changed git scope with safe fallback")
    .option("--fail-fast", "Stop at first actionable error")
    .option("--file <path>", "Validate only the specified file (workspace-relative or absolute)")
    .option("--milestone <id>", "Validate only tasks belonging to the given milestone ID")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa check [options]",
        description:
          "Validate the architecture for consistency issues, broken links, and schema violations.",
        examples: [
          { description: "Run validation", command: "pa check" },
          {
            description: "Check only changed git scope (with safe fallback)",
            command: "pa check --changed",
          },
          { description: "Stop after first actionable error", command: "pa check --fail-fast" },
          { description: "Emit diagnostics JSON", command: "pa check --json" },
          {
            description: "Require minimum decision graph completeness",
            command: "pa check --completeness-threshold 90",
          },
          {
            description: "Escalate planning coverage findings to errors",
            command: "pa check --coverage-mode error",
          },
          {
            description: "Validate a single file",
            command:
              "pa check --file roadmap/projects/shared/phases/phase-1/milestones/m-1/tasks/planned/001-task.md",
          },
          {
            description: "Scope diagnostics to one milestone",
            command: "pa check --milestone milestone-1-setup",
          },
          {
            description: "Triage only untracked implementation warnings",
            command: "pa check --only UNTRACKED_IMPLEMENTATION --severity warning",
          },
          {
            description: "Scope diagnostics to web app paths",
            command: 'pa check --paths "apps/web/**"',
          },
        ],
        agentMetadata: {
          outputFormat: "Validation errors and warnings, exits with code 1 if errors found",
        },
        relatedCommands: [
          { command: "pa report", description: "Generate architecture report" },
          { command: "pa help architecture", description: "Learn about validation" },
          { command: "pa explain <code>", description: "Explain a diagnostic code" },
        ],
      }),
    )
    .action(
      async (options: {
        json?: boolean;
        profile?: WorkflowProfile;
        only?: string[];
        severity?: Array<"error" | "warning">;
        paths?: string[];
        changed?: boolean;
        failFast?: boolean;
        file?: string;
        milestone?: string;
        completenessThreshold?: number;
        coverageMode?: "warning" | "error";
      }) => {
        let effectiveFailFast = options.failFast;
        let effectiveCompleteness = options.completenessThreshold;
        let effectiveCoverageMode = options.coverageMode;

        // Only apply profile defaults if a profile is explicitly specified
        if (options.profile) {
          const profileDefaults = resolveWorkflowProfile(options.profile, undefined);
          console.log(
            `INFO: Using workflow profile '${options.profile}': ${profileDefaults.description}`,
          );

          // Apply profile defaults, allowing explicit CLI options to override
          effectiveFailFast = options.failFast ?? profileDefaults.failFast;
          effectiveCompleteness =
            options.completenessThreshold !== undefined && options.completenessThreshold !== 100
              ? options.completenessThreshold
              : profileDefaults.completenessThreshold;
          effectiveCoverageMode = options.coverageMode ?? profileDefaults.coverageMode;
        }

        const rawResult = unwrap(
          await check.checkRun({
            failFast: effectiveFailFast,
            completenessThreshold: effectiveCompleteness,
            coverageMode: effectiveCoverageMode,
          }),
        );

        // Build scope paths from --file and --milestone options.
        const scopePaths: string[] = [];
        if (options.file) {
          const cwd = process.cwd();
          const absolute = path.isAbsolute(options.file)
            ? options.file
            : path.resolve(cwd, options.file);
          scopePaths.push(path.relative(cwd, absolute).replace(/\\/g, "/"));
        }
        if (options.milestone) {
          scopePaths.push(`**/milestones/${options.milestone}/**`);
        }

        let changedScopePaths: string[] | undefined;
        if (options.changed) {
          const changedDetection = detectChangedPaths();
          if (!changedDetection.ok || changedDetection.paths.length === 0) {
            const fallbackReason = !changedDetection.ok
              ? (changedDetection.reason ?? "could not infer changed files")
              : "no changed files detected";
            console.warn(`WARNING: --changed fallback to full check (${fallbackReason}).`);
          } else {
            changedScopePaths = buildChangedScopePaths(changedDetection.paths);
            console.log(
              `INFO: --changed detected ${changedDetection.paths.length} changed path(s); applying scoped diagnostics filter.`,
            );
          }
        }

        const resultWithPrimaryFilters = filterCheckResult(rawResult, {
          only: options.only,
          severity: options.severity,
          paths: changedScopePaths,
        });

        // Apply --paths and --file/--milestone scope filters on top of changed-scope result.
        const combinedPaths = [...(options.paths ?? []), ...scopePaths];
        const result = options.changed
          ? combinedPaths.length > 0
            ? filterCheckResult(resultWithPrimaryFilters, { paths: combinedPaths })
            : resultWithPrimaryFilters
          : filterCheckResult(rawResult, {
              only: options.only,
              severity: options.severity,
              paths: combinedPaths.length > 0 ? combinedPaths : options.paths,
            });

        if (options.json) {
          const payload = toCheckDiagnosticsPayload(result);
          console.log(JSON.stringify(payload, null, 2));
          if (!result.ok) {
            process.exitCode = 1;
          }
          return;
        }

        if (options.failFast && !result.ok) {
          const firstErrorDiagnostic = result.diagnostics.find(
            (diagnostic) => diagnostic.severity === "error",
          );
          if (firstErrorDiagnostic) {
            console.error(renderFailFastDiagnostic(firstErrorDiagnostic));
            process.exitCode = 1;
            return;
          }
        }

        for (const warning of result.warnings) {
          console.warn(`WARNING: ${warning}`);
        }
        const graphSummary = result.graphDiagnostics;
        if (graphSummary?.built) {
          const score = graphSummary.completeness.score.toFixed(2);
          const connected = graphSummary.completeness.connectedDecisionNodes;
          const total = graphSummary.completeness.totalDecisionNodes;
          const threshold = graphSummary.completeness.threshold.toFixed(2);
          if (graphSummary.completeness.sufficient) {
            console.log(
              `GRAPH: built and sufficiently connected (${score}% decision-domain completeness, ${connected}/${total}, threshold ${threshold}%).`,
            );
          } else {
            console.error(
              `GRAPH: built but insufficiently connected (${score}% decision-domain completeness, ${connected}/${total}, threshold ${threshold}%).`,
            );
          }
        }
        if (result.ok) {
          console.log("OK");
          return;
        }

        for (const error of result.errors) {
          console.error(`ERROR: ${error}`);
        }
        if (result.diagnostics.some((diagnostic) => diagnostic.code === "MALFORMED_TASK_FILE")) {
          console.error("");
          console.error("Repair suggestions:");
          console.error("- Run pa fix frontmatter for a dry-run repair preview.");
          console.error("- Run pa fix frontmatter --yes to apply safe repairs.");
          console.error("- Run pa normalize to rewrite canonical frontmatter ordering.");
          console.error("- Run pa explain MALFORMED_TASK_FILE for detailed remediation.");
        }
        process.exitCode = 1;
      },
    );
}
