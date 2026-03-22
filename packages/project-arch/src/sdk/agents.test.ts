import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { agentsCheck, agentsList, agentsNew, agentsShow, agentsSync } from "./agents";

describe("sdk/agents", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  async function seedSkill(input: {
    sourceDir: "skills" | "user-skills";
    id: string;
    source: "builtin" | "user";
    overrides?: boolean;
    includeFiles?: boolean;
    dirName?: string;
  }): Promise<void> {
    const skillDir = path.join(
      context.tempDir,
      ".arch",
      "agents-of-arch",
      input.sourceDir,
      input.dirName ?? input.id,
    );
    await fs.ensureDir(skillDir);
    await fs.writeJson(path.join(skillDir, "skill.json"), {
      schemaVersion: "1.0",
      id: input.id,
      name: `Skill ${input.id}`,
      source: input.source,
      version: "1.0.0",
      summary: `Summary ${input.id}`,
      whenToUse: ["When needed"],
      expectedOutputs: ["Useful output"],
      files: {
        system: "system.md",
        checklist: "checklist.md",
      },
      tags: ["test"],
      overrides: input.overrides ?? false,
    });

    if (input.includeFiles !== false) {
      await fs.writeFile(path.join(skillDir, "system.md"), "# system\n", "utf8");
      await fs.writeFile(path.join(skillDir, "checklist.md"), "# checklist\n", "utf8");
    }
  }

  it("lists resolved skills in deterministic order", async () => {
    await seedSkill({ sourceDir: "skills", id: "zeta", source: "builtin" });
    await seedSkill({ sourceDir: "skills", id: "alpha", source: "builtin" });

    const result = await agentsList({ cwd: context.tempDir });

    resultAssertions.assertSuccess(result);
    expect(result.data.skills.map((skill) => skill.id)).toEqual(["alpha", "zeta"]);
  });

  it("shows one skill by id", async () => {
    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });

    const result = await agentsShow({ id: "repo-map", cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.skill.id).toBe("repo-map");
  });

  it("returns error when show id is missing", async () => {
    const result = await agentsShow({ id: "missing", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "Skill not found");
  });

  it("creates new user skill", async () => {
    const result = await agentsNew({
      id: "quality-gates",
      title: "Quality Gates",
      summary: "Custom skill",
      tags: ["quality"],
      cwd: context.tempDir,
    });

    resultAssertions.assertSuccess(result);
    expect(await fs.pathExists(result.data.manifestPath)).toBe(true);
    expect(await fs.pathExists(result.data.systemPath)).toBe(true);
    expect(await fs.pathExists(result.data.checklistPath)).toBe(true);
  });

  it("sync check reports stale before initial write", async () => {
    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });

    const result = await agentsSync({ cwd: context.tempDir, check: true });
    resultAssertions.assertSuccess(result);
    expect(result.data.stale).toBe(true);
    expect(result.data.changed).toBe(false);
  });

  it("sync write then check returns non-stale", async () => {
    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });

    const firstSync = await agentsSync({ cwd: context.tempDir });
    resultAssertions.assertSuccess(firstSync);
    expect(firstSync.data.changed).toBe(true);

    const checkResult = await agentsSync({ cwd: context.tempDir, check: true });
    resultAssertions.assertSuccess(checkResult);
    expect(checkResult.data.stale).toBe(false);
  });

  it("check reports missing referenced files", async () => {
    await seedSkill({
      sourceDir: "skills",
      id: "repo-map",
      source: "builtin",
      includeFiles: false,
    });

    const result = await agentsCheck({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.ok).toBe(false);
    expect(result.data.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["PAS_SKILL_MISSING_SYSTEM_FILE", "PAS_SKILL_MISSING_CHECKLIST_FILE"]),
    );
  });

  it("check reports malformed manifest with PAS diagnostic codes", async () => {
    const skillDir = path.join(context.tempDir, ".arch", "agents-of-arch", "skills", "repo-map");
    await fs.ensureDir(skillDir);
    await fs.writeJson(path.join(skillDir, "skill.json"), {
      schemaVersion: "1.0",
      id: "repo-map",
      name: "Repo Map",
      source: "builtin",
      version: "1.0.0",
      summary: "Summary",
      whenToUse: "not-an-array",
      expectedOutputs: ["Useful output"],
      files: {
        system: "system.md",
        checklist: "checklist.md",
      },
      tags: [],
      overrides: false,
    });

    const result = await agentsCheck({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.ok).toBe(false);
    expect(result.data.diagnostics).toEqual([
      expect.objectContaining({ code: "PAS_SKILL_INVALID_MANIFEST", severity: "error" }),
    ]);
    expect(result.data.errors[0]).toContain("PAS_SKILL_INVALID_MANIFEST");
  });

  it("check reports missing manifest directories with PAS diagnostic codes", async () => {
    const skillDir = path.join(context.tempDir, ".arch", "agents-of-arch", "skills", "repo-map");
    await fs.ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, "system.md"), "# system\n", "utf8");

    const result = await agentsCheck({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.ok).toBe(false);
    expect(result.data.diagnostics).toEqual([
      expect.objectContaining({ code: "PAS_SKILL_MISSING_MANIFEST", severity: "error" }),
    ]);
  });

  it("check reports explicit override requirement using PAS codes", async () => {
    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });
    await seedSkill({ sourceDir: "user-skills", id: "repo-map", source: "user" });

    const result = await agentsCheck({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.ok).toBe(false);
    expect(result.data.diagnostics).toEqual([
      expect.objectContaining({ code: "PAS_SKILL_OVERRIDE_REQUIRED", severity: "error" }),
    ]);
  });

  it("check reports directory/id mismatch using PAS codes", async () => {
    await seedSkill({
      sourceDir: "user-skills",
      id: "quality-gates",
      dirName: "quality-gates-copy",
      source: "user",
    });

    const result = await agentsCheck({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.ok).toBe(false);
    expect(result.data.diagnostics).toEqual([
      expect.objectContaining({ code: "PAS_SKILL_DIRECTORY_ID_MISMATCH", severity: "error" }),
    ]);
  });

  it("emits only PAS-prefixed diagnostics for agent validation", async () => {
    await seedSkill({
      sourceDir: "skills",
      id: "repo-map",
      source: "builtin",
      includeFiles: false,
    });

    const result = await agentsCheck({ cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.diagnostics).not.toHaveLength(0);
    expect(result.data.diagnostics.every((diagnostic) => diagnostic.code.startsWith("PAS_"))).toBe(
      true,
    );
  });
});
