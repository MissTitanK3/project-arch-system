import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  StageChatChecklistUpdateProposal,
  StageChatProposal,
  StageChatStatusUpdateProposal,
  StageChatTaskContentProposal,
} from "../navigation/stageChatProposalReview";
import {
  parseTaskWorkflowDocument,
  type NormalizedTaskWorkflow,
  type TaskWorkflowItemStatus,
} from "../navigation/taskWorkflowParser";

export type StageChatProposalAction = "accept" | "reject";

export interface StageChatProposalWritebackDependencies {
  readFile?: (absolutePath: string) => Promise<string>;
  writeFile?: (absolutePath: string, content: string) => Promise<void>;
}

export interface StageChatProposalWritebackResult {
  action: StageChatProposalAction;
  proposalId: string;
  proposalKind: StageChatProposal["kind"];
  proposalStatus: "accepted" | "rejected";
  mutatedCanonicalArtifact: boolean;
  artifactPath?: string;
  message: string;
}

function resolveWorkspaceFilePath(input: {
  workspaceRoot: string;
  artifactPath: string;
}): string | undefined {
  const absolutePath = path.resolve(input.workspaceRoot, input.artifactPath);
  const normalizedWorkspaceRoot = path.resolve(input.workspaceRoot);
  const workspacePrefix = `${normalizedWorkspaceRoot}${path.sep}`;

  if (absolutePath !== normalizedWorkspaceRoot && !absolutePath.startsWith(workspacePrefix)) {
    return undefined;
  }

  return absolutePath;
}

function stripQuotedValue(value: string): string {
  return value
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function renderWorkflowFrontmatterLines(workflow: NormalizedTaskWorkflow): string[] {
  const lines: string[] = [
    "workflow:",
    '  schemaVersion: "2.0"',
    `  template: ${workflow.workflow.template}`,
    "  stages:",
  ];

  for (const stage of workflow.workflow.stages) {
    lines.push(`    - id: ${stage.id}`);
    lines.push(`      title: ${quoteYamlString(stage.title)}`);
    lines.push(`      runtimePreference: ${stage.runtimePreference}`);
    lines.push("      items:");

    for (const item of stage.items) {
      lines.push(`        - id: ${item.id}`);
      lines.push(`          label: ${quoteYamlString(item.label)}`);
      lines.push(`          status: ${item.status}`);
    }
  }

  return lines;
}

function replaceWorkflowFrontmatterBlock(
  frontmatterLines: string[],
  workflow: NormalizedTaskWorkflow,
): string[] {
  const workflowStartIndex = frontmatterLines.findIndex((line) => line.trim() === "workflow:");
  const workflowLines = renderWorkflowFrontmatterLines(workflow);

  if (workflowStartIndex < 0) {
    return [...frontmatterLines, ...workflowLines];
  }

  let workflowEndIndex = workflowStartIndex + 1;
  while (workflowEndIndex < frontmatterLines.length) {
    const line = frontmatterLines[workflowEndIndex] ?? "";
    if (/^[a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(line.trim()) && !/^\s/.test(line)) {
      break;
    }
    workflowEndIndex += 1;
  }

  return [
    ...frontmatterLines.slice(0, workflowStartIndex),
    ...workflowLines,
    ...frontmatterLines.slice(workflowEndIndex),
  ];
}

function splitTaskFrontmatterAndBody(
  content: string,
): { frontmatterLines: string[]; body: string } | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  const closingFence = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closingFence < 0) {
    return undefined;
  }

  const closingIndex = closingFence + 1;
  return {
    frontmatterLines: lines.slice(1, closingIndex),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function renderMirroredChecklistSection(workflow: NormalizedTaskWorkflow): string {
  const lines: string[] = ["## Workflow Checklist (Mirrored)", ""];

  for (const stage of workflow.workflow.stages) {
    lines.push(`### ${stage.title}`);
    for (const item of stage.items) {
      const isComplete = item.status === "done" || item.status === "skipped";
      const statusSuffix =
        item.status === "in_progress"
          ? " (in progress)"
          : item.status === "blocked"
            ? " (blocked)"
            : item.status === "skipped"
              ? " (skipped)"
              : "";
      lines.push(`- [${isComplete ? "x" : " "}] ${item.label}${statusSuffix}`);
    }
    lines.push("");
  }

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function replaceMirroredChecklistSection(body: string, workflow: NormalizedTaskWorkflow): string {
  const section = renderMirroredChecklistSection(workflow);
  const bodyLines = body.split(/\r?\n/);
  const headingRegex = /^##\s+workflow checklist(?:\s*\(mirrored\))?\s*$/i;
  const startIndex = bodyLines.findIndex((line) => headingRegex.test(line.trim()));

  if (startIndex < 0) {
    const trimmedBody = body.replace(/\s+$/, "");
    if (trimmedBody.length === 0) {
      return `${section}\n`;
    }

    return `${trimmedBody}\n\n${section}\n`;
  }

  let endIndex = bodyLines.length;
  for (let index = startIndex + 1; index < bodyLines.length; index += 1) {
    if (/^##\s+/.test((bodyLines[index] ?? "").trim())) {
      endIndex = index;
      break;
    }
  }

  const updatedBodyLines = [
    ...bodyLines.slice(0, startIndex),
    section,
    ...bodyLines.slice(endIndex),
  ];
  const updatedBody = updatedBodyLines.join("\n").replace(/\s+$/, "");

  return `${updatedBody}\n`;
}

function renderTaskDocumentWithUpdatedWorkflow(
  content: string,
  workflow: NormalizedTaskWorkflow,
): string | undefined {
  const split = splitTaskFrontmatterAndBody(content);
  if (!split) {
    return undefined;
  }

  const nextFrontmatter = replaceWorkflowFrontmatterBlock(split.frontmatterLines, workflow);
  const nextBody = replaceMirroredChecklistSection(split.body, workflow);

  return ["---", ...nextFrontmatter, "---", "", nextBody.replace(/^\n+/, "")].join("\n");
}

function normalizeFrontmatterScalarLine(line: string): { key: string; value: string } | undefined {
  const match = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
  if (!match) {
    return undefined;
  }

  return {
    key: match[1]!.trim().toLowerCase(),
    value: match[2]!.trim(),
  };
}

function updateFrontmatterScalars(input: {
  frontmatterLines: string[];
  replacements: Record<string, string | undefined>;
}): string[] {
  const replacements = Object.entries(input.replacements)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => [key.toLowerCase(), value as string] as const);

  const nextLines = [...input.frontmatterLines];
  const replacedKeys = new Set<string>();

  for (let index = 0; index < nextLines.length; index += 1) {
    const parsed = normalizeFrontmatterScalarLine((nextLines[index] ?? "").trim());
    if (!parsed) {
      continue;
    }

    const replacement = replacements.find(([key]) => key === parsed.key);
    if (!replacement) {
      continue;
    }

    nextLines[index] = `${replacement[0]}: ${stripQuotedValue(replacement[1])}`;
    replacedKeys.add(replacement[0]);
  }

  for (const [key, value] of replacements) {
    if (replacedKeys.has(key)) {
      continue;
    }

    nextLines.push(`${key}: ${stripQuotedValue(value)}`);
  }

  return nextLines;
}

function applyChecklistProposal(input: {
  proposal: StageChatChecklistUpdateProposal;
  content: string;
  absolutePath: string;
}): { ok: true; updatedContent: string } | { ok: false; reason: string } {
  const parsedWorkflow = (() => {
    try {
      return parseTaskWorkflowDocument(input.content, input.absolutePath);
    } catch {
      return undefined;
    }
  })();

  if (!parsedWorkflow) {
    return { ok: false, reason: "Task workflow cannot be parsed for checklist writeback." };
  }

  let nextWorkflow = parsedWorkflow;

  for (const change of input.proposal.changes) {
    const matches: Array<{ stageId: string; itemId: string }> = [];
    for (const stage of nextWorkflow.workflow.stages) {
      for (const item of stage.items) {
        if (item.id === change.itemId) {
          matches.push({ stageId: stage.id, itemId: item.id });
        }
      }
    }

    if (matches.length === 0) {
      return {
        ok: false,
        reason: `Checklist item '${change.itemId}' was not found for writeback.`,
      };
    }

    if (matches.length > 1) {
      return {
        ok: false,
        reason: `Checklist item '${change.itemId}' is ambiguous across stages.`,
      };
    }

    const matched = matches[0]!;
    let didUpdate = false;

    const updatedStages = nextWorkflow.workflow.stages.map((stage) => {
      if (stage.id !== matched.stageId) {
        return stage;
      }

      return {
        ...stage,
        items: stage.items.map((item) => {
          if (item.id !== matched.itemId) {
            return item;
          }

          didUpdate = true;
          return {
            ...item,
            status: change.afterStatus as TaskWorkflowItemStatus,
          };
        }),
      };
    });

    if (!didUpdate) {
      return {
        ok: false,
        reason: `Checklist item '${change.itemId}' could not be updated.`,
      };
    }

    nextWorkflow = {
      ...nextWorkflow,
      workflow: {
        ...nextWorkflow.workflow,
        stages: updatedStages,
      },
    };
  }

  const rendered = renderTaskDocumentWithUpdatedWorkflow(input.content, nextWorkflow);
  if (!rendered) {
    return {
      ok: false,
      reason: "Task document has malformed frontmatter fences.",
    };
  }

  return { ok: true, updatedContent: rendered };
}

function applyStatusProposal(input: {
  proposal: StageChatStatusUpdateProposal;
  content: string;
}): { ok: true; updatedContent: string } | { ok: false; reason: string } {
  const split = splitTaskFrontmatterAndBody(input.content);
  if (!split) {
    return {
      ok: false,
      reason: "Task document has malformed frontmatter fences.",
    };
  }

  const updatedFrontmatter = updateFrontmatterScalars({
    frontmatterLines: split.frontmatterLines,
    replacements: {
      status: input.proposal.change.afterStatus,
      lane: input.proposal.change.afterLane,
    },
  });

  const updatedContent = ["---", ...updatedFrontmatter, "---", split.body].join("\n");
  return { ok: true, updatedContent };
}

function applyTaskContentProposal(input: {
  proposal: StageChatTaskContentProposal;
}): { ok: true; updatedContent: string } | { ok: false; reason: string } {
  if (input.proposal.diff.afterText.trim().length === 0) {
    return {
      ok: false,
      reason: "Task-content proposal has empty after-text and cannot be written.",
    };
  }

  return {
    ok: true,
    updatedContent: input.proposal.diff.afterText,
  };
}

export interface StageChatProposalWritebackBoundary {
  executeProposalAction(input: {
    workspaceRoot: string;
    proposal: StageChatProposal;
    action: StageChatProposalAction;
  }): Promise<StageChatProposalWritebackResult>;
}

export function createStageChatProposalWritebackBoundary(
  dependencies?: StageChatProposalWritebackDependencies,
): StageChatProposalWritebackBoundary {
  const readFile =
    dependencies?.readFile ??
    (async (absolutePath: string) => await fs.readFile(absolutePath, "utf8"));
  const writeFile =
    dependencies?.writeFile ??
    (async (absolutePath: string, content: string) => {
      await fs.writeFile(absolutePath, content, "utf8");
    });

  return {
    async executeProposalAction(input) {
      if (input.action === "reject") {
        return {
          action: "reject",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "rejected",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Proposal rejected. No artifact changes were made.",
        };
      }

      if (input.proposal.status === "rejected") {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Writeback blocked: proposal is already rejected.",
        };
      }

      if (input.proposal.status === "accepted") {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Writeback skipped: proposal is already accepted.",
        };
      }

      const absolutePath = resolveWorkspaceFilePath({
        workspaceRoot: input.workspaceRoot,
        artifactPath: input.proposal.artifactPath,
      });
      if (!absolutePath) {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Writeback blocked: target artifact is outside workspace root.",
        };
      }

      let currentContent: string;
      try {
        currentContent = await readFile(absolutePath);
      } catch {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Writeback failed: target artifact could not be read.",
        };
      }

      const applyResult =
        input.proposal.kind === "task-content"
          ? applyTaskContentProposal({ proposal: input.proposal })
          : input.proposal.kind === "checklist-update"
            ? applyChecklistProposal({
                proposal: input.proposal,
                content: currentContent,
                absolutePath,
              })
            : applyStatusProposal({ proposal: input.proposal, content: currentContent });

      if (!applyResult.ok) {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: `Writeback not applied: ${applyResult.reason}`,
        };
      }

      if (applyResult.updatedContent === currentContent) {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Writeback not applied: no artifact changes were detected.",
        };
      }

      try {
        await writeFile(absolutePath, applyResult.updatedContent);
      } catch {
        return {
          action: "accept",
          proposalId: input.proposal.id,
          proposalKind: input.proposal.kind,
          proposalStatus: "accepted",
          mutatedCanonicalArtifact: false,
          artifactPath: input.proposal.artifactPath,
          message: "Writeback failed: updated artifact could not be saved.",
        };
      }

      return {
        action: "accept",
        proposalId: input.proposal.id,
        proposalKind: input.proposal.kind,
        proposalStatus: "accepted",
        mutatedCanonicalArtifact: true,
        artifactPath: input.proposal.artifactPath,
        message: "Proposal accepted. Artifact updated.",
      };
    },
  };
}
