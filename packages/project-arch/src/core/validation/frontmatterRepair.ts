import fs from "fs-extra";
import matter from "gray-matter";
import { decisionSchema } from "../../schemas/decision";
import { taskSchema } from "../../schemas/task";
import { getDiagnosticExplanation } from "../diagnostics/explanations";
import {
  applySafeFrontmatterAutoFixes,
  AUTO_FIXABLE_FRONTMATTER_CODES,
  extractFrontmatterBlock,
  inferArtifactKind,
  lintFrontmatter,
  listFrontmatterFiles,
  normalizeRelativePath,
  type ArtifactKind,
  type FrontmatterLintDiagnostic,
} from "./frontmatter";

export interface FrontmatterRepairFileResult {
  path: string;
  changed: boolean;
  applied: boolean;
  requiresManualIntervention: boolean;
  diagnostics: FrontmatterLintDiagnostic[];
  diff: string | null;
  suggestion: string | null;
}

export interface FrontmatterRepairResult {
  ok: boolean;
  scannedFiles: number;
  changedFiles: number;
  appliedFiles: number;
  manualFiles: number;
  fileResults: FrontmatterRepairFileResult[];
}

export async function repairFrontmatter(options?: {
  cwd?: string;
  write?: boolean;
}): Promise<FrontmatterRepairResult> {
  const cwd = options?.cwd ?? process.cwd();
  const write = options?.write === true;

  const lintResult = await lintFrontmatter({ cwd });
  const diagnosticsByPath = groupDiagnosticsByPath(lintResult.diagnostics);
  const files = await listFrontmatterFiles(cwd);
  const fileResults: FrontmatterRepairFileResult[] = [];
  let changedFiles = 0;
  let appliedFiles = 0;
  let manualFiles = 0;

  for (const filePath of files.sort()) {
    const relativePath = normalizeRelativePath(cwd, filePath);
    const artifactKind = inferArtifactKind(relativePath);
    const fileDiagnostics = diagnosticsByPath.get(relativePath) ?? [];

    if (!artifactKind) {
      continue;
    }

    const original = await fs.readFile(filePath, "utf8");
    const fixed = applySafeFrontmatterAutoFixes(original, artifactKind);
    const remainingDiagnostics = resolveRemainingDiagnostics(
      fileDiagnostics,
      validateContentAfterAutoFix(fixed.updatedContent, artifactKind, relativePath),
    );
    const requiresManualIntervention = remainingDiagnostics.length > 0;

    if (fixed.changed) {
      changedFiles += 1;
    }
    if (requiresManualIntervention) {
      manualFiles += 1;
    }
    if (write && fixed.changed) {
      await fs.writeFile(filePath, fixed.updatedContent, "utf8");
      appliedFiles += 1;
    }

    fileResults.push({
      path: relativePath,
      changed: fixed.changed,
      applied: write && fixed.changed,
      requiresManualIntervention,
      diagnostics: remainingDiagnostics,
      diff: fixed.changed ? renderLineDiff(relativePath, original, fixed.updatedContent) : null,
      suggestion: buildSuggestion(remainingDiagnostics),
    });
  }

  return {
    ok: manualFiles === 0,
    scannedFiles: files.length,
    changedFiles,
    appliedFiles,
    manualFiles,
    fileResults,
  };
}

export async function normalizeFrontmatter(options?: {
  cwd?: string;
  write?: boolean;
}): Promise<FrontmatterRepairResult> {
  const cwd = options?.cwd ?? process.cwd();
  const write = options?.write === true;

  const lintResult = await lintFrontmatter({ cwd });
  const diagnosticsByPath = groupDiagnosticsByPath(lintResult.diagnostics);
  const files = await listFrontmatterFiles(cwd);
  const fileResults: FrontmatterRepairFileResult[] = [];
  let changedFiles = 0;
  let appliedFiles = 0;
  let manualFiles = 0;

  for (const filePath of files.sort()) {
    const relativePath = normalizeRelativePath(cwd, filePath);
    const artifactKind = inferArtifactKind(relativePath);
    const originalDiagnostics = diagnosticsByPath.get(relativePath) ?? [];

    if (!artifactKind) {
      continue;
    }

    const original = await fs.readFile(filePath, "utf8");
    const preNormalized = applySafeFrontmatterAutoFixes(original, artifactKind).updatedContent;
    const remainingDiagnostics = resolveRemainingDiagnostics(
      originalDiagnostics,
      validateContentAfterAutoFix(preNormalized, artifactKind, relativePath),
    );

    if (remainingDiagnostics.length > 0) {
      manualFiles += 1;
      fileResults.push({
        path: relativePath,
        changed: false,
        applied: false,
        requiresManualIntervention: true,
        diagnostics: remainingDiagnostics,
        diff: null,
        suggestion: buildSuggestion(remainingDiagnostics),
      });
      continue;
    }

    const canonical = toCanonicalFrontmatterDocument(preNormalized, artifactKind);
    if (!canonical.ok) {
      manualFiles += 1;
      fileResults.push({
        path: relativePath,
        changed: false,
        applied: false,
        requiresManualIntervention: true,
        diagnostics: canonical.diagnostics,
        diff: null,
        suggestion: buildSuggestion(canonical.diagnostics),
      });
      continue;
    }

    const changed = canonical.updatedContent !== original;
    if (changed) {
      changedFiles += 1;
    }
    if (write && changed) {
      await fs.writeFile(filePath, canonical.updatedContent, "utf8");
      appliedFiles += 1;
    }

    fileResults.push({
      path: relativePath,
      changed,
      applied: write && changed,
      requiresManualIntervention: false,
      diagnostics: [],
      diff: changed ? renderLineDiff(relativePath, original, canonical.updatedContent) : null,
      suggestion: null,
    });
  }

  return {
    ok: manualFiles === 0,
    scannedFiles: files.length,
    changedFiles,
    appliedFiles,
    manualFiles,
    fileResults,
  };
}

function groupDiagnosticsByPath(
  diagnostics: FrontmatterLintDiagnostic[],
): Map<string, FrontmatterLintDiagnostic[]> {
  const grouped = new Map<string, FrontmatterLintDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const existing = grouped.get(diagnostic.path) ?? [];
    existing.push(diagnostic);
    grouped.set(diagnostic.path, existing);
  }
  return grouped;
}

function resolveRemainingDiagnostics(
  originalDiagnostics: FrontmatterLintDiagnostic[],
  postFixDiagnostics: FrontmatterLintDiagnostic[],
): FrontmatterLintDiagnostic[] {
  if (postFixDiagnostics.length > 0) {
    return postFixDiagnostics;
  }

  return originalDiagnostics.filter(
    (diagnostic) =>
      !AUTO_FIXABLE_FRONTMATTER_CODES.includes(diagnostic.code as never) &&
      diagnostic.code !== "YAML_PARSE_ERROR" &&
      diagnostic.code !== "YAML_PARSE_WARNING",
  );
}

function validateContentAfterAutoFix(
  content: string,
  artifactKind: ArtifactKind,
  relativePath: string,
): FrontmatterLintDiagnostic[] {
  if (!extractFrontmatterBlock(content)) {
    return [
      {
        code: "FRONTMATTER_MISSING",
        severity: "error",
        message: "Missing YAML frontmatter block.",
        path: relativePath,
        line: 1,
      },
    ];
  }

  try {
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    const result = (artifactKind === "task" ? taskSchema : decisionSchema).safeParse(data);
    if (result.success) {
      return [];
    }

    return result.error.issues.map((issue) => ({
      code:
        issue.code === "invalid_type" && "received" in issue && issue.received === "undefined"
          ? "MISSING_REQUIRED_KEY"
          : "SCHEMA_TYPE",
      severity: "error" as const,
      message:
        issue.code === "invalid_type" && "received" in issue && issue.received === "undefined"
          ? `Missing required key '${issue.path.join(".")}'.`
          : `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`,
      path: relativePath,
      line: 1,
    }));
  } catch (error) {
    return [
      {
        code: "YAML_PARSE_ERROR",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        path: relativePath,
        line: 1,
      },
    ];
  }
}

function toCanonicalFrontmatterDocument(
  content: string,
  artifactKind: ArtifactKind,
): { ok: true; updatedContent: string } | { ok: false; diagnostics: FrontmatterLintDiagnostic[] } {
  const relativePath = "<in-memory>";
  const block = extractFrontmatterBlock(content);
  if (!block) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "FRONTMATTER_MISSING",
          severity: "error",
          message: "Missing YAML frontmatter block.",
          path: relativePath,
          line: 1,
        },
      ],
    };
  }

  try {
    const parsed = matter(content);
    const sourceData = parsed.data as Record<string, unknown>;
    const normalizedData =
      artifactKind === "task" ? taskSchema.parse(sourceData) : decisionSchema.parse(sourceData);
    const orderedData = orderFrontmatterKeys(sourceData, normalizedData, artifactKind);
    const normalizedBody = parsed.content.endsWith("\n") ? parsed.content : `${parsed.content}\n`;
    const updatedContent = matter.stringify(normalizedBody, orderedData, { language: "yaml" });
    return { ok: true, updatedContent };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "SCHEMA_TYPE",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
          path: relativePath,
          line: 1,
        },
      ],
    };
  }
}

function orderFrontmatterKeys(
  sourceData: Record<string, unknown>,
  normalizedData: Record<string, unknown>,
  artifactKind: ArtifactKind,
): Record<string, unknown> {
  const taskOrder = [
    "schemaVersion",
    "id",
    "slug",
    "title",
    "lane",
    "status",
    "createdAt",
    "updatedAt",
    "discoveredFromTask",
    "tags",
    "codeTargets",
    "publicDocs",
    "decisions",
    "completionCriteria",
    "scope",
    "acceptanceChecks",
    "evidence",
    "traceLinks",
    "dependsOn",
    "blocks",
  ];
  const decisionOrder = [
    "schemaVersion",
    "type",
    "id",
    "title",
    "status",
    "scope",
    "drivers",
    "decision",
    "alternatives",
    "consequences",
    "links",
    "supersedes",
    "implementationStatus",
    "impact",
  ];
  const preferredOrder = artifactKind === "task" ? taskOrder : decisionOrder;
  const ordered: Record<string, unknown> = {};

  for (const key of preferredOrder) {
    if (Object.prototype.hasOwnProperty.call(normalizedData, key)) {
      ordered[key] = normalizedData[key];
    }
  }

  for (const key of Object.keys(sourceData)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      ordered[key] = sourceData[key];
    }
  }

  return ordered;
}

function renderLineDiff(filePath: string, before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/u);
  const afterLines = after.split(/\r?\n/u);
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  const diffLines = [`--- ${filePath}`, `+++ ${filePath}`];

  for (let index = 0; index < maxLength; index += 1) {
    const previous = beforeLines[index];
    const next = afterLines[index];
    if (previous === next) {
      continue;
    }
    if (previous !== undefined) {
      diffLines.push(`-${previous}`);
    }
    if (next !== undefined) {
      diffLines.push(`+${next}`);
    }
  }

  return diffLines.join("\n");
}

function buildSuggestion(diagnostics: FrontmatterLintDiagnostic[]): string | null {
  const first = diagnostics[0];
  if (!first) {
    return null;
  }

  const explanation = getDiagnosticExplanation(first.code);
  if (!explanation) {
    return `Run pa explain ${first.code} for more detail.`;
  }

  const firstStep = explanation.remediation.split("\n")[0]?.trim() ?? "";
  return `${firstStep} Run pa explain ${first.code} for full remediation.`.trim();
}
