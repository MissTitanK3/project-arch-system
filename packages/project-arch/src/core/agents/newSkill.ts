import path from "path";
import fs from "fs-extra";
import { AgentSkill, agentSkillSchema } from "../../schemas/agentSkill";
import { ensureDir, pathExists, writeJsonDeterministic } from "../../utils/fs";
import { sanitizeFrontmatterString, sanitizeMarkdownHeading } from "../../utils/markdownSafety";

export interface CreateUserSkillInput {
  id: string;
  title?: string;
  summary?: string;
  overrides?: boolean;
  tags?: string[];
  archAgentsDir?: string;
}

export interface CreateUserSkillResult {
  skillDir: string;
  manifestPath: string;
  systemPath: string;
  checklistPath: string;
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function defaultSystemContent(name: string): string {
  const safeName = sanitizeMarkdownHeading(name);
  return [
    `# Skill: ${safeName}`,
    "",
    "## Intent",
    "",
    "Describe what this skill accomplishes.",
    "",
    "## Required Context",
    "",
    "List required repository inputs.",
    "",
    "## Process",
    "",
    "1. Step one",
    "2. Step two",
    "",
    "## Output Contract",
    "",
    "- Output 1",
    "",
  ].join("\n");
}

function defaultChecklistContent(name: string): string {
  const safeName = sanitizeMarkdownHeading(name);
  return [
    `# Checklist: ${safeName}`,
    "",
    "## Preconditions",
    "",
    "- [ ] Required files were read",
    "",
    "## Execution",
    "",
    "- [ ] Applied main process",
    "",
    "## Done Criteria",
    "",
    "- [ ] Expected outputs are complete and actionable",
    "",
  ].join("\n");
}

export async function createUserSkill(
  projectRoot = process.cwd(),
  input: CreateUserSkillInput,
): Promise<CreateUserSkillResult> {
  const agentsRoot = input.archAgentsDir ?? path.join(projectRoot, ".arch", "agents-of-arch");
  const skillDir = path.join(agentsRoot, "user-skills", input.id);
  const manifestPath = path.join(skillDir, "skill.json");
  const systemPath = path.join(skillDir, "system.md");
  const checklistPath = path.join(skillDir, "checklist.md");

  if (await pathExists(skillDir)) {
    throw new Error(`User skill directory already exists: ${path.relative(projectRoot, skillDir)}`);
  }

  const title = input.title ?? titleFromId(input.id);
  const safeTitle = sanitizeFrontmatterString(title);
  const safeSummary = sanitizeFrontmatterString(
    input.summary ?? `User-defined skill: ${safeTitle}`,
  );
  const safeTags = (input.tags ?? []).map((tag) => sanitizeFrontmatterString(tag)).filter(Boolean);

  const manifest: AgentSkill = agentSkillSchema.parse({
    schemaVersion: "2.0",
    id: input.id,
    name: safeTitle,
    source: "user",
    version: "1.0.0",
    summary: safeSummary,
    whenToUse: ["When a custom repository-specific workflow is needed"],
    expectedOutputs: ["Actionable workflow guidance"],
    files: {
      system: "system.md",
      checklist: "checklist.md",
    },
    tags: safeTags,
    overrides: input.overrides ?? false,
  });

  await ensureDir(skillDir);
  await writeJsonDeterministic(manifestPath, manifest);
  await fs.writeFile(systemPath, defaultSystemContent(safeTitle), "utf8");
  await fs.writeFile(checklistPath, defaultChecklistContent(safeTitle), "utf8");

  return {
    skillDir,
    manifestPath,
    systemPath,
    checklistPath,
  };
}
