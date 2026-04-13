import type { StageChatSeedMessage } from "./stageChatContextPackage";
import type { StageChatSummarizedHistoryThreadState } from "./stageChatSummarizedHistoryBoundary";

export type StageChatHandoffDirection = "local-to-cloud" | "cloud-to-local";

export interface StageChatTransferSummary {
  stage: string;
  currentGoal: string;
  keyFacts: string[];
  decisionsMade: string[];
  openQuestions: string[];
  proposedNextSteps?: string[];
  pinnedNotes?: string[];
  referencedArtifacts?: string[];
}

export interface StageChatTransferSummaryInput {
  direction: StageChatHandoffDirection;
  seed?: StageChatSeedMessage;
  summarizedHistory?: StageChatSummarizedHistoryThreadState;
  currentGoal?: string;
  openQuestions?: string[];
  pinnedNotes?: string[];
  referencedArtifacts?: string[];
}

const REQUIRED_LIST_LIMIT = 5;
const OPTIONAL_LIST_LIMIT = 5;
const ARTIFACT_LIMIT = 8;

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupe(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeLine(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) {
      break;
    }
  }

  return out;
}

function pickStage(seed?: StageChatSeedMessage): string {
  if (!seed) {
    return "Unknown stage";
  }

  const stage = seed.contextPackage.stage;
  return `${stage.title} (${stage.id})`;
}

function pickCurrentGoal(input: StageChatTransferSummaryInput): string {
  const fromInput = normalizeLine(input.currentGoal ?? "");
  if (fromInput) {
    return fromInput;
  }

  const fromNextSteps = dedupe(input.summarizedHistory?.rollingSummary.nextSteps ?? [], 1)[0];
  if (fromNextSteps) {
    return fromNextSteps;
  }

  return input.direction === "local-to-cloud"
    ? "Continue current stage work with deeper assistance"
    : "Continue current stage work with compact local context";
}

function pickOpenQuestions(input: StageChatTransferSummaryInput): string[] {
  const fromInput = dedupe(input.openQuestions ?? [], REQUIRED_LIST_LIMIT);
  if (fromInput.length > 0) {
    return fromInput;
  }

  const extracted =
    input.summarizedHistory?.rollingSummary.keyFacts.filter((line) => /\?$/.test(line)) ?? [];
  return dedupe(extracted, REQUIRED_LIST_LIMIT);
}

export function buildStageChatTransferSummary(
  input: StageChatTransferSummaryInput,
): StageChatTransferSummary {
  const rolling = input.summarizedHistory?.rollingSummary;

  const summary: StageChatTransferSummary = {
    stage: pickStage(input.seed),
    currentGoal: pickCurrentGoal(input),
    keyFacts: dedupe(rolling?.keyFacts ?? [], REQUIRED_LIST_LIMIT),
    decisionsMade: dedupe(rolling?.decisions ?? [], REQUIRED_LIST_LIMIT),
    openQuestions: pickOpenQuestions(input),
  };

  const proposedNextSteps = dedupe(rolling?.nextSteps ?? [], OPTIONAL_LIST_LIMIT);
  if (proposedNextSteps.length > 0) {
    summary.proposedNextSteps = proposedNextSteps;
  }

  const pinnedNotes = dedupe(input.pinnedNotes ?? [], OPTIONAL_LIST_LIMIT);
  if (pinnedNotes.length > 0) {
    summary.pinnedNotes = pinnedNotes;
  }

  const referencedArtifacts = dedupe(
    [
      ...(input.referencedArtifacts ?? []),
      ...(input.seed?.contextPackage.codeTargets ?? []),
      ...(input.seed?.contextPackage.evidencePaths ?? []),
    ],
    ARTIFACT_LIMIT,
  );
  if (referencedArtifacts.length > 0) {
    summary.referencedArtifacts = referencedArtifacts;
  }

  return summary;
}

export function formatStageChatTransferSummary(summary: StageChatTransferSummary): string {
  const lines: string[] = [];

  lines.push("## Runtime Handoff Summary");
  lines.push(`- Stage: ${summary.stage}`);
  lines.push(`- Current goal: ${summary.currentGoal}`);

  lines.push("");
  lines.push("### Key Facts");
  if (summary.keyFacts.length === 0) {
    lines.push("- None captured");
  } else {
    for (const item of summary.keyFacts) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("### Decisions Made");
  if (summary.decisionsMade.length === 0) {
    lines.push("- None captured");
  } else {
    for (const item of summary.decisionsMade) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("### Open Questions");
  if (summary.openQuestions.length === 0) {
    lines.push("- None captured");
  } else {
    for (const item of summary.openQuestions) {
      lines.push(`- ${item}`);
    }
  }

  if (summary.proposedNextSteps && summary.proposedNextSteps.length > 0) {
    lines.push("");
    lines.push("### Proposed Next Steps");
    for (const item of summary.proposedNextSteps) {
      lines.push(`- ${item}`);
    }
  }

  if (summary.pinnedNotes && summary.pinnedNotes.length > 0) {
    lines.push("");
    lines.push("### Pinned Notes");
    for (const item of summary.pinnedNotes) {
      lines.push(`- ${item}`);
    }
  }

  if (summary.referencedArtifacts && summary.referencedArtifacts.length > 0) {
    lines.push("");
    lines.push("### Referenced Artifacts");
    for (const item of summary.referencedArtifacts) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}
