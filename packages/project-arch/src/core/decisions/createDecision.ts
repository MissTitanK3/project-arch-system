import path from "path";
import {
  appendDecisionToIndex,
  decisionMarkdownPath,
  loadDecisionIndex,
  milestoneDecisionIndexDir,
  phaseDecisionIndexDir,
  projectDecisionIndexDir,
  rebuildArchitectureGraph,
} from "../../graph/manifests";
import { buildDecisionId, DecisionScope } from "../../core/ids/decision";
import { defaultDecisionBody, defaultDecisionFrontmatter } from "../../core/templates/decision";
import { decisionStatusSchema, decisionSchema } from "../../schemas/decision";
import { pathExists, readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../fs";
import { projectDocsRoot } from "../../utils/paths";
import { assertSafeId } from "../../utils/safeId";

export interface NewDecisionOptions {
  scope?: "project" | "phase" | "milestone";
  phase?: string;
  milestone?: string;
  slug?: string;
  title?: string;
}

function normalizeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "decision"
  );
}

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  if (!(await pathExists(projectDocsRoot(cwd)))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
}

function parseScopeFromOptions(options: NewDecisionOptions): DecisionScope {
  const scope = options.scope ?? "project";
  if (scope === "project") {
    return { kind: "project" };
  }
  if (scope === "phase") {
    if (!options.phase) {
      throw new Error("--phase is required when --scope phase");
    }
    assertSafeId(options.phase, "phaseId");
    return { kind: "phase", phaseId: options.phase };
  }
  if (!options.phase || !options.milestone) {
    throw new Error("--phase and --milestone are required when --scope milestone");
  }
  assertSafeId(options.phase, "phaseId");
  assertSafeId(options.milestone, "milestoneId");
  return { kind: "milestone", phaseId: options.phase, milestoneId: options.milestone };
}

async function loadDecision(
  decisionId: string,
  cwd = process.cwd(),
): Promise<{ filePath: string; frontmatter: Record<string, unknown>; content: string }> {
  const filePath = decisionMarkdownPath(decisionId, cwd);
  if (!(await pathExists(filePath))) {
    throw new Error(`Decision '${decisionId}' not found`);
  }
  const parsed = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);
  decisionSchema.parse(parsed.data);
  return { filePath, frontmatter: parsed.data, content: parsed.content };
}

async function saveDecision(
  decisionId: string,
  frontmatter: Record<string, unknown>,
  content: string,
  cwd = process.cwd(),
): Promise<void> {
  decisionSchema.parse(frontmatter);
  await writeMarkdownWithFrontmatter(decisionMarkdownPath(decisionId, cwd), frontmatter, content);
}

function scopeIndexDir(scope: DecisionScope, cwd = process.cwd()): string {
  if (scope.kind === "project") {
    return projectDecisionIndexDir(cwd);
  }
  if (scope.kind === "phase") {
    return phaseDecisionIndexDir(scope.phaseId, cwd);
  }
  return milestoneDecisionIndexDir(scope.phaseId, scope.milestoneId, cwd);
}

export async function createDecision(
  options: NewDecisionOptions,
  cwd = process.cwd(),
): Promise<string> {
  await assertInitialized(cwd);
  const scope = parseScopeFromOptions(options);
  const slug = normalizeSlug(options.slug ?? "decision");
  const title = options.title ?? "Decision";

  let decisionId = buildDecisionId(scope, slug);
  let filePath = decisionMarkdownPath(decisionId, cwd);
  let counter = 2;
  while (await pathExists(filePath)) {
    decisionId = buildDecisionId(scope, `${slug}-${counter}`);
    filePath = decisionMarkdownPath(decisionId, cwd);
    counter += 1;
  }

  await appendDecisionToIndex(projectDecisionIndexDir(cwd), decisionId);
  await appendDecisionToIndex(scopeIndexDir(scope, cwd), decisionId);

  const frontmatter = defaultDecisionFrontmatter({ id: decisionId, title, scope });
  await writeMarkdownWithFrontmatter(filePath, frontmatter, defaultDecisionBody());
  await rebuildArchitectureGraph(cwd);
  return path.relative(cwd, filePath);
}

export async function linkDecision(
  decisionId: string,
  options: { task?: string; code?: string; doc?: string },
  cwd = process.cwd(),
): Promise<void> {
  await assertInitialized(cwd);
  const existing = await loadDecision(decisionId, cwd);
  const parsed = decisionSchema.parse(existing.frontmatter);

  if (!options.task && !options.code && !options.doc) {
    throw new Error("Provide at least one of --task, --code, --doc");
  }

  if (options.task && !parsed.links.tasks.includes(options.task))
    parsed.links.tasks.push(options.task);
  if (options.code && !parsed.links.codeTargets.includes(options.code))
    parsed.links.codeTargets.push(options.code);
  if (options.doc && !parsed.links.publicDocs.includes(options.doc))
    parsed.links.publicDocs.push(options.doc);

  parsed.links.tasks.sort();
  parsed.links.codeTargets.sort();
  parsed.links.publicDocs.sort();

  await saveDecision(decisionId, parsed, existing.content, cwd);
  await rebuildArchitectureGraph(cwd);
}

export async function setDecisionStatus(
  decisionId: string,
  status: string,
  cwd = process.cwd(),
): Promise<string> {
  await assertInitialized(cwd);
  const existing = await loadDecision(decisionId, cwd);
  const parsed = decisionSchema.parse(existing.frontmatter);
  parsed.status = decisionStatusSchema.parse(status);
  await saveDecision(decisionId, parsed, existing.content, cwd);
  await rebuildArchitectureGraph(cwd);
  return parsed.status;
}

export async function supersedeDecision(
  decisionId: string,
  supersededDecisionId: string,
  cwd = process.cwd(),
): Promise<void> {
  await assertInitialized(cwd);

  const active = await loadDecision(decisionId, cwd);
  const activeParsed = decisionSchema.parse(active.frontmatter);
  const old = await loadDecision(supersededDecisionId, cwd);
  const oldParsed = decisionSchema.parse(old.frontmatter);

  oldParsed.status = "superseded";
  await saveDecision(supersededDecisionId, oldParsed, old.content, cwd);

  const supersedes = new Set(activeParsed.supersedes ?? []);
  supersedes.add(supersededDecisionId);
  activeParsed.supersedes = [...supersedes].sort();
  if (activeParsed.status === "proposed") {
    activeParsed.status = "accepted";
  }
  await saveDecision(decisionId, activeParsed, active.content, cwd);
  await rebuildArchitectureGraph(cwd);
}

export async function listDecisions(
  cwd = process.cwd(),
): Promise<Array<{ id: string; status: string }>> {
  await assertInitialized(cwd);
  const index = await loadDecisionIndex(projectDecisionIndexDir(cwd));
  const result: Array<{ id: string; status: string }> = [];

  for (const id of index.decisions.sort()) {
    const decisionPath = decisionMarkdownPath(id, cwd);
    if (!(await pathExists(decisionPath))) {
      result.push({ id, status: "missing" });
      continue;
    }
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(decisionPath);
    const parsed = decisionSchema.parse(data);
    result.push({ id: parsed.id, status: parsed.status });
  }

  return result;
}
