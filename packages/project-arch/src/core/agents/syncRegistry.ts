import path from "path";
import fs from "fs-extra";
import { writeJsonDeterministicIfChanged } from "../../utils/fs";
import { AgentSkillRegistry, agentSkillRegistrySchema } from "../../schemas/agentSkillRegistry";
import { loadSkills } from "./loadSkills";
import { resolveSkills } from "./resolveSkills";

export interface SyncRegistryOptions {
  archAgentsDir?: string;
  check?: boolean;
  now?: Date;
}

export interface SyncRegistryResult {
  stale: boolean;
  changed: boolean;
  registryPath: string;
  skillCount: number;
}

function stableSkillPayload(
  resolved: ReturnType<typeof resolveSkills>,
  projectRoot: string,
): AgentSkillRegistry["skills"] {
  return resolved.map((entry) => ({
    id: entry.id,
    source: entry.source,
    name: entry.value.manifest.name,
    version: entry.value.manifest.version,
    summary: entry.value.manifest.summary,
    directory: path.relative(projectRoot, entry.value.skillDir).replace(/\\/g, "/"),
    files: entry.value.manifest.files,
    tags: entry.value.manifest.tags ?? [],
    overrides: entry.value.manifest.overrides ?? false,
  }));
}

function areSkillsEqual(
  left: AgentSkillRegistry["skills"],
  right: AgentSkillRegistry["skills"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadExistingRegistry(registryPath: string): Promise<AgentSkillRegistry | null> {
  if (!(await fs.pathExists(registryPath))) {
    return null;
  }

  try {
    const parsed = await fs.readJSON(registryPath);
    return agentSkillRegistrySchema.parse(parsed);
  } catch {
    return null;
  }
}

export async function syncRegistry(
  projectRoot = process.cwd(),
  options: SyncRegistryOptions = {},
): Promise<SyncRegistryResult> {
  const agentsRoot = options.archAgentsDir ?? path.join(projectRoot, ".arch", "agents-of-arch");
  const registryPath = path.join(agentsRoot, "registry.json");

  const loaded = await loadSkills(projectRoot, { archAgentsDir: agentsRoot });
  const resolved = resolveSkills(loaded);
  const nextSkills = stableSkillPayload(resolved, projectRoot);

  const existing = await loadExistingRegistry(registryPath);
  const hasSameSkills = existing ? areSkillsEqual(existing.skills, nextSkills) : false;

  const generatedAt = hasSameSkills
    ? existing!.generatedAt
    : (options.now ?? new Date()).toISOString();

  const nextRegistry = agentSkillRegistrySchema.parse({
    schemaVersion: "1.0",
    generatedAt,
    skills: nextSkills,
  });

  const stale = !existing || !hasSameSkills;

  if (options.check) {
    return {
      stale,
      changed: false,
      registryPath,
      skillCount: nextSkills.length,
    };
  }

  const changed = await writeJsonDeterministicIfChanged(registryPath, nextRegistry);

  return {
    stale,
    changed,
    registryPath,
    skillCount: nextSkills.length,
  };
}
