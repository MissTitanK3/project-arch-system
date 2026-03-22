import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import { z } from "zod";
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import { decisionSchema } from "../../schemas/decision";
import { taskSchema } from "../../schemas/task";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";

export type ArtifactKind = "task" | "decision";

export type FrontmatterLintSeverity = "error" | "warning";

export interface FrontmatterLintDiagnostic {
  code: string;
  severity: FrontmatterLintSeverity;
  message: string;
  path: string;
  line: number;
}

export interface FrontmatterLintResult {
  ok: boolean;
  scannedFiles: number;
  fixedFiles: number;
  diagnostics: FrontmatterLintDiagnostic[];
}

export interface FrontmatterBlock {
  lines: string[];
  openDelimiterLineIndex: number;
  closeDelimiterLineIndex: number;
}

export interface FrontmatterAutoFixOutcome {
  changed: boolean;
  updatedContent: string;
  appliedCodes: string[];
}

interface ParsedYaml {
  data: unknown;
  parseDiagnostics: FrontmatterLintDiagnostic[];
  pathLineMap: Map<string, number>;
}

interface LintRuleContext {
  artifactKind: ArtifactKind;
  relativePath: string;
  block: FrontmatterBlock;
}

const TASK_FRONTMATTER_GLOB = "**/tasks/**/*.md";
const DECISION_FRONTMATTER_GLOB = "**/decisions/**/*.md";

const FRONTMATTER_GLOBS = [TASK_FRONTMATTER_GLOB, DECISION_FRONTMATTER_GLOB];

const FRONTMATTER_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/coverage/**",
  "**/dist/**",
  "**/.arch/**",
];

const RISKY_PLAIN_SCALAR = /^(?:[-+]?\d+(?:\.\d+)?|0\d+|true|false|null|~|\d{4}-\d{2}-\d{2})$/i;

export const AUTO_FIXABLE_FRONTMATTER_CODES = [
  "TAB_INDENTATION",
  "TRAILING_WHITESPACE",
  "SCALAR_SAFETY",
] as const;

const TASK_SCALAR_GUARD_KEYS = new Set([
  "schemaVersion",
  "id",
  "slug",
  "title",
  "lane",
  "status",
  "createdAt",
  "updatedAt",
  "discoveredFromTask",
]);

const DECISION_SCALAR_GUARD_KEYS = new Set(["schemaVersion", "type", "id", "title", "status"]);

export async function listFrontmatterFiles(cwd = process.cwd()): Promise<string[]> {
  const files = await fg(FRONTMATTER_GLOBS, {
    cwd,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: FRONTMATTER_IGNORE,
  });
  return filterGlobPathsBySymlinkPolicy(files, cwd, { pathsAreAbsolute: true });
}

export async function lintFrontmatter(options?: {
  cwd?: string;
  fix?: boolean;
}): Promise<FrontmatterLintResult> {
  const cwd = options?.cwd ?? process.cwd();
  const fix = options?.fix === true;

  const files = await listFrontmatterFiles(cwd);

  const diagnostics: FrontmatterLintDiagnostic[] = [];
  let fixedFiles = 0;

  for (const filePath of files.sort()) {
    const relativePath = normalizeRelativePath(cwd, filePath);
    const artifactKind = inferArtifactKind(relativePath);
    if (!artifactKind) {
      continue;
    }

    let content = await fs.readFile(filePath, "utf8");
    let block = extractFrontmatterBlock(content);
    if (!block) {
      diagnostics.push({
        code: "FRONTMATTER_MISSING",
        severity: "error",
        message: "Missing YAML frontmatter block.",
        path: relativePath,
        line: 1,
      });
      continue;
    }

    if (fix) {
      const fixOutcome = applySafeFrontmatterAutoFixes(content, artifactKind);
      if (fixOutcome.changed) {
        await fs.writeFile(filePath, fixOutcome.updatedContent, "utf8");
        content = fixOutcome.updatedContent;
        block = extractFrontmatterBlock(content);
        fixedFiles += 1;
      }
    }

    if (!block) {
      diagnostics.push({
        code: "FRONTMATTER_MISSING",
        severity: "error",
        message: "Missing YAML frontmatter block.",
        path: relativePath,
        line: 1,
      });
      continue;
    }

    diagnostics.push(...lintFrontmatterBlock({ artifactKind, relativePath, block }));
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  return {
    ok: errorCount === 0,
    scannedFiles: files.length,
    fixedFiles,
    diagnostics,
  };
}

function lintFrontmatterBlock(context: LintRuleContext): FrontmatterLintDiagnostic[] {
  const diagnostics: FrontmatterLintDiagnostic[] = [];
  const { block, relativePath, artifactKind } = context;

  const frontmatterStartLine = block.openDelimiterLineIndex + 2;
  const frontmatterLines = block.lines.slice(
    block.openDelimiterLineIndex + 1,
    block.closeDelimiterLineIndex,
  );

  diagnostics.push(
    ...findTabIndentationDiagnostics(frontmatterLines, frontmatterStartLine, relativePath),
  );
  diagnostics.push(
    ...findTrailingWhitespaceDiagnostics(frontmatterLines, frontmatterStartLine, relativePath),
  );
  diagnostics.push(
    ...findRiskyPlainScalars(frontmatterLines, frontmatterStartLine, relativePath, artifactKind),
  );

  const yamlText = `${frontmatterLines.join("\n")}\n`;
  const parsed = parseYamlWithLineDiagnostics(yamlText, frontmatterStartLine, relativePath);
  diagnostics.push(...parsed.parseDiagnostics);

  if (parsed.parseDiagnostics.some((issue) => issue.severity === "error")) {
    return diagnostics;
  }

  diagnostics.push(
    ...findYamlKeyTypeDiagnostics(yamlText, frontmatterStartLine, relativePath, parsed.pathLineMap),
  );

  const schema = artifactKind === "task" ? taskSchema : decisionSchema;
  diagnostics.push(
    ...validateSchemaWithLineDiagnostics(
      parsed.data,
      schema,
      parsed.pathLineMap,
      relativePath,
      frontmatterStartLine,
    ),
  );

  return diagnostics;
}

export function inferArtifactKind(relativePath: string): ArtifactKind | null {
  if (/(^|\/)tasks\/.+\.md$/u.test(relativePath)) {
    return "task";
  }
  if (/(^|\/)decisions\/.+\.md$/u.test(relativePath)) {
    return "decision";
  }
  return null;
}

export function normalizeRelativePath(cwd: string, absolutePath: string): string {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

export function extractFrontmatterBlock(content: string): FrontmatterBlock | null {
  const lines = content.split(/\r?\n/u);
  if (!/^---\s*$/u.test(lines[0] ?? "")) {
    return null;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (/^(---|\.\.\.)\s*$/u.test(lines[index] ?? "")) {
      return {
        lines,
        openDelimiterLineIndex: 0,
        closeDelimiterLineIndex: index,
      };
    }
  }

  return null;
}

function findTabIndentationDiagnostics(
  frontmatterLines: string[],
  frontmatterStartLine: number,
  relativePath: string,
): FrontmatterLintDiagnostic[] {
  const diagnostics: FrontmatterLintDiagnostic[] = [];

  for (let index = 0; index < frontmatterLines.length; index += 1) {
    const line = frontmatterLines[index] ?? "";
    const leadingWhitespace = line.match(/^[ \t]*/u)?.[0] ?? "";
    if (!leadingWhitespace.includes("\t")) {
      continue;
    }

    diagnostics.push({
      code: "TAB_INDENTATION",
      severity: "error",
      message: "Tab indentation is not allowed in YAML frontmatter; use spaces.",
      path: relativePath,
      line: frontmatterStartLine + index,
    });
  }

  return diagnostics;
}

function findTrailingWhitespaceDiagnostics(
  frontmatterLines: string[],
  frontmatterStartLine: number,
  relativePath: string,
): FrontmatterLintDiagnostic[] {
  const diagnostics: FrontmatterLintDiagnostic[] = [];

  for (let index = 0; index < frontmatterLines.length; index += 1) {
    const line = frontmatterLines[index] ?? "";
    if (!/[ \t]+$/u.test(line)) {
      continue;
    }

    diagnostics.push({
      code: "TRAILING_WHITESPACE",
      severity: "warning",
      message: "Trailing whitespace in YAML frontmatter will be removed by --fix.",
      path: relativePath,
      line: frontmatterStartLine + index,
    });
  }

  return diagnostics;
}

function findRiskyPlainScalars(
  frontmatterLines: string[],
  frontmatterStartLine: number,
  relativePath: string,
  artifactKind: ArtifactKind,
): FrontmatterLintDiagnostic[] {
  const keysToGuard = artifactKind === "task" ? TASK_SCALAR_GUARD_KEYS : DECISION_SCALAR_GUARD_KEYS;

  const diagnostics: FrontmatterLintDiagnostic[] = [];

  for (let index = 0; index < frontmatterLines.length; index += 1) {
    const line = frontmatterLines[index] ?? "";
    const match = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*([^"'[{#].*?)\s*(?:#.*)?$/u);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (!keysToGuard.has(key)) {
      continue;
    }

    const rawValue = match[2].trim();
    if (!rawValue || rawValue === "null") {
      continue;
    }

    if (!RISKY_PLAIN_SCALAR.test(rawValue)) {
      continue;
    }

    diagnostics.push({
      code: "SCALAR_SAFETY",
      severity: "error",
      message: `Scalar value for '${key}' should be quoted to avoid YAML coercion.`,
      path: relativePath,
      line: frontmatterStartLine + index,
    });
  }

  return diagnostics;
}

function parseYamlWithLineDiagnostics(
  yamlText: string,
  frontmatterStartLine: number,
  relativePath: string,
): ParsedYaml {
  const lineCounter = new LineCounter();
  const document = parseDocument(yamlText, {
    lineCounter,
    prettyErrors: false,
    strict: false,
  });

  const parseDiagnostics: FrontmatterLintDiagnostic[] = [
    ...document.errors.map((error) => ({
      code: "YAML_PARSE_ERROR",
      severity: "error" as const,
      message: error.message,
      path: relativePath,
      line: lineFromYamlError(error, lineCounter, frontmatterStartLine),
    })),
    ...document.warnings.map((warning) => ({
      code: "YAML_PARSE_WARNING",
      severity: "warning" as const,
      message: warning.message,
      path: relativePath,
      line: lineFromYamlError(warning, lineCounter, frontmatterStartLine),
    })),
  ];

  return {
    data: document.toJS(),
    parseDiagnostics,
    pathLineMap: buildPathLineMap(document.contents, lineCounter, frontmatterStartLine),
  };
}

function lineFromYamlError(
  error: { linePos?: Array<{ line: number }>; pos?: [number, number] },
  lineCounter: LineCounter,
  frontmatterStartLine: number,
): number {
  const lineFromLinePos = error.linePos?.[0]?.line;
  if (typeof lineFromLinePos === "number") {
    return lineFromLinePos + frontmatterStartLine - 1;
  }

  const firstPos = error.pos?.[0];
  if (typeof firstPos === "number") {
    return lineCounter.linePos(firstPos).line + frontmatterStartLine - 1;
  }

  return frontmatterStartLine;
}

function findYamlKeyTypeDiagnostics(
  yamlText: string,
  frontmatterStartLine: number,
  relativePath: string,
  pathLineMap: Map<string, number>,
): FrontmatterLintDiagnostic[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(yamlText, {
    lineCounter,
    prettyErrors: false,
    strict: false,
  });

  const diagnostics: FrontmatterLintDiagnostic[] = [];

  function walk(node: unknown): void {
    if (isMap(node)) {
      for (const item of node.items) {
        const keyNode = item.key;
        const keyLine = lineForNode(keyNode, lineCounter, frontmatterStartLine);

        if (!isScalar(keyNode) || typeof keyNode.value !== "string") {
          diagnostics.push({
            code: "KEY_TYPE",
            severity: "error",
            message: "YAML mapping keys must be strings.",
            path: relativePath,
            line: keyLine,
          });
        }

        walk(item.value);
      }
      return;
    }

    if (isSeq(node)) {
      for (const item of node.items) {
        walk(item);
      }
    }
  }

  walk(document.contents);

  if (diagnostics.length > 0) {
    return diagnostics;
  }

  const topLevel = pathLineMap.get(pathKey([]));
  if (topLevel === undefined && document.contents && !isMap(document.contents)) {
    diagnostics.push({
      code: "KEY_TYPE",
      severity: "error",
      message: "Frontmatter root must be a YAML mapping.",
      path: relativePath,
      line: frontmatterStartLine,
    });
  }

  return diagnostics;
}

function validateSchemaWithLineDiagnostics(
  data: unknown,
  schema: z.ZodTypeAny,
  pathLineMap: Map<string, number>,
  relativePath: string,
  fallbackLine: number,
): FrontmatterLintDiagnostic[] {
  const result = schema.safeParse(data);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => {
    const missingRequired = issue.code === "invalid_type" && issue.received === "undefined";
    const issuePath = issue.path;

    return {
      code: missingRequired ? "MISSING_REQUIRED_KEY" : "SCHEMA_TYPE",
      severity: "error" as const,
      message: missingRequired
        ? `Missing required key '${issuePath.join(".")}'.`
        : formatSchemaIssue(issue),
      path: relativePath,
      line: resolveIssueLine(issuePath, pathLineMap, fallbackLine),
    };
  });
}

function formatSchemaIssue(issue: z.ZodIssue): string {
  const pathText = issue.path.length > 0 ? issue.path.join(".") : "<root>";
  return `${pathText}: ${issue.message}`;
}

function buildPathLineMap(
  node: unknown,
  lineCounter: LineCounter,
  frontmatterStartLine: number,
): Map<string, number> {
  const map = new Map<string, number>();

  function walk(current: unknown, currentPath: Array<string | number>): void {
    map.set(pathKey(currentPath), lineForNode(current, lineCounter, frontmatterStartLine));

    if (isMap(current)) {
      for (const item of current.items) {
        const keyNode = item.key;
        if (!isScalar(keyNode) || typeof keyNode.value !== "string") {
          continue;
        }
        walk(item.value, [...currentPath, keyNode.value]);
      }
      return;
    }

    if (isSeq(current)) {
      current.items.forEach((item, index) => {
        walk(item, [...currentPath, index]);
      });
    }
  }

  if (node !== null && node !== undefined) {
    walk(node, []);
  }

  return map;
}

function lineForNode(
  node: unknown,
  lineCounter: LineCounter,
  frontmatterStartLine: number,
): number {
  const start =
    node &&
    typeof node === "object" &&
    "range" in node &&
    Array.isArray((node as { range: number[] }).range)
      ? (node as { range: number[] }).range[0]
      : undefined;

  if (typeof start === "number") {
    return lineCounter.linePos(start).line + frontmatterStartLine - 1;
  }

  return frontmatterStartLine;
}

function resolveIssueLine(
  issuePath: Array<string | number>,
  pathLineMap: Map<string, number>,
  fallbackLine: number,
): number {
  for (let index = issuePath.length; index >= 0; index -= 1) {
    const key = pathKey(issuePath.slice(0, index));
    const line = pathLineMap.get(key);
    if (line !== undefined) {
      return line;
    }
  }
  return fallbackLine;
}

function pathKey(parts: Array<string | number>): string {
  return JSON.stringify(parts);
}

export function applySafeFrontmatterAutoFixes(
  content: string,
  artifactKind: ArtifactKind,
): FrontmatterAutoFixOutcome {
  const block = extractFrontmatterBlock(content);
  if (!block) {
    return { changed: false, updatedContent: content, appliedCodes: [] };
  }

  const frontmatterLines = block.lines.slice(
    block.openDelimiterLineIndex + 1,
    block.closeDelimiterLineIndex,
  );
  const appliedCodes = new Set<string>();

  const normalized = frontmatterLines.map((line) => {
    let next = line;

    const indentationFixed = next.replace(/^[ \t]+/u, (leading) => leading.replace(/\t/g, "  "));
    if (indentationFixed !== next) {
      appliedCodes.add("TAB_INDENTATION");
      next = indentationFixed;
    }

    const trailingWhitespaceFixed = next.replace(/[ \t]+$/u, "");
    if (trailingWhitespaceFixed !== next) {
      appliedCodes.add("TRAILING_WHITESPACE");
      next = trailingWhitespaceFixed;
    }

    const riskyScalarQuoted = quoteRiskyScalarLine(next, artifactKind);
    if (riskyScalarQuoted !== next) {
      appliedCodes.add("SCALAR_SAFETY");
      next = riskyScalarQuoted;
    }

    return next;
  });

  const changed = normalized.some((line, index) => line !== frontmatterLines[index]);
  if (!changed) {
    return { changed: false, updatedContent: content, appliedCodes: [] };
  }

  const updatedLines = [...block.lines];
  updatedLines.splice(
    block.openDelimiterLineIndex + 1,
    block.closeDelimiterLineIndex - block.openDelimiterLineIndex - 1,
    ...normalized,
  );

  return {
    changed: true,
    updatedContent: updatedLines.join("\n"),
    appliedCodes: [...appliedCodes],
  };
}

function quoteRiskyScalarLine(line: string, artifactKind: ArtifactKind): string {
  const match = line.match(/^([ \t]*)([A-Za-z_][\w-]*)(\s*:\s*)([^"'[{#].*?)(\s*(?:#.*)?)$/u);
  if (!match) {
    return line;
  }

  const [, indent, key, separator, rawValueWithPadding, suffix] = match;
  const keysToGuard = artifactKind === "task" ? TASK_SCALAR_GUARD_KEYS : DECISION_SCALAR_GUARD_KEYS;
  if (!keysToGuard.has(key)) {
    return line;
  }

  const rawValue = rawValueWithPadding.trim();
  if (!rawValue || rawValue === "null" || !RISKY_PLAIN_SCALAR.test(rawValue)) {
    return line;
  }

  return `${indent}${key}${separator}"${rawValue.replace(/"/g, '\\"')}"${suffix}`;
}
