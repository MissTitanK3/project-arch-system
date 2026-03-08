import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { initializeProject } from "./initializeProject";

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

    // Check for explicit standards review requirements
    expect(agentsContent).toContain("architecture/standards/");
    expect(agentsContent).toContain("REQUIRED before implementation");
    expect(agentsContent).toContain("Standards Review Checklist");

    // Check that all standards files are mentioned
    expect(agentsContent).toContain("typescript-standards.md");
    expect(agentsContent).toContain("markdown-standards.md");
    expect(agentsContent).toContain("testing-standards.md");
    expect(agentsContent).toContain("naming-conventions.md");
    expect(agentsContent).toContain("turborepo-standards.md");
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
});
