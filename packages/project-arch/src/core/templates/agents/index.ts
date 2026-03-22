import { AgentSkill } from "../../../schemas/agentSkill";

export interface FoundationalSkillTemplate {
  manifest: AgentSkill;
  system: string;
  checklist: string;
}

function defaultSystemSections(name: string, summary: string): string {
  return [
    `# Skill: ${name}`,
    "",
    "## Intent",
    "",
    summary,
    "",
    "## Required Context",
    "",
    "- Read the active task and milestone targets before execution.",
    "- Identify impacted architecture and runtime surfaces.",
    "",
    "## Process",
    "",
    "1. Understand scope and constraints.",
    "2. Execute deterministic implementation steps.",
    "3. Produce verifiable outcomes and trace links.",
    "",
    "## Output Contract",
    "",
    "- Actionable, repository-specific guidance.",
    "- Explicit verification outcomes.",
    "",
  ].join("\n");
}

function defaultChecklistSections(): string {
  return [
    "# Skill Checklist",
    "",
    "## Preconditions",
    "",
    "- [ ] Required architecture and roadmap context read",
    "- [ ] Required source files identified",
    "",
    "## Execution",
    "",
    "- [ ] Steps completed with deterministic outputs",
    "- [ ] Scope boundaries respected",
    "",
    "## Done Criteria",
    "",
    "- [ ] Output is actionable",
    "- [ ] Verification evidence is included",
    "",
  ].join("\n");
}

function createFoundationalSkill(params: {
  id: string;
  name: string;
  summary: string;
  whenToUse: string[];
  expectedOutputs: string[];
  tags: string[];
}): FoundationalSkillTemplate {
  return {
    manifest: {
      schemaVersion: "1.0",
      id: params.id,
      name: params.name,
      source: "builtin",
      version: "1.0.0",
      summary: params.summary,
      whenToUse: params.whenToUse,
      expectedOutputs: params.expectedOutputs,
      files: {
        system: "system.md",
        checklist: "checklist.md",
      },
      tags: params.tags,
      overrides: false,
    },
    system: defaultSystemSections(params.name, params.summary),
    checklist: defaultChecklistSections(),
  };
}

export function foundationalAgentSkills(): FoundationalSkillTemplate[] {
  return [
    createFoundationalSkill({
      id: "repo-map",
      name: "Repository Map",
      summary: "Maps relevant repository surfaces and ownership for the active task scope.",
      whenToUse: ["When planning or scoping a non-trivial change"],
      expectedOutputs: ["Candidate file/module list", "Ownership and boundary notes"],
      tags: ["analysis", "navigation"],
    }),
    createFoundationalSkill({
      id: "task-execution",
      name: "Task Execution",
      summary: "Converts task intent into deterministic implementation steps and verifications.",
      whenToUse: ["When executing a roadmap task"],
      expectedOutputs: ["Implementation steps", "Verification checklist"],
      tags: ["execution", "delivery"],
    }),
    createFoundationalSkill({
      id: "decision-writing",
      name: "Decision Writing",
      summary: "Captures architectural decisions with context, tradeoffs, and consequences.",
      whenToUse: ["When implementation requires architectural tradeoff decisions"],
      expectedOutputs: ["Decision draft", "Rationale and alternatives"],
      tags: ["architecture", "decision"],
    }),
    createFoundationalSkill({
      id: "architecture-trace",
      name: "Architecture Trace",
      summary: "Maintains trace links between task, decision, code targets, and docs.",
      whenToUse: ["When making changes that affect architecture traceability"],
      expectedOutputs: ["Updated trace links", "Consistency notes"],
      tags: ["traceability", "governance"],
    }),
    createFoundationalSkill({
      id: "validation-repair",
      name: "Validation Repair",
      summary: "Triage and repair validation findings while preserving scope constraints.",
      whenToUse: ["When check/lint diagnostics block milestone progress"],
      expectedOutputs: ["Prioritized fixes", "Validation rerun summary"],
      tags: ["validation", "repair"],
    }),
    createFoundationalSkill({
      id: "docs-sync",
      name: "Docs Sync",
      summary:
        "Keeps architecture and execution documentation aligned with implementation changes.",
      whenToUse: ["When implementation changes affect documented behavior or structure"],
      expectedOutputs: ["Updated docs", "Changed-source mapping"],
      tags: ["documentation", "sync"],
    }),
    createFoundationalSkill({
      id: "release-readiness",
      name: "Release Readiness",
      summary: "Checks completion evidence, risks, and rollout blockers before release gates.",
      whenToUse: ["When preparing milestone completion or release review"],
      expectedOutputs: ["Readiness summary", "Open risk list"],
      tags: ["release", "quality"],
    }),
  ];
}

export function defaultAgentsReadme(): string {
  return [
    "# Agents of Arch",
    "",
    "This directory contains the capability skill system used by `pa agents`.",
    "",
    "## Structure",
    "",
    "- `skills/`: Built-in foundational skills.",
    "- `user-skills/`: User-defined skills and overrides.",
    "- `registry.json`: Derived registry generated from skill manifests.",
    "",
    "## Rules",
    "",
    "- Edit skill manifests and markdown files; do not edit `registry.json` directly.",
    "- Run `pa agents sync` after skill changes.",
    "- Use `pa agents check` to validate referenced files and structure.",
    "",
  ].join("\n");
}

export function defaultUserSkillTemplateReadme(): string {
  return [
    "# User Skill Template",
    "",
    "Use this directory as a reference for creating a new skill under `user-skills/<skill-id>`.",
    "",
    "## Required Files",
    "",
    "- `skill.json`: Skill manifest (must follow schema 1.0).",
    "- `system.md`: Skill instructions.",
    "- `checklist.md`: Execution and done checks.",
    "",
    "## Recommended Flow",
    "",
    "1. Run `pa agents new <id>` to scaffold a valid skill.",
    "2. Customize `system.md` and `checklist.md` for your team workflow.",
    "3. Run `pa agents sync` and `pa agents check`.",
    "",
  ].join("\n");
}

export function defaultUserSkillTemplateSystem(): string {
  return [
    "# Skill: <name>",
    "",
    "## Intent",
    "",
    "Describe the primary intent of this user-defined skill.",
    "",
    "## Required Context",
    "",
    "- Required documents",
    "- Required code surfaces",
    "",
    "## Process",
    "",
    "1. Step one",
    "2. Step two",
    "",
    "## Output Contract",
    "",
    "- Expected output 1",
    "",
  ].join("\n");
}

export function defaultUserSkillTemplateChecklist(): string {
  return [
    "# Checklist: <name>",
    "",
    "## Preconditions",
    "",
    "- [ ] Required context gathered",
    "",
    "## Execution",
    "",
    "- [ ] Process executed",
    "",
    "## Done Criteria",
    "",
    "- [ ] Output contract satisfied",
    "",
  ].join("\n");
}
