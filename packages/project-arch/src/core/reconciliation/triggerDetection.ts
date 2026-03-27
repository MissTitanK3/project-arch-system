import path from "path";
import { pathExists, readJson } from "../../utils/fs";
import { ReconciliationStatus } from "../../schemas/reconciliationReport";
import {
  ChangeType,
  ExcludeRule,
  IncludeRule,
  OverrideRule,
  ReconcileConfig,
  reconcileConfigSchema,
} from "../../schemas/reconcileConfig";

// ---------------------------------------------------------------------------
// Trigger signal inputs
// ---------------------------------------------------------------------------

export interface TriggerSignals {
  /** Relative file paths changed or targeted by this task. */
  changedFiles: string[];
  /** The task's current status string. */
  taskStatus: string;
  /** The task's declared codeTargets. */
  codeTargets: string[];
  /** The task's traceLinks. */
  traceLinks: string[];
  /** The task's evidence entries. */
  evidence: string[];
  /** The task's tags. */
  tags: string[];
}

// ---------------------------------------------------------------------------
// Custom trigger config (optional, repo-local)
// ---------------------------------------------------------------------------

export const RECONCILE_CONFIG_PATH = ".project-arch/reconcile.config.json";
const LEGACY_RECONCILE_CONFIG_PATH = ".project-arch/reconcile-config.json";

const CONFIG_PATH_CANDIDATES = [RECONCILE_CONFIG_PATH, LEGACY_RECONCILE_CONFIG_PATH];

export async function findReconcileConfigPath(cwd = process.cwd()): Promise<string | null> {
  for (const candidate of CONFIG_PATH_CANDIDATES) {
    const absPath = path.join(cwd, candidate);
    if (await pathExists(absPath)) {
      return absPath;
    }
  }

  return null;
}

export async function loadReconcileConfig(cwd = process.cwd()): Promise<ReconcileConfig | null> {
  const configPath = await findReconcileConfigPath(cwd);
  if (!configPath) {
    return null;
  }

  const raw = await readJson<unknown>(configPath);
  const parsed = reconcileConfigSchema.parse(raw);

  for (const rule of [...parsed.triggers.include, ...parsed.triggers.exclude]) {
    if (rule.pathPattern) {
      try {
        new RegExp(rule.pathPattern, "i");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const wrapped = new Error(
          `Invalid pathPattern regex '${rule.pathPattern}' in reconcile config: ${detail}`,
        );
        (wrapped as Error & { cause?: unknown }).cause = error;
        throw wrapped;
      }
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Built-in trigger predicates
// ---------------------------------------------------------------------------

interface TriggerResult {
  name: string;
  fired: boolean;
  level: "required" | "suggested" | "none";
  reason: string;
  files: string[];
  domains: string[];
  changeTypes: ChangeType[];
}

function matchesAny(files: string[], patterns: RegExp[]): boolean {
  return files.some((f) => patterns.some((p) => p.test(f)));
}

function collectDomains(signals: TriggerSignals): string[] {
  const domains = new Set<string>();
  for (const tag of signals.tags) {
    const match = /^domain:(.+)$/i.exec(tag.trim());
    if (match?.[1]) {
      domains.add(match[1].toLowerCase());
    }
  }
  return [...domains];
}

function classifyPathChangeTypes(filePath: string): ChangeType[] {
  const types = new Set<ChangeType>();
  if (/^architecture\//i.test(filePath) || /\/architecture\//i.test(filePath)) {
    types.add("architecture");
  }
  if (/^arch-domains\//i.test(filePath) || /^arch-model\//i.test(filePath)) {
    types.add("module-boundary");
  }
  if (/\/schemas\//i.test(filePath) || /schema\.(ts|js|json)$/i.test(filePath)) {
    types.add("schema-contract");
  }
  if (/concept-map\.json$/i.test(filePath) || /terminology/i.test(filePath)) {
    types.add("terminology");
  }
  if (/milestone/i.test(filePath)) {
    types.add("milestone");
  }
  if (/\.(md|mdx)$/i.test(filePath)) {
    types.add("docs");
  } else {
    types.add("code");
  }
  return [...types];
}

function buildGlobalChangeTypes(files: string[]): ChangeType[] {
  const all = new Set<ChangeType>();
  for (const file of files) {
    for (const t of classifyPathChangeTypes(file)) {
      all.add(t);
    }
  }
  return [...all];
}

interface RuleContext {
  triggerName: string;
  files: string[];
  domains: string[];
  changeTypes: ChangeType[];
}

function matchRule(
  rule: Pick<IncludeRule | ExcludeRule, "trigger" | "pathPattern" | "domain" | "changeType">,
  context: RuleContext,
): boolean {
  if (rule.trigger && rule.trigger !== context.triggerName) {
    return false;
  }

  if (rule.domain && !context.domains.includes(rule.domain.toLowerCase())) {
    return false;
  }

  if (rule.changeType && !context.changeTypes.includes(rule.changeType)) {
    return false;
  }

  if (rule.pathPattern) {
    const re = new RegExp(rule.pathPattern, "i");
    if (!context.files.some((file) => re.test(file))) {
      return false;
    }
  }

  return true;
}

function applyExcludeRules(base: TriggerResult[], rules: ExcludeRule[]): TriggerResult[] {
  if (rules.length === 0) {
    return base;
  }

  return base.map((trigger) => {
    let nextLevel = trigger.level;
    const context: RuleContext = {
      triggerName: trigger.name,
      files: trigger.files,
      domains: trigger.domains,
      changeTypes: trigger.changeTypes,
    };

    for (const rule of rules) {
      if (!matchRule(rule, context)) {
        continue;
      }
      nextLevel = rule.downgradeTo;
    }

    return { ...trigger, level: nextLevel };
  });
}

function applyOverrideRules(base: TriggerResult[], rules: OverrideRule[]): TriggerResult[] {
  if (rules.length === 0) {
    return base;
  }

  return base.map((trigger) => {
    const override = rules.find((rule) => rule.trigger === trigger.name);
    if (!override) {
      return trigger;
    }
    return {
      ...trigger,
      level: override.status,
      reason: `${trigger.reason} (overridden to ${override.status} by config)`,
    };
  });
}

function buildIncludeTriggers(
  rules: IncludeRule[],
  allFiles: string[],
  domains: string[],
  globalChangeTypes: ChangeType[],
): TriggerResult[] {
  const results: TriggerResult[] = [];

  for (const [index, rule] of rules.entries()) {
    const context: RuleContext = {
      triggerName: rule.trigger ?? `include-${index + 1}`,
      files: allFiles,
      domains,
      changeTypes: globalChangeTypes,
    };

    if (!matchRule(rule, context)) {
      continue;
    }

    results.push({
      name: `include:${index + 1}`,
      fired: true,
      level: rule.status ?? "required",
      reason: `Config include rule ${index + 1} matched`,
      files: allFiles,
      domains,
      changeTypes: globalChangeTypes,
    });
  }

  return results;
}

function evaluateBuiltInTriggers(signals: TriggerSignals): TriggerResult[] {
  const all = [...signals.changedFiles, ...signals.codeTargets];
  const domains = collectDomains(signals);

  return [
    {
      name: "architecture-surface",
      fired: matchesAny(all, [/^architecture\//i, /\/architecture\//i]),
      level: "required",
      reason: "Architecture surface files changed",
      files: all,
      domains,
      changeTypes: ["architecture"],
    },
    {
      name: "module-boundary",
      fired: matchesAny(all, [
        /^arch-domains\//i,
        /\/arch-domains\//i,
        /^arch-model\//i,
        /\/arch-model\//i,
      ]),
      level: "required",
      reason: "Module boundary or domain model files changed",
      files: all,
      domains,
      changeTypes: ["module-boundary"],
    },
    {
      name: "schema-contract",
      fired: matchesAny(all, [
        /\/schemas\//i,
        /schema\.(ts|js|json)$/i,
        /\.schema\.(ts|js|json)$/i,
        /\/api\//i,
        /contract/i,
      ]),
      level: "required",
      reason: "Schema or contract files changed",
      files: all,
      domains,
      changeTypes: ["schema-contract"],
    },
    {
      name: "terminology",
      fired:
        matchesAny(all, [/concept-map\.json$/i, /terminology/i]) ||
        signals.tags.includes("terminology"),
      level: "required",
      reason: "Terminology or concept map changed",
      files: all,
      domains,
      changeTypes: ["terminology"],
    },
    {
      name: "milestone-target",
      fired: signals.taskStatus === "done" && signals.traceLinks.some((l) => /milestone/i.test(l)),
      level: "required",
      reason: "Task completed a milestone target",
      files: [...all, ...signals.traceLinks],
      domains,
      changeTypes: ["milestone"],
    },
    {
      name: "unresolved-drift",
      fired:
        signals.taskStatus === "done" &&
        signals.codeTargets.length > 0 &&
        signals.evidence.length === 0,
      level: "suggested",
      reason: "Task has code targets but no evidence of reconciliation",
      files: all,
      domains,
      changeTypes: ["drift"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TriggerDetectionResult {
  status: ReconciliationStatus;
  firedTriggers: Array<{ name: string; level: "required" | "suggested"; reason: string }>;
}

export async function detectReconciliationTriggers(
  signals: TriggerSignals,
  cwd = process.cwd(),
): Promise<TriggerDetectionResult> {
  const config = await loadReconcileConfig(cwd);

  const allFiles = [...signals.changedFiles, ...signals.codeTargets];
  const domains = collectDomains(signals);
  const globalChangeTypes = buildGlobalChangeTypes(allFiles);

  const builtInFired = evaluateBuiltInTriggers(signals).filter((t) => t.fired);

  const downgraded = applyExcludeRules(builtInFired, config?.triggers.exclude ?? []);
  const overridden = applyOverrideRules(downgraded, config?.triggers.overrides ?? []);

  const includeTriggers = buildIncludeTriggers(
    config?.triggers.include ?? [],
    allFiles,
    domains,
    globalChangeTypes,
  );

  const allFired = [...overridden, ...includeTriggers];

  const effective = allFired.filter((item) => item.level !== "none");

  const firedTriggers: Array<{ name: string; level: "required" | "suggested"; reason: string }> =
    effective.map(({ name, level, reason }) => ({
      name,
      level: level === "required" ? "required" : "suggested",
      reason,
    }));

  const hasRequired = effective.some((t) => t.level === "required");
  const hasSuggested = effective.some((t) => t.level === "suggested");

  let status: ReconciliationStatus;
  if (hasRequired) {
    status = "reconciliation required";
  } else if (hasSuggested) {
    status = "reconciliation suggested";
  } else {
    status = "no reconciliation needed";
  }

  return { status, firedTriggers };
}
