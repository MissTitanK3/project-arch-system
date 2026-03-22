import path from "path";
import fs from "fs-extra";
import { AgentSkill, agentSkillSchema } from "../../schemas/agentSkill";

export interface LoadedSkill {
  source: "builtin" | "user";
  skillDir: string;
  relativeDir: string;
  manifestPath: string;
  manifest: AgentSkill;
}

export interface LoadedSkills {
  builtin: LoadedSkill[];
  user: LoadedSkill[];
}

export class SkillLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillLoadError";
  }
}

export interface LoadSkillsOptions {
  archAgentsDir?: string;
}

function toPosixRelative(base: string, target: string): string {
  return path.relative(base, target).replace(/\\/g, "/");
}

async function readSkillDirectories(rootDir: string): Promise<string[]> {
  const exists = await fs.pathExists(rootDir);
  if (!exists) {
    return [];
  }

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(rootDir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function loadSkillFromDirectory(
  projectRoot: string,
  directory: string,
  source: "builtin" | "user",
): Promise<LoadedSkill> {
  const manifestPath = path.join(directory, "skill.json");

  if (!(await fs.pathExists(manifestPath))) {
    throw new SkillLoadError(
      `Missing skill manifest: ${toPosixRelative(projectRoot, manifestPath)}`,
    );
  }

  const raw = await fs.readJSON(manifestPath);
  const parsed = agentSkillSchema.safeParse(raw);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const issuePath = issue.path.length > 0 ? issue.path.join(".") : "root";
    throw new SkillLoadError(
      `Invalid skill manifest ${toPosixRelative(projectRoot, manifestPath)} (${issuePath}): ${issue.message}`,
    );
  }

  if (parsed.data.source !== source) {
    throw new SkillLoadError(
      `Skill source mismatch in ${toPosixRelative(projectRoot, manifestPath)}: expected '${source}', found '${parsed.data.source}'.`,
    );
  }

  return {
    source,
    skillDir: directory,
    relativeDir: toPosixRelative(projectRoot, directory),
    manifestPath,
    manifest: parsed.data,
  };
}

async function loadSkillSet(
  projectRoot: string,
  skillsRoot: string,
  source: "builtin" | "user",
): Promise<LoadedSkill[]> {
  const directories = await readSkillDirectories(skillsRoot);
  const loaded = await Promise.all(
    directories.map((directory) => loadSkillFromDirectory(projectRoot, directory, source)),
  );

  return loaded.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}

export async function loadSkills(
  projectRoot = process.cwd(),
  options: LoadSkillsOptions = {},
): Promise<LoadedSkills> {
  const agentsRoot = options.archAgentsDir ?? path.join(projectRoot, ".arch", "agents-of-arch");

  return {
    builtin: await loadSkillSet(projectRoot, path.join(agentsRoot, "skills"), "builtin"),
    user: await loadSkillSet(projectRoot, path.join(agentsRoot, "user-skills"), "user"),
  };
}
