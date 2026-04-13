import { describe, expect, it } from "vitest";
import {
  defaultAgentsReadme,
  defaultUserSkillTemplateChecklist,
  defaultUserSkillTemplateReadme,
  defaultUserSkillTemplateSystem,
  foundationalAgentSkills,
} from "./index";

describe("core/templates/agents", () => {
  it("provides seven foundational built-in skills", () => {
    const skills = foundationalAgentSkills();

    expect(skills).toHaveLength(7);
    expect(skills.every((skill) => skill.manifest.source === "builtin")).toBe(true);
    expect(skills.every((skill) => skill.manifest.schemaVersion === "2.0")).toBe(true);
    expect(skills.every((skill) => skill.manifest.files.system === "system.md")).toBe(true);
    expect(skills.every((skill) => skill.manifest.files.checklist === "checklist.md")).toBe(true);
  });

  it("builds markdown templates with expected sections", () => {
    const readme = defaultAgentsReadme();
    const userReadme = defaultUserSkillTemplateReadme();
    const systemTemplate = defaultUserSkillTemplateSystem();
    const checklistTemplate = defaultUserSkillTemplateChecklist();

    expect(readme).toContain("# Agents of Arch");
    expect(readme).toContain("`registry.json`");
    expect(userReadme).toContain("# User Skill Template");
    expect(userReadme).toContain("`pa agents new <id>`");
    expect(systemTemplate).toContain("## Intent");
    expect(systemTemplate).toContain("## Process");
    expect(checklistTemplate).toContain("## Preconditions");
    expect(checklistTemplate).toContain("## Done Criteria");
  });
});
