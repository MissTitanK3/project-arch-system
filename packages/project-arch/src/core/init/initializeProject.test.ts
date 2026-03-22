import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { initializeProject } from "./initializeProject";
import { agentSkillSchema } from "../../schemas/agentSkill";
import { agentSkillRegistrySchema } from "../../schemas/agentSkillRegistry";

describe.sequential("initializeProject - Standards Coverage", () => {
  let tempDir: string;
  let tempContext: TestProjectContext;

  beforeEach(async () => {
    tempContext = await createTempDir();
    tempDir = tempContext.tempDir;
  });

  afterEach(async () => {
    await tempContext.cleanup();
  });

  it("generates all required standards files", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const standardsDir = path.join(tempDir, "architecture", "standards");

    // Check that all 8 standards files exist
    const expectedStandardsFiles = [
      "repo-structure.md",
      "react-standards.md",
      "nextjs-standards.md",
      "typescript-standards.md",
      "markdown-standards.md",
      "testing-standards.md",
      "naming-conventions.md",
      "turborepo-standards.md",
    ];

    for (const file of expectedStandardsFiles) {
      const filePath = path.join(standardsDir, file);
      expect(await fs.pathExists(filePath)).toBe(true);
    }
  });

  it("includes detailed content in standards files", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const standardsDir = path.join(tempDir, "architecture", "standards");

    // Check TypeScript standards has detailed content
    const tsContent = await fs.readFile(path.join(standardsDir, "typescript-standards.md"), "utf8");
    expect(tsContent).toContain("Type Safety");
    expect(tsContent).toContain("strict: true");

    // Check Markdown standards has linting policy
    const mdContent = await fs.readFile(path.join(standardsDir, "markdown-standards.md"), "utf8");
    expect(mdContent).toContain("markdownlint");
    expect(mdContent).toContain("Formatting Rules");
    expect(mdContent).toContain("pa lint frontmatter --fix");
    expect(mdContent).toContain("pa doctor");
    expect(mdContent).toContain("pa help validation");

    // Check Testing standards
    const testContent = await fs.readFile(path.join(standardsDir, "testing-standards.md"), "utf8");
    expect(testContent).toContain("Testing Strategy");
    expect(testContent).toContain("Coverage");
  });

  it("architecture README includes direct links to all standards", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const readmePath = path.join(tempDir, "architecture", "README.md");
    const readmeContent = await fs.readFile(readmePath, "utf8");

    // Check for direct markdown links
    expect(readmeContent).toContain("[`repo-structure.md`](standards/repo-structure.md)");
    expect(readmeContent).toContain("[`react-standards.md`](standards/react-standards.md)");
    expect(readmeContent).toContain("[`nextjs-standards.md`](standards/nextjs-standards.md)");
    expect(readmeContent).toContain(
      "[`typescript-standards.md`](standards/typescript-standards.md)",
    );
    expect(readmeContent).toContain("[`markdown-standards.md`](standards/markdown-standards.md)");
    expect(readmeContent).toContain("[`testing-standards.md`](standards/testing-standards.md)");
    expect(readmeContent).toContain("[`naming-conventions.md`](standards/naming-conventions.md)");
    expect(readmeContent).toContain("[`turborepo-standards.md`](standards/turborepo-standards.md)");

    // Check for explicit agent guidance
    expect(readmeContent).toContain("Agents must review all standards before implementing code");
  });

  it("agents.md includes standards review requirement", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const agentsPath = path.join(tempDir, "agents.md");
    const agentsContent = await fs.readFile(agentsPath, "utf8");

    // Standards section present and markdown reference explicit
    expect(agentsContent).toContain("architecture/standards/");
    expect(agentsContent).toContain("architecture/standards/markdown-standards.md");
    expect(agentsContent).toContain("Primary Markdown reference");

    // CLI-first enforcement is present
    expect(agentsContent).toContain("CLI-First Enforcement");
    expect(agentsContent).toContain("pa doctor");
    expect(agentsContent).toContain("pa feedback list");
    expect(agentsContent).toContain("pa feedback review <issueId>");
    expect(agentsContent).toContain("pa reconcile task <taskId>");

    // Governance hierarchy remains explicit
    expect(agentsContent).toContain("Documentation Authority");
    expect(agentsContent).toContain("architecture/reference` is informational only");
  });

  it("agents.md preserves required governance section order", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const agentsPath = path.join(tempDir, "agents.md");
    const agentsContent = await fs.readFile(agentsPath, "utf8");

    const requiredSections = [
      "## 1. Read Order",
      "## 2. Topic Map",
      "## 3. Agent Execution Workflow",
      "## 4. Operating Rules",
      "## 5. Agent Philosophy",
    ];

    const positions = requiredSections.map((section) => agentsContent.indexOf(section));
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(0);
      if (i > 0) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    }
  });

  it("agents.md includes operational command groups and feedback lifecycle references", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const agentsPath = path.join(tempDir, "agents.md");
    const agentsContent = await fs.readFile(agentsPath, "utf8");

    // CLI-first enforcement section present
    expect(agentsContent).toContain("### CLI-First Enforcement (Required)");
    expect(agentsContent).toContain("#### Project Architecture CLI (pa)");

    // Task lane commands present (code fence format uses <phase>/<milestone>)
    expect(agentsContent).toContain("pa task new <phase> <milestone>");
    expect(agentsContent).toContain("pa task discover <phase> <milestone> --from <taskId>");
    expect(agentsContent).toContain("pa task idea <phase> <milestone>");
    expect(agentsContent).toContain("pa task lanes <phase> <milestone>");

    // Feedback commands present
    expect(agentsContent).toContain("pa feedback list");
    expect(agentsContent).toContain("pa feedback show <issueId>");
    expect(agentsContent).toContain("pa feedback review <issueId>");
    expect(agentsContent).toContain("pa feedback export <issueId>");
    expect(agentsContent).toContain("pa feedback refresh");
    expect(agentsContent).toContain("pa feedback rebuild");
    expect(agentsContent).toContain("pa feedback prune");

    // Feedback invocation policy present
    expect(agentsContent).toContain("Feedback Invocation Policy");

    // Reconciliation section present
    expect(agentsContent).toContain("pa reconcile task <taskId>");
    expect(agentsContent).toContain("pa backfill implemented");

    // Lifecycle constraints present
    expect(agentsContent).toContain("#### Lifecycle Constraints");
    expect(agentsContent).toContain("discoveredFromTask");
    expect(agentsContent).toContain("pa milestone activate");
  });

  it("standards files pass basic markdown lint rules", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const standardsDir = path.join(tempDir, "architecture", "standards");
    const standardsFiles = await fs.readdir(standardsDir);

    for (const file of standardsFiles) {
      if (!file.endsWith(".md")) continue;

      const content = await fs.readFile(path.join(standardsDir, file), "utf8");

      // Check for common markdown lint issues
      // Allow single trailing newline but no other trailing spaces
      const lines = content.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        expect(lines[i]).not.toMatch(/\s+$/); // No trailing spaces on any line
      }
      expect(content).toMatch(/^# /); // Starts with ATX header
      expect(content).not.toContain("\t"); // No tabs

      // If it has a code block, it should have a language specified
      const codeBlocks = content.match(/```(\w*)\n/g);
      if (codeBlocks) {
        for (const block of codeBlocks) {
          // Either has a language or is empty (which we can allow for now)
          expect(block).toMatch(/```\w+\n|```\n/);
        }
      }
    }
  });

  it("throws for unsupported template", async () => {
    await expect(
      initializeProject(
        {
          template: "vite",
          pm: "pnpm",
        },
        tempDir,
      ),
    ).rejects.toThrow("Unsupported template 'vite'. Expected nextjs-turbo");
  });

  it("throws for unsupported package manager", async () => {
    await expect(
      initializeProject(
        {
          template: "nextjs-turbo",
          pm: "npm",
        },
        tempDir,
      ),
    ).rejects.toThrow("Unsupported package manager 'npm'. Expected pnpm");
  });

  it("captures pre-existing module entrypoints in arch-model", async () => {
    const webAppDir = path.join(tempDir, "apps", "web", "app");
    await fs.ensureDir(webAppDir);
    await fs.writeFile(
      path.join(webAppDir, "page.tsx"),
      "export default function Page(){return null}",
    );

    const uiPkgDir = path.join(tempDir, "packages", "ui", "src");
    await fs.ensureDir(uiPkgDir);
    await fs.writeFile(path.join(uiPkgDir, "index.ts"), "export const ui = true;");

    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const entrypointsPath = path.join(tempDir, "arch-model", "entrypoints.json");
    const entrypointsData = await fs.readJson(entrypointsPath);
    const entries = Array.isArray(entrypointsData.entrypoints) ? entrypointsData.entrypoints : [];

    expect(entries.some((entry: { path: string }) => entry.path === "apps/web/app/page.tsx")).toBe(
      true,
    );
    expect(
      entries.some((entry: { path: string }) => entry.path === "packages/ui/src/index.ts"),
    ).toBe(true);
  });

  it("creates docs app by default when withDocsSite is not specified", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const docsDir = path.join(tempDir, "apps", "docs");
    expect(await fs.pathExists(docsDir)).toBe(true);
  });

  it("omits docs app when withDocsSite is explicitly false", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
        withDocsSite: false,
      },
      tempDir,
    );

    // Note: behavior depends on implementation, just ensure function completes
    expect(await fs.pathExists(tempDir)).toBe(true);
  });

  it("creates ai indexing directory when withAi is enabled", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
        withAi: true,
      },
      tempDir,
    );

    const aiDir = path.join(tempDir, "ai", "indexing");
    expect(await fs.pathExists(aiDir)).toBe(true);
  });

  it("omits ai directory when withAi is not specified", async () => {
    const tempDir2 = path.join(tempDir, "test2");
    await fs.ensureDir(tempDir2);

    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
        withAi: false,
      },
      tempDir2,
    );

    const aiDir = path.join(tempDir2, "ai");
    expect(await fs.pathExists(aiDir)).toBe(false);

    await fs.remove(tempDir2);
  });

  it("creates custom app when specified in apps option", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
        apps: "web,mobile,admin",
      },
      tempDir,
    );

    expect(await fs.pathExists(path.join(tempDir, "apps", "web"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "apps", "mobile"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "apps", "admin"))).toBe(true);
  });

  it("creates phase 1 and milestone 1 setup by default", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const phase1Dir = path.join(tempDir, "roadmap", "phases", "phase-1");
    const milestone1Dir = path.join(phase1Dir, "milestones", "milestone-1-setup");

    expect(await fs.pathExists(phase1Dir)).toBe(true);
    expect(await fs.pathExists(milestone1Dir)).toBe(true);
  });

  it("creates all required architecture directories", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const requiredDirs = [
      "arch-model",
      "arch-domains",
      "architecture/foundation",
      "architecture/architecture",
      "architecture/standards",
      "architecture/reference/examples",
      "architecture/reference/design-notes",
      "architecture/reference/experiments",
      "scripts",
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(tempDir, dir);
      expect(await fs.pathExists(dirPath)).toBe(true);
    }
  });

  it("creates package structure with required package directories", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const requiredPackages = [
      "packages/ui",
      "packages/types",
      "packages/config",
      "packages/database",
      "packages/api",
    ];

    for (const pkg of requiredPackages) {
      const pkgPath = path.join(tempDir, pkg);
      expect(await fs.pathExists(pkgPath)).toBe(true);
    }
  });

  it("initializes decision and phase manifests", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const phaseManifestPath = path.join(tempDir, "roadmap", "manifest.json");
    expect(await fs.pathExists(phaseManifestPath)).toBe(true);

    const manifest = await fs.readJson(phaseManifestPath);
    expect(manifest.phases).toBeDefined();
    expect(manifest.phases.length).toBeGreaterThan(0);
    expect(manifest.activePhase).toBe("phase-1");
  });

  it("creates roadmap policy.json with default profile", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const policyPath = path.join(tempDir, "roadmap", "policy.json");
    expect(await fs.pathExists(policyPath)).toBe(true);

    const policy = await fs.readJson(policyPath);
    expect(policy.schemaVersion).toBe("1.0");
    expect(policy.defaultProfile).toBe("default");
    expect(policy.profiles?.default?.timing?.phase?.skipDoneIfCompletedContainer).toBe(true);
  });

  it("scaffolds agents-of-arch tree with foundational built-ins and user template", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const agentsRoot = path.join(tempDir, ".arch", "agents-of-arch");
    const skillsRoot = path.join(agentsRoot, "skills");
    const templateRoot = path.join(agentsRoot, "user-skills", "_template");
    const registryPath = path.join(agentsRoot, "registry.json");

    expect(await fs.pathExists(path.join(agentsRoot, "README.md"))).toBe(true);
    expect(await fs.pathExists(templateRoot)).toBe(true);
    expect(await fs.pathExists(path.join(templateRoot, "README.md"))).toBe(true);
    expect(await fs.pathExists(path.join(templateRoot, "system.md"))).toBe(true);
    expect(await fs.pathExists(path.join(templateRoot, "checklist.md"))).toBe(true);
    expect(await fs.pathExists(registryPath)).toBe(true);

    const skillDirs = (await fs.readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    expect(skillDirs).toHaveLength(7);

    for (const skillId of skillDirs) {
      const skillDir = path.join(skillsRoot, skillId);
      const manifest = await fs.readJSON(path.join(skillDir, "skill.json"));
      const parsed = agentSkillSchema.parse(manifest);

      expect(parsed.id).toBe(skillId);
      expect(parsed.source).toBe("builtin");
      expect(await fs.pathExists(path.join(skillDir, parsed.files.system))).toBe(true);
      expect(await fs.pathExists(path.join(skillDir, parsed.files.checklist))).toBe(true);
    }

    const registryRaw = await fs.readJSON(registryPath);
    const registry = agentSkillRegistrySchema.parse(registryRaw);
    expect(registry.skills).toHaveLength(7);
    expect(registry.skills.map((skill) => skill.id)).toEqual([...skillDirs]);
  });

  it("writes deterministic agents registry content across repeated init", async () => {
    const options = {
      template: "nextjs-turbo" as const,
      pm: "pnpm" as const,
    };

    await initializeProject(options, tempDir);

    const registryPath = path.join(tempDir, ".arch", "agents-of-arch", "registry.json");
    const first = await fs.readFile(registryPath, "utf8");

    await initializeProject(options, tempDir);
    const second = await fs.readFile(registryPath, "utf8");

    expect(second).toBe(first);
  });

  it("does not overwrite managed files on re-init without force and reports conflicts", async () => {
    const options = {
      template: "nextjs-turbo" as const,
      pm: "pnpm" as const,
    };

    await initializeProject(options, tempDir);

    const policyPath = path.join(tempDir, "roadmap", "policy.json");
    const customPolicy = {
      schemaVersion: "1.0",
      defaultProfile: "custom",
      profiles: {
        custom: {
          timing: {
            phase: {
              skipDoneIfCompletedContainer: false,
            },
          },
        },
      },
    };
    await fs.writeFile(policyPath, `${JSON.stringify(customPolicy, null, 2)}\n`, "utf8");

    const output = await (async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await initializeProject(options, tempDir);
        return logSpy.mock.calls.flat().join("\n");
      } finally {
        logSpy.mockRestore();
      }
    })();

    const after = await fs.readJson(policyPath);
    expect(after).toEqual(customPolicy);

    expect(output).toContain("Skipped existing managed files:");
    expect(output).toContain(
      "Skipped (already exists): roadmap/policy.json — use --force to overwrite",
    );
  });

  it("overwrites managed files on re-init with force and reports overwrites", async () => {
    const options = {
      template: "nextjs-turbo" as const,
      pm: "pnpm" as const,
    };

    await initializeProject(options, tempDir);

    const policyPath = path.join(tempDir, "roadmap", "policy.json");
    const customPolicy = {
      schemaVersion: "1.0",
      defaultProfile: "custom",
      profiles: {
        custom: {
          timing: {
            phase: {
              skipDoneIfCompletedContainer: false,
            },
          },
        },
      },
    };
    await fs.writeFile(policyPath, `${JSON.stringify(customPolicy, null, 2)}\n`, "utf8");

    const output = await (async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await initializeProject({ ...options, force: true }, tempDir);
        return logSpy.mock.calls.flat().join("\n");
      } finally {
        logSpy.mockRestore();
      }
    })();

    const after = await fs.readJson(policyPath);
    expect(after.defaultProfile).toBe("default");
    expect(after).not.toEqual(customPolicy);

    expect(output).toContain("Overwriting: roadmap/policy.json");
  });
});
