import path from "path";
import fs from "fs-extra";
import { loadSkills } from "../core/agents/loadSkills";
import { createUserSkill } from "../core/agents/newSkill";
import { resolveSkills } from "../core/agents/resolveSkills";
import { syncRegistry } from "../core/agents/syncRegistry";
import { AgentSkillRegistryEntry } from "../schemas/agentSkill";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

type AgentSkillDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: string | null;
  hint: string | null;
};

function toPosixRelative(base: string, target: string): string {
  return path.relative(base, target).replace(/\\/g, "/");
}

function buildAgentDiagnostic(input: AgentSkillDiagnostic): AgentSkillDiagnostic {
  return input;
}

function diagnosticsToStrings(
  diagnostics: AgentSkillDiagnostic[],
  severity: "error" | "warning",
): string[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`);
}

function mapAgentsValidationError(cwd: string, error: unknown): AgentSkillDiagnostic {
  const message = error instanceof Error ? error.message : String(error);

  let match = message.match(/^Missing skill manifest: (.+)$/u);
  if (match) {
    return buildAgentDiagnostic({
      code: "PAS_SKILL_MISSING_MANIFEST",
      severity: "error",
      message: "Skill directory is missing required skill.json manifest.",
      path: match[1],
      hint: "Add skill.json or remove the incomplete skill directory.",
    });
  }

  match = message.match(/^Invalid skill manifest (.+?) \((.+?)\): (.+)$/u);
  if (match) {
    return buildAgentDiagnostic({
      code: "PAS_SKILL_INVALID_MANIFEST",
      severity: "error",
      message: `Invalid skill manifest field '${match[2]}': ${match[3]}`,
      path: match[1],
      hint: "Fix the manifest schema violation and re-run pa agents check.",
    });
  }

  match = message.match(/^Skill source mismatch in (.+?): expected '(.+)', found '(.+)'\.$/u);
  if (match) {
    return buildAgentDiagnostic({
      code: "PAS_SKILL_SOURCE_MISMATCH",
      severity: "error",
      message: `Skill source mismatch: expected '${match[2]}', found '${match[3]}'.`,
      path: match[1],
      hint: "Move the skill to the correct tree or update manifest.source.",
    });
  }

  match = message.match(/^Duplicate (builtin|user) skill id: (.+)$/u);
  if (match) {
    return buildAgentDiagnostic({
      code: "PAS_SKILL_DUPLICATE_SOURCE_ID",
      severity: "error",
      message: `Duplicate ${match[1]} skill id '${match[2]}' detected.`,
      path: null,
      hint: "Each source tree must contain at most one directory per skill id.",
    });
  }

  match = message.match(/^Duplicate skill id without explicit override: (.+?)\./u);
  if (match) {
    return buildAgentDiagnostic({
      code: "PAS_SKILL_OVERRIDE_REQUIRED",
      severity: "error",
      message: `User skill '${match[1]}' reuses a built-in id without overrides=true.`,
      path: null,
      hint: "Set overrides=true in the user skill manifest or choose a distinct id.",
    });
  }

  return buildAgentDiagnostic({
    code: "PAS_SKILL_VALIDATION_ERROR",
    severity: "error",
    message,
    path: null,
    hint: "Review the agents-of-arch skill tree and re-run pa agents check.",
  });
}

function toRegistryEntries(
  projectRoot: string,
  resolved: ReturnType<typeof resolveSkills>,
): AgentSkillRegistryEntry[] {
  return resolved.map((entry) => ({
    id: entry.id,
    source: entry.source,
    name: entry.value.manifest.name,
    version: entry.value.manifest.version,
    summary: entry.value.manifest.summary,
    directory: toPosixRelative(projectRoot, entry.value.skillDir),
    files: entry.value.manifest.files,
    tags: entry.value.manifest.tags ?? [],
    overrides: entry.value.manifest.overrides ?? false,
  }));
}

export async function agentsList(input: { cwd?: string } = {}): Promise<
  OperationResult<{
    skills: AgentSkillRegistryEntry[];
  }>
> {
  return wrap(async () => {
    const cwd = input.cwd ?? process.cwd();
    const loaded = await loadSkills(cwd);
    const resolved = resolveSkills(loaded);
    return {
      skills: toRegistryEntries(cwd, resolved),
    };
  });
}

export async function agentsShow(input: { id: string; cwd?: string }): Promise<
  OperationResult<{
    skill: AgentSkillRegistryEntry;
  }>
> {
  return wrap(async () => {
    const cwd = input.cwd ?? process.cwd();
    const loaded = await loadSkills(cwd);
    const resolved = resolveSkills(loaded);
    const entries = toRegistryEntries(cwd, resolved);
    const skill = entries.find((entry) => entry.id === input.id);

    if (!skill) {
      throw new Error(`Skill not found: ${input.id}`);
    }

    return { skill };
  });
}

export async function agentsNew(input: {
  id: string;
  title?: string;
  summary?: string;
  overrides?: boolean;
  tags?: string[];
  cwd?: string;
}): Promise<
  OperationResult<{
    skillDir: string;
    manifestPath: string;
    systemPath: string;
    checklistPath: string;
  }>
> {
  return wrap(async () => {
    const cwd = input.cwd ?? process.cwd();
    return createUserSkill(cwd, {
      id: input.id,
      title: input.title,
      summary: input.summary,
      overrides: input.overrides,
      tags: input.tags,
    });
  });
}

export async function agentsSync(input: { check?: boolean; cwd?: string } = {}): Promise<
  OperationResult<{
    stale: boolean;
    changed: boolean;
    registryPath: string;
    skillCount: number;
  }>
> {
  return wrap(async () => {
    const cwd = input.cwd ?? process.cwd();
    return syncRegistry(cwd, { check: input.check });
  });
}

export async function agentsCheck(input: { cwd?: string } = {}): Promise<
  OperationResult<{
    ok: boolean;
    errors: string[];
    warnings: string[];
    diagnostics: AgentSkillDiagnostic[];
  }>
> {
  return wrap(async () => {
    const cwd = input.cwd ?? process.cwd();
    let diagnostics: AgentSkillDiagnostic[] = [];
    let resolved: ReturnType<typeof resolveSkills> = [];

    try {
      const loaded = await loadSkills(cwd);
      resolved = resolveSkills(loaded);
    } catch (error) {
      diagnostics = [mapAgentsValidationError(cwd, error)];
    }

    for (const entry of resolved) {
      const manifest = entry.value.manifest;
      const systemPath = path.join(entry.value.skillDir, manifest.files.system);
      const checklistPath = path.join(entry.value.skillDir, manifest.files.checklist);
      const expectedDirName = manifest.id;
      const actualDirName = path.basename(entry.value.skillDir);

      if (expectedDirName !== actualDirName) {
        diagnostics.push({
          code: "PAS_SKILL_DIRECTORY_ID_MISMATCH",
          severity: "error",
          message: `Skill directory '${actualDirName}' does not match manifest id '${expectedDirName}'.`,
          path: toPosixRelative(cwd, entry.value.skillDir),
          hint: "Rename the directory or update skill.json.id so they match exactly.",
        });
      }

      if (!(await fs.pathExists(systemPath))) {
        diagnostics.push({
          code: "PAS_SKILL_MISSING_SYSTEM_FILE",
          severity: "error",
          message: `Missing system file for skill '${entry.id}'.`,
          path: toPosixRelative(cwd, systemPath),
          hint: "Create the referenced system markdown file or update files.system.",
        });
      }

      if (!(await fs.pathExists(checklistPath))) {
        diagnostics.push({
          code: "PAS_SKILL_MISSING_CHECKLIST_FILE",
          severity: "error",
          message: `Missing checklist file for skill '${entry.id}'.`,
          path: toPosixRelative(cwd, checklistPath),
          hint: "Create the referenced checklist markdown file or update files.checklist.",
        });
      }
    }

    diagnostics.sort((left, right) => {
      if ((left.path ?? "") === (right.path ?? "")) {
        return left.code.localeCompare(right.code);
      }
      return (left.path ?? "").localeCompare(right.path ?? "");
    });

    const errors = diagnosticsToStrings(diagnostics, "error");
    const warnings = diagnosticsToStrings(diagnostics, "warning");

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      diagnostics,
    };
  });
}
