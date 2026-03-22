import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDir, TestProjectContext } from "../../test/helpers";
import { createUserSkill } from "./newSkill";
import { loadSkills } from "./loadSkills";
import { resolveSkills } from "./resolveSkills";
import { syncRegistry } from "./syncRegistry";

const testContexts: TestProjectContext[] = [];

async function createContext(): Promise<TestProjectContext> {
  const context = await createTempDir();
  testContexts.push(context);
  return context;
}

async function writeSkillManifest(
  projectRoot: string,
  sourceDir: "skills" | "user-skills",
  dirName: string,
  data: {
    id: string;
    source: "builtin" | "user";
    overrides?: boolean;
  },
): Promise<void> {
  const skillDir = path.join(projectRoot, ".arch", "agents-of-arch", sourceDir, dirName);
  await fs.ensureDir(skillDir);
  await fs.writeJson(path.join(skillDir, "skill.json"), {
    schemaVersion: "1.0",
    id: data.id,
    name: `Skill ${data.id}`,
    source: data.source,
    version: "1.0.0",
    summary: `Summary for ${data.id}`,
    whenToUse: ["When useful"],
    expectedOutputs: ["Useful output"],
    files: {
      system: "system.md",
      checklist: "checklist.md",
    },
    tags: ["test"],
    overrides: data.overrides ?? false,
  });
}

afterEach(async () => {
  while (testContexts.length > 0) {
    const context = testContexts.pop();
    if (context) {
      await context.cleanup();
    }
  }
});

describe("core/agents", () => {
  it("loads builtin and user skills in deterministic id order", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "zeta-dir", {
      id: "zeta-skill",
      source: "builtin",
    });
    await writeSkillManifest(context.tempDir, "skills", "alpha-dir", {
      id: "alpha-skill",
      source: "builtin",
    });
    await writeSkillManifest(context.tempDir, "user-skills", "gamma-dir", {
      id: "gamma-skill",
      source: "user",
    });

    const loaded = await loadSkills(context.tempDir);

    expect(loaded.builtin.map((skill) => skill.manifest.id)).toEqual(["alpha-skill", "zeta-skill"]);
    expect(loaded.user.map((skill) => skill.manifest.id)).toEqual(["gamma-skill"]);
  });

  it("ignores underscore-prefixed user skill template directories", async () => {
    const context = await createContext();

    const templateDir = path.join(
      context.tempDir,
      ".arch",
      "agents-of-arch",
      "user-skills",
      "_template",
    );
    await fs.ensureDir(templateDir);
    await fs.writeFile(path.join(templateDir, "README.md"), "template", "utf8");

    await writeSkillManifest(context.tempDir, "skills", "repo-map", {
      id: "repo-map",
      source: "builtin",
    });

    const loaded = await loadSkills(context.tempDir);
    expect(loaded.user).toHaveLength(0);
    expect(loaded.builtin.map((skill) => skill.manifest.id)).toEqual(["repo-map"]);
  });

  it("fails when a skill directory is missing skill.json", async () => {
    const context = await createContext();

    const missingManifestDir = path.join(
      context.tempDir,
      ".arch",
      "agents-of-arch",
      "skills",
      "repo-map",
    );
    await fs.ensureDir(missingManifestDir);
    await fs.writeFile(path.join(missingManifestDir, "system.md"), "# system\n", "utf8");

    await expect(loadSkills(context.tempDir)).rejects.toThrow(/Missing skill manifest/i);
  });

  it("fails when a skill manifest is malformed", async () => {
    const context = await createContext();

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

    await expect(loadSkills(context.tempDir)).rejects.toThrow(/Invalid skill manifest/i);
  });

  it("rejects duplicate id without explicit override", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "core", {
      id: "repo-map",
      source: "builtin",
    });
    await writeSkillManifest(context.tempDir, "user-skills", "custom", {
      id: "repo-map",
      source: "user",
      overrides: false,
    });

    const loaded = await loadSkills(context.tempDir);

    expect(() => resolveSkills(loaded)).toThrow(/without explicit override/i);
  });

  it("allows explicit user override for matching builtin id", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "core", {
      id: "repo-map",
      source: "builtin",
    });
    await writeSkillManifest(context.tempDir, "user-skills", "custom", {
      id: "repo-map",
      source: "user",
      overrides: true,
    });

    const loaded = await loadSkills(context.tempDir);
    const resolved = resolveSkills(loaded);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: "repo-map",
      source: "user",
      overridden: true,
    });
  });

  it("rejects duplicate ids within the builtin source", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "core-a", {
      id: "repo-map",
      source: "builtin",
    });
    await writeSkillManifest(context.tempDir, "skills", "core-b", {
      id: "repo-map",
      source: "builtin",
    });

    const loaded = await loadSkills(context.tempDir);
    expect(() => resolveSkills(loaded)).toThrow(/Duplicate builtin skill id/i);
  });

  it("rejects duplicate ids within the user source", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "user-skills", "custom-a", {
      id: "repo-map",
      source: "user",
      overrides: true,
    });
    await writeSkillManifest(context.tempDir, "user-skills", "custom-b", {
      id: "repo-map",
      source: "user",
      overrides: true,
    });

    const loaded = await loadSkills(context.tempDir);
    expect(() => resolveSkills(loaded)).toThrow(/Duplicate user skill id/i);
  });

  it("keeps distinct builtin and user ids side-by-side", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "core", {
      id: "repo-map",
      source: "builtin",
    });
    await writeSkillManifest(context.tempDir, "user-skills", "custom", {
      id: "quality-gates",
      source: "user",
    });

    const loaded = await loadSkills(context.tempDir);
    const resolved = resolveSkills(loaded);

    expect(resolved.map((entry) => `${entry.id}:${entry.source}`)).toEqual([
      "quality-gates:user",
      "repo-map:builtin",
    ]);
  });

  it("supports sync check mode stale detection", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "core", {
      id: "repo-map",
      source: "builtin",
    });

    const initialCheck = await syncRegistry(context.tempDir, { check: true });
    expect(initialCheck.stale).toBe(true);

    const firstSync = await syncRegistry(context.tempDir, {
      now: new Date("2025-01-01T00:00:00Z"),
    });
    expect(firstSync.changed).toBe(true);

    const secondCheck = await syncRegistry(context.tempDir, { check: true });
    expect(secondCheck.stale).toBe(false);
  });

  it("produces byte-identical registry on unchanged rerun", async () => {
    const context = await createContext();

    await writeSkillManifest(context.tempDir, "skills", "core", {
      id: "repo-map",
      source: "builtin",
    });

    const registryPath = path.join(context.tempDir, ".arch", "agents-of-arch", "registry.json");

    await syncRegistry(context.tempDir, {
      now: new Date("2025-01-01T00:00:00Z"),
    });
    const firstContents = await fs.readFile(registryPath, "utf8");

    const rerun = await syncRegistry(context.tempDir, {
      now: new Date("2025-01-02T00:00:00Z"),
    });
    const secondContents = await fs.readFile(registryPath, "utf8");

    expect(rerun.changed).toBe(false);
    expect(secondContents).toBe(firstContents);
  });

  it("scaffolds a new user skill", async () => {
    const context = await createContext();

    const result = await createUserSkill(context.tempDir, {
      id: "quality-gates",
      summary: "Applies custom quality gates",
    });

    expect(await fs.pathExists(result.skillDir)).toBe(true);
    expect(await fs.pathExists(result.manifestPath)).toBe(true);
    expect(await fs.pathExists(result.systemPath)).toBe(true);
    expect(await fs.pathExists(result.checklistPath)).toBe(true);

    const manifest = await fs.readJSON(result.manifestPath);
    expect(manifest.id).toBe("quality-gates");
    expect(manifest.source).toBe("user");
  });
});
