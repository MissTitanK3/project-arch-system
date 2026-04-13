import path from "path";
import fg from "fast-glob";
import { pathExists } from "../../utils/fs";

export type LegacyWorkflowEntryClassification =
  | "legacy-markdown-guidance"
  | "github-actions-workflow"
  | "other";

export type LegacyWorkflowDocumentMode =
  | "absent"
  | "actions-only"
  | "legacy-guidance-only"
  | "mixed";

export interface LegacyWorkflowEntry {
  path: string;
  classification: LegacyWorkflowEntryClassification;
}

export interface LegacyWorkflowDocumentCompatibilityStatus {
  mode: LegacyWorkflowDocumentMode;
  canonicalRootExists: boolean;
  legacyRootExists: boolean;
  canonicalWorkflowDocuments: string[];
  legacyMarkdownGuides: string[];
  githubActionsWorkflows: string[];
  entries: LegacyWorkflowEntry[];
}

function toRepoRelative(basePath: string, relativePath: string): string {
  const normalized = relativePath.split(path.sep).join("/");
  return `${basePath}/${normalized}`;
}

function classifyLegacyWorkflowEntry(relativePath: string): LegacyWorkflowEntryClassification {
  const lower = relativePath.toLowerCase();

  if (lower.endsWith(".md")) {
    return "legacy-markdown-guidance";
  }

  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return "github-actions-workflow";
  }

  return "other";
}

function resolveLegacyMode(input: {
  legacyMarkdownGuides: string[];
  githubActionsWorkflows: string[];
}): LegacyWorkflowDocumentMode {
  if (input.legacyMarkdownGuides.length > 0 && input.githubActionsWorkflows.length > 0) {
    return "mixed";
  }

  if (input.legacyMarkdownGuides.length > 0) {
    return "legacy-guidance-only";
  }

  if (input.githubActionsWorkflows.length > 0) {
    return "actions-only";
  }

  return "absent";
}

export async function detectLegacyWorkflowDocumentCompatibility(
  cwd = process.cwd(),
): Promise<LegacyWorkflowDocumentCompatibilityStatus> {
  const canonicalRoot = path.join(cwd, ".project-arch", "workflows");
  const legacyRoot = path.join(cwd, ".github", "workflows");

  const [canonicalRootExists, legacyRootExists] = await Promise.all([
    pathExists(canonicalRoot),
    pathExists(legacyRoot),
  ]);

  const canonicalWorkflowDocuments = canonicalRootExists
    ? (
        await fg("**/*.workflow.md", {
          cwd: canonicalRoot,
          onlyFiles: true,
          dot: false,
        })
      )
        .map((entry) => toRepoRelative(".project-arch/workflows", entry))
        .sort((a, b) => a.localeCompare(b))
    : [];

  const legacyEntries = legacyRootExists
    ? await fg("**/*", {
        cwd: legacyRoot,
        onlyFiles: true,
        dot: false,
      })
    : [];

  const entries = legacyEntries
    .map((entry) => ({
      path: toRepoRelative(".github/workflows", entry),
      classification: classifyLegacyWorkflowEntry(entry),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const legacyMarkdownGuides = entries
    .filter((entry) => entry.classification === "legacy-markdown-guidance")
    .map((entry) => entry.path);

  const githubActionsWorkflows = entries
    .filter((entry) => entry.classification === "github-actions-workflow")
    .map((entry) => entry.path);

  return {
    mode: resolveLegacyMode({ legacyMarkdownGuides, githubActionsWorkflows }),
    canonicalRootExists,
    legacyRootExists,
    canonicalWorkflowDocuments,
    legacyMarkdownGuides,
    githubActionsWorkflows,
    entries,
  };
}
