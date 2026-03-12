import { ReconciliationReport } from "../../schemas/reconciliationReport";

function list(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- (none)";
}

export function renderReconciliationReportMarkdown(
  report: ReconciliationReport,
  defaultAuthor: string,
): string {
  const typeLabel = report.type === "local-reconciliation" ? "Reconciliation" : "Feedback";

  return `# ${typeLabel} Report: ${report.id}

**Date**: ${report.date}
**Status**: ${report.status}
**Type**: ${report.type}
**Source Task**: ${report.taskId}
**Author**: ${report.author ?? defaultAuthor}

## Summary

${report.summary ?? "(generated report)"}

## Changed Files

${list(report.changedFiles)}

## Affected Areas

${list(report.affectedAreas)}

## Missing Updates

${list(report.missingUpdates)}

## Decision Candidates

${list(report.decisionCandidates)}

## Standards Affected

${list(report.standardsGaps)}

## Proposed Actions

${list(report.proposedActions)}

## Feedback Candidates

${list(report.feedbackCandidates)}

## Notes

${report.notes ?? "(none)"}
`;
}
