import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import matter from "gray-matter";
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
    expect(readmeContent).toContain("## Canonical Taxonomy");
    expect(readmeContent).toContain("## Purpose");
    expect(readmeContent).toContain("## Read First");
    expect(readmeContent).toContain("## Authority Rules");
    expect(readmeContent).toContain("`product-framing/`");
    expect(readmeContent).toContain("`systems/`");
    expect(readmeContent).toContain("`data/`");
    expect(readmeContent).toContain("`runtime/`");
    expect(readmeContent).toContain("`governance/`");
    expect(readmeContent).toContain("`operations/`");
    expect(readmeContent).toContain("`templates/`");
    expect(readmeContent).toContain("## Boundary Highlights");
    expect(readmeContent).toContain("## Family Status");
    expect(readmeContent).toContain("## Adaptation Rules");
    expect(readmeContent).toContain("## Migration And Normalization");
    expect(readmeContent).toContain("## Init Output Tier Model");
    expect(readmeContent).toContain("## Canonical Vs Supporting Docs");
    expect(readmeContent).toContain("## Agent Navigation Order");
    expect(readmeContent).toContain("`standards/` defines binding implementation rules");
    expect(readmeContent).toContain("`systems/` defines major system behavior");
    expect(readmeContent).toContain("This README is the root index and navigation contract");
    expect(readmeContent).toContain("Families may be unused or empty in a given repository");
    expect(readmeContent).toContain("Canonical docs live in the top-level taxonomy families");
    expect(readmeContent).toContain("A repository does not need to populate every family up front");
    expect(readmeContent).toContain("Renaming canonical families should be avoided");
    expect(readmeContent).toContain("Merging families is acceptable only when");
    expect(readmeContent).toContain("Tier A means always scaffolded surfaces");
    expect(readmeContent).toContain("Tier B means template scaffolded surfaces");
    expect(readmeContent).toContain("`pa init = Tier A + applicable Tier B`");
    expect(readmeContent).toContain(
      "[`governance/init-tier-model.md`](governance/init-tier-model.md)",
    );
    expect(readmeContent).toContain(
      "[`governance/init-default-behavior.md`](governance/init-default-behavior.md)",
    );
    expect(readmeContent).toContain(
      "[`governance/init-full-behavior.md`](governance/init-full-behavior.md)",
    );
    expect(readmeContent).toContain(
      "[`governance/init-surface-tier-mapping.md`](governance/init-surface-tier-mapping.md)",
    );
    expect(readmeContent).toContain(
      "[`governance/init-sprawl-guardrails.md`](governance/init-sprawl-guardrails.md)",
    );
    expect(readmeContent).toContain("[`governance/taxonomy-migration.md`](governance/taxonomy-migration.md)");
  });

  it("creates family READMEs with explicit boundary guidance", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const governanceContent = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "README.md"),
      "utf8",
    );
    expect(governanceContent).toContain("## Belongs Here");
    expect(governanceContent).toContain("## Does Not Belong Here");
    expect(governanceContent).toContain("## Boundary Notes");
    expect(governanceContent).toContain("binding implementation rules that belong in `standards/`");
    expect(governanceContent).toContain("operational runbooks that belong in `operations/`");

    const runtimeContent = await fs.readFile(
      path.join(tempDir, "architecture", "runtime", "README.md"),
      "utf8",
    );
    expect(runtimeContent).toContain("user-facing workflow definitions that belong in `systems/`");
    expect(runtimeContent).toContain("data schemas or persistence ownership that belong in `data/`");

    const contentContent = await fs.readFile(
      path.join(tempDir, "architecture", "content", "README.md"),
      "utf8",
    );
    expect(contentContent).toContain(
      "subsystem behavior specifications that belong in `systems/`",
    );

    const productFramingContent = await fs.readFile(
      path.join(tempDir, "architecture", "product-framing", "README.md"),
      "utf8",
    );
    expect(productFramingContent).toContain(
      "subsystem behavior detail that belongs in `systems/`",
    );

    const foundationContent = await fs.readFile(
      path.join(tempDir, "architecture", "foundation", "README.md"),
      "utf8",
    );
    expect(foundationContent).toContain("# Legacy Foundation");
    expect(foundationContent).toContain("Treat `foundation/` as transitional support only.");
    expect(foundationContent).toContain(
      "Move active goals, scope, risk, and concept documents into `product-framing/`.",
    );

    const legacyArchitectureContent = await fs.readFile(
      path.join(tempDir, "architecture", "legacy-architecture", "README.md"),
      "utf8",
    );
    expect(legacyArchitectureContent).toContain("# Legacy Architecture");
    expect(legacyArchitectureContent).toContain(
      "Treat `legacy-architecture/` as transitional support only.",
    );
    expect(legacyArchitectureContent).toContain(
      "Move active authoritative documents into `systems/`, `runtime/`, `data/`, or `governance/` based on role.",
    );
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
    expect(agentsContent).toContain("architecture/product-framing/");
    expect(agentsContent).toContain("architecture/governance/REPO-MODEL.md");
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
    expect(agentsContent).toContain("pa task new <phase> <milestone> --project <projectId>");
    expect(agentsContent).toContain(
      "pa task discover <phase> <milestone> --project <projectId> --from <taskId>",
    );
    expect(agentsContent).toContain("pa task idea <phase> <milestone> --project <projectId>");
    expect(agentsContent).toContain("pa task lanes <phase> <milestone> --project <projectId>");

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

  it("creates the foundational shared project directory model", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    expect(await fs.pathExists(path.join(tempDir, "roadmap", "projects"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "roadmap", "projects", "shared"))).toBe(true);
    expect(
      await fs.pathExists(path.join(tempDir, "roadmap", "projects", "shared", "manifest.json")),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(tempDir, "roadmap", "projects", "shared", "overview.md")),
    ).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "roadmap", "projects", "shared", "phases"))).toBe(
      true,
    );
  });

  it("creates a shared project overview with ownership contract sections", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const overviewPath = path.join(tempDir, "roadmap", "projects", "shared", "overview.md");
    const overviewContent = await fs.readFile(overviewPath, "utf8");

    expect(overviewContent).toContain("# Shared");
    expect(overviewContent).toContain("## Project Type");
    expect(overviewContent).toContain("## Purpose");
    expect(overviewContent).toContain("## Owned Paths");
    expect(overviewContent).toContain("## Shared Dependencies");
    expect(overviewContent).toContain("## Delivery Notes");
    expect(overviewContent).toContain("## Adding Custom Projects");
    expect(overviewContent).toContain("- roadmap");
    expect(overviewContent).toContain("- architecture");
    expect(overviewContent).toContain("Create additional named projects");
    expect(overviewContent).toContain("`storefront`, `backoffice`, `customer-portal`, or `ops-console`");
    expect(overviewContent).toContain("Do not treat `app-*` as a required naming convention.");
    expect(overviewContent).toContain("`manifest.json` with stable identity and ownership metadata");
  });

  it("documents the project-scoped roadmap model in seeded init guidance", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const promptContent = await fs.readFile(
      path.join(tempDir, "architecture", "product-framing", "prompt.md"),
      "utf8",
    );
    expect(promptContent).toContain(
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/*",
    );

    const repoModelContent = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );
    expect(repoModelContent).toContain(
      "Location: `roadmap/projects/<project>/phases/`, `roadmap/decisions/`",
    );

    const agentsContent = await fs.readFile(path.join(tempDir, "agents.md"), "utf8");
    expect(agentsContent).toContain("`roadmap/projects/<project>/phases/*`");
    expect(agentsContent).toContain(
      "pa phase new <phaseId> --project <projectId>      # Create new phase (format: phase-1, phase-2)",
    );
    expect(agentsContent).toContain(
      "roadmap/projects/{project}/phases/{phase}/milestones/{milestone}/tasks/{lane}/{id}-{slug}.md",
    );
    const contextPayloadContent = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "cli-context-payload.md"),
      "utf8",
    );
    expect(contextPayloadContent).toContain(
      "- `active.project.id`, `active.project.path`, `active.project.title`",
    );
  });

  it("seeds bootstrap tasks with target coverage and milestone objective trace links", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const taskRoot = path.join(
      tempDir,
      "roadmap",
      "projects",
      "shared",
      "phases",
      "phase-1",
      "milestones",
      "milestone-1-setup",
      "tasks",
      "planned",
    );

    const overviewTask = matter(
      await fs.readFile(path.join(taskRoot, "001-define-project-overview.md"), "utf8"),
    );
    expect(overviewTask.data.publicDocs).toContain("architecture/product-framing/project-overview.md");
    expect(overviewTask.data.traceLinks).toContain(
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    );

    const systemTask = matter(
      await fs.readFile(path.join(taskRoot, "005-define-system-boundaries.md"), "utf8"),
    );
    expect(systemTask.data.publicDocs).toContain("architecture/systems/system-boundaries.md");
    expect(systemTask.data.traceLinks).toContain(
      "roadmap/projects/shared/phases/phase-1/overview.md",
    );

    const runtimeTask = matter(
      await fs.readFile(path.join(taskRoot, "007-define-runtime-architecture.md"), "utf8"),
    );
    expect(runtimeTask.data.publicDocs).toContain("architecture/runtime/runtime-architecture.md");

    const finalTask = matter(
      await fs.readFile(path.join(taskRoot, "008-finalize-architecture-foundation.md"), "utf8"),
    );
    expect(finalTask.data.traceLinks).toContain(
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
    );

    const targetsContent = await fs.readFile(
      path.join(
        tempDir,
        "roadmap",
        "projects",
        "shared",
        "phases",
        "phase-1",
        "milestones",
        "milestone-1-setup",
        "targets.md",
      ),
      "utf8",
    );
    expect(targetsContent).toContain("- `architecture/product-framing`");
    expect(targetsContent).toContain("- `architecture/systems`");
    expect(targetsContent).toContain("- `architecture/governance`");
    expect(targetsContent).toContain("- `architecture/runtime`");
    expect(targetsContent).not.toContain("`packages/api`");
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

    expect(
      entries.some((entry: { path: string }) => entry.path === "packages/ui/src/index.ts"),
    ).toBe(true);
  });

  it("does not create legacy apps directory during init", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const appsDir = path.join(tempDir, "apps");
    expect(await fs.pathExists(appsDir)).toBe(false);
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

  it("creates phase 1 and milestone 1 setup by default", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const phase1Dir = path.join(
      tempDir,
      "roadmap",
      "projects",
      "shared",
      "phases",
      "phase-1",
    );
    expect(await fs.pathExists(phase1Dir)).toBe(true);
    expect(await fs.pathExists(path.join(phase1Dir, "milestones"))).toBe(true);
    expect(
      await fs.pathExists(
        path.join(phase1Dir, "milestones", "milestone-1-setup", "tasks", "planned"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "roadmap", "phases", "phase-1", "milestones", "milestone-1-setup"),
      ),
    ).toBe(true);
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
      "architecture/content",
      "architecture/data",
      "architecture/governance",
      "architecture/operations",
      "architecture/product-framing",
      "architecture/runtime",
      "architecture/systems",
      "architecture/templates",
      "architecture/foundation",
      "architecture/legacy-architecture",
      "architecture/standards",
      "architecture/reference/examples",
      "architecture/reference/design-notes",
      "architecture/reference/experiments",
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(tempDir, dir);
      expect(await fs.pathExists(dirPath)).toBe(true);
    }
  });

  it("creates canonical taxonomy artifacts in governance and templates", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    expect(await fs.pathExists(path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"))).toBe(
      true,
    );
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "init-tier-model.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "init-default-behavior.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "init-full-behavior.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "init-surface-tier-mapping.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "init-sprawl-guardrails.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "taxonomy-migration.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "templates", "ARCHITECTURE_SPEC_TEMPLATE.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "templates", "GAP_CLOSURE_REPORT_TEMPLATE.md"),
      ),
    ).toBe(true);
  });

  it("creates canonical seed docs in product-framing, systems, governance, and runtime", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const expectedFiles = [
      "architecture/product-framing/prompt.md",
      "architecture/product-framing/project-overview.md",
      "architecture/product-framing/goals.md",
      "architecture/product-framing/user-journey.md",
      "architecture/product-framing/scope.md",
      "architecture/systems/system-boundaries.md",
      "architecture/governance/module-model.md",
      "architecture/runtime/runtime-architecture.md",
    ];

    for (const relativeFile of expectedFiles) {
      expect(await fs.pathExists(path.join(tempDir, relativeFile))).toBe(true);
    }
  });

  it("repo index uses the canonical taxonomy as the active authority model", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );

    expect(repoIndexContent).toContain("Location: `architecture/` using the canonical taxonomy");
    expect(repoIndexContent).toContain("architecture/product-framing");
    expect(repoIndexContent).toContain("architecture/systems");
    expect(repoIndexContent).toContain("architecture/governance");
    expect(repoIndexContent).toContain("architecture/templates");
    expect(repoIndexContent).toContain(
      "Default init scope is defined in `architecture/governance/init-default-behavior.md`",
    );
    expect(repoIndexContent).toContain(
      "Full-mode init scope is defined in `architecture/governance/init-full-behavior.md`",
    );
    expect(repoIndexContent).toContain(
      "Surface placement across the tier model is defined in `architecture/governance/init-surface-tier-mapping.md`",
    );
    expect(repoIndexContent).toContain(
      "Future scaffold admission rules are defined in `architecture/governance/init-sprawl-guardrails.md`",
    );
    expect(repoIndexContent).toContain("Normalization guidance lives in `architecture/governance/taxonomy-migration.md`");
    expect(repoIndexContent).toContain(
      "Init scaffold scope is defined by the tier model in `architecture/governance/init-tier-model.md`",
    );
    expect(repoIndexContent).toContain("1. `architecture/product-framing`");
    expect(repoIndexContent).toContain("2. `architecture/systems`");
    expect(repoIndexContent).toContain("11. `architecture/foundation`");
  });

  it("creates an init tier model guide for scaffold scope decisions", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const tierGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-tier-model.md"),
      "utf8",
    );

    expect(tierGuide).toContain("# Init Output Tier Model");
    expect(tierGuide).toContain("## Working Mode Split");
    expect(tierGuide).toContain("`pa init` = Tier A + applicable Tier B");
    expect(tierGuide).toContain(
      "`pa init --full` = Tier A + applicable Tier B + scaffoldable Tier C + safe Tier D",
    );
    expect(tierGuide).toContain("### Tier A — Always scaffolded");
    expect(tierGuide).toContain("### Tier B — Template scaffolded");
    expect(tierGuide).toContain("### Tier C — Catalog only");
    expect(tierGuide).toContain("### Tier D — Optional add-ons");
    expect(tierGuide).toContain("## Decision Rules");
    expect(tierGuide).toContain("## Guardrails");
    expect(tierGuide).toContain("project-agnostic and domain-agnostic");
  });

  it("creates a default init behavior guide for the smallest coherent scaffold", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const defaultGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-default-behavior.md"),
      "utf8",
    );

    expect(defaultGuide).toContain("# Default Init Behavior");
    expect(defaultGuide).toContain("smallest coherent default scaffold");
    expect(defaultGuide).toContain("Default `pa init` includes:");
    expect(defaultGuide).toContain("- Tier A surfaces");
    expect(defaultGuide).toContain("- applicable Tier B surfaces required by the selected template");
    expect(defaultGuide).toContain("Default `pa init` does not include by default:");
    expect(defaultGuide).toContain("- Tier C catalog-only topics");
    expect(defaultGuide).toContain("- Tier D optional add-ons");
    expect(defaultGuide).toContain("## What Belongs In The Smallest Coherent Default Scaffold");
    expect(defaultGuide).toContain("## Default Roadmap Layout");
    expect(defaultGuide).toContain("`roadmap/projects/shared/phases/phase-1/...`");
    expect(defaultGuide).toContain("## Reserved Bootstrap Project");
    expect(defaultGuide).toContain("`shared` is the reserved bootstrap project created by default init.");
    expect(defaultGuide).toContain("## Adding Custom Projects");
    expect(defaultGuide).toContain("`roadmap/projects/<name>/manifest.json`");
    expect(defaultGuide).toContain("examples include `storefront`, `backoffice`, `customer-portal`, and `ops-console`");
    expect(defaultGuide).toContain("`app-*` naming is optional, not required");
    expect(defaultGuide).toContain("use `ownedPaths` for the surfaces the project owns");
    expect(defaultGuide).toContain("use `sharedDependencies` for cross-project dependencies rather than ownership");
    expect(defaultGuide).toContain("## What Must Stay Out Of Default Init");
    expect(defaultGuide).toContain("## Decision Rules");
    expect(defaultGuide).toContain("## Guardrails");
    expect(defaultGuide).toContain("Default init must stay project-agnostic");
  });

  it("creates a full init behavior guide for the broadest first-party scaffold mode", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const fullGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-full-behavior.md"),
      "utf8",
    );

    expect(fullGuide).toContain("# Full Init Behavior");
    expect(fullGuide).toContain("broadest first-party scaffold mode");
    expect(fullGuide).toContain("`pa init --full` includes:");
    expect(fullGuide).toContain("- Tier A surfaces");
    expect(fullGuide).toContain("- applicable Tier B surfaces required by the selected template");
    expect(fullGuide).toContain("- scaffoldable Tier C topics where first-party content exists");
    expect(fullGuide).toContain("- safe Tier D add-ons that can be created non-interactively");
    expect(fullGuide).toContain("`pa init --full` must not include:");
    expect(fullGuide).toContain("- domain-specific content generation");
    expect(fullGuide).toContain("## What Broadening Means");
    expect(fullGuide).toContain("## Tier Rules For Full Mode");
    expect(fullGuide).toContain("## Guardrails");
    expect(fullGuide).toContain("`--full` must remain the broadest first-party scaffold mode, not a domain generator");
  });

  it("creates an init surface mapping guide for major scaffold categories", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const mappingGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-surface-tier-mapping.md"),
      "utf8",
    );

    expect(mappingGuide).toContain("# Init Surface Tier Mapping");
    expect(mappingGuide).toContain("## Surface Category Map");
    expect(mappingGuide).toContain("Core roadmap and project-arch planning surfaces");
    expect(mappingGuide).toContain("single roadmap root and reserved `shared` bootstrap project");
    expect(mappingGuide).toContain("Canonical architecture entry docs and recommended top-level architecture families");
    expect(mappingGuide).toContain("Core required standards");
    expect(mappingGuide).toContain("Template-specific required standards");
    expect(mappingGuide).toContain("Broader standards catalog topics");
    expect(mappingGuide).toContain("Recommended governance starter topics beyond the baseline");
    expect(mappingGuide).toContain("Recommended operations starter topics beyond the baseline");
    expect(mappingGuide).toContain("Agent entry-point surfaces identified as canonical defaults");
    expect(mappingGuide).toContain("Agent compatibility surfaces marked optional compatibility");
    expect(mappingGuide).toContain("Workflow files that depend on unresolved context plumbing");
    expect(mappingGuide).toContain("### Standards");
    expect(mappingGuide).toContain("### Governance And Operations");
    expect(mappingGuide).toContain("### Templates And Taxonomy Guidance");
    expect(mappingGuide).toContain("### Roadmap Layout");
    expect(mappingGuide).toContain("the canonical initialized planning model is `roadmap/projects/<project>/phases/...`");
    expect(mappingGuide).toContain("the reserved `shared` project belongs in Tier A");
    expect(mappingGuide).toContain("### Agent-Related Surfaces");
  });

  it("creates init sprawl guardrails for future scaffold admission", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const guardrailsGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-sprawl-guardrails.md"),
      "utf8",
    );

    expect(guardrailsGuide).toContain("# Init Sprawl Guardrails");
    expect(guardrailsGuide).toContain("## Admission Tests");
    expect(guardrailsGuide).toContain("## Tier Admission Rules");
    expect(guardrailsGuide).toContain("### Tier A");
    expect(guardrailsGuide).toContain("### Tier B");
    expect(guardrailsGuide).toContain("### Tier C");
    expect(guardrailsGuide).toContain("### Tier D");
    expect(guardrailsGuide).toContain("## Default Init Guardrails");
    expect(guardrailsGuide).toContain("## Full Mode Guardrails");
    expect(guardrailsGuide).toContain("## Catalog-Only And Add-On Guardrails");
    expect(guardrailsGuide).toContain("## Anti-Sprawl Rules");
    expect(guardrailsGuide).toContain("Useful is not enough.");
    expect(guardrailsGuide).toContain(
      "`--full` must remain the broadest first-party scaffold mode, not a domain generator.",
    );
    expect(guardrailsGuide).toContain(
      "`--full` must not drift into domain-specific generation or project-subject-matter-specific content.",
    );
  });

  it("creates reusable setup planning tranches guidance for future milestone templates", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const planningTranchesGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "setup-planning-tranches.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(planningTranchesGuide).toContain("# Setup Planning Tranches");
    expect(planningTranchesGuide).toContain("## Reusable Planning Tranches");
    expect(planningTranchesGuide).toContain("### 1. Project Framing");
    expect(planningTranchesGuide).toContain("### 2. Taxonomy And Authority");
    expect(planningTranchesGuide).toContain("### 3. Lifecycle And State Modeling");
    expect(planningTranchesGuide).toContain("### 4. Capability And System Modeling");
    expect(planningTranchesGuide).toContain("### 5. Ownership And Interface Boundaries");
    expect(planningTranchesGuide).toContain("### 6. Documentation Structure And Authoring Model");
    expect(planningTranchesGuide).toContain("### 7. Taxonomy Normalization And Reconciliation");
    expect(planningTranchesGuide).toContain("### 8. Validation And Cleanup");
    expect(planningTranchesGuide).toContain("Setup milestones should seed planning tranches, not domain nouns.");
    expect(planningTranchesGuide).toContain("Discovery should still be used for:");
    expect(architectureReadme).toContain("[`governance/setup-planning-tranches.md`](governance/setup-planning-tranches.md)");
    expect(repoIndexContent).toContain("Reusable setup planning lanes are defined in `architecture/governance/setup-planning-tranches.md`.");
    expect(repoModel).toContain("Reusable setup planning lanes are defined in `architecture/governance/setup-planning-tranches.md`.");
  });

  it("creates reusable setup ordering guidance for late synthesis and dependency sequencing", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const orderingGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "setup-task-ordering.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(orderingGuide).toContain("# Setup Task Ordering And Dependency Rules");
    expect(orderingGuide).toContain("## Ordering Model");
    expect(orderingGuide).toContain("## Dependency Rules");
    expect(orderingGuide).toContain("## Early, Mid, And Late Placement");
    expect(orderingGuide).toContain("## Finalization Rule");
    expect(orderingGuide).toContain("Tasks such as `finalize architecture foundation` are end-of-sequence synthesis tasks.");
    expect(orderingGuide).toContain("1. project framing");
    expect(orderingGuide).toContain("8. final synthesis and validation");
    expect(orderingGuide).toContain("define system boundaries");
    expect(orderingGuide).toContain("finalize architecture foundation readiness");
    expect(architectureReadme).toContain("[`governance/setup-task-ordering.md`](governance/setup-task-ordering.md)");
    expect(repoIndexContent).toContain("Reusable setup ordering rules are defined in `architecture/governance/setup-task-ordering.md`.");
    expect(repoModel).toContain("Reusable setup ordering rules are defined in `architecture/governance/setup-task-ordering.md`.");
  });

  it("creates reusable discovery-versus-planned boundary guidance for setup milestones", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const boundaryGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "setup-discovery-boundary.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(boundaryGuide).toContain("# Discovery Vs Planned Work Boundary");
    expect(boundaryGuide).toContain("## Planned Work Criteria");
    expect(boundaryGuide).toContain("## Discovery Criteria");
    expect(boundaryGuide).toContain("## Not Valid Discovery");
    expect(boundaryGuide).toContain("## Review Rule");
    expect(boundaryGuide).toContain("## Template Rule");
    expect(boundaryGuide).toContain("project framing");
    expect(boundaryGuide).toContain("project-specific edge cases");
    expect(boundaryGuide).toContain("a discovered task repeats a generic setup category");
    expect(boundaryGuide).toContain("repeated discovered tasks should be treated as feedback on the setup template");
    expect(architectureReadme).toContain(
      "[`governance/setup-discovery-boundary.md`](governance/setup-discovery-boundary.md)",
    );
    expect(repoIndexContent).toContain(
      "Reusable setup discovery boundaries are defined in `architecture/governance/setup-discovery-boundary.md`.",
    );
    expect(repoModel).toContain(
      "Reusable setup discovery boundaries are defined in `architecture/governance/setup-discovery-boundary.md`.",
    );
  });

  it("creates reusable validation-and-cleanup placement guidance for setup milestones", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const placementGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "setup-validation-placement.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(placementGuide).toContain("# Validation And Cleanup Placement");
    expect(placementGuide).toContain("## Placement Rule");
    expect(placementGuide).toContain("## Sequence Relationship");
    expect(placementGuide).toContain("## Validation Responsibilities");
    expect(placementGuide).toContain("## Cleanup And Normalization Responsibilities");
    expect(placementGuide).toContain("## Separation Rule");
    expect(placementGuide).toContain("## Anti-Pattern");
    expect(placementGuide).toContain("1. definition work");
    expect(placementGuide).toContain("2. synthesis and reconciliation");
    expect(placementGuide).toContain("3. validation and cleanup");
    expect(placementGuide).toContain("Validation should review synthesized structure, not partially completed inputs.");
    expect(placementGuide).toContain("A milestone may combine validation and cleanup in one late-stage task");
    expect(architectureReadme).toContain(
      "[`governance/setup-validation-placement.md`](governance/setup-validation-placement.md)",
    );
    expect(repoIndexContent).toContain(
      "Reusable setup validation and cleanup placement rules are defined in `architecture/governance/setup-validation-placement.md`.",
    );
    expect(repoModel).toContain(
      "Reusable setup validation and cleanup placement rules are defined in `architecture/governance/setup-validation-placement.md`.",
    );
  });

  it("creates a revised setup template shape guide that assembles milestone 3 planning rules", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const templateShapeGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "setup-template-shape.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(templateShapeGuide).toContain("# Revised Setup Template Shape");
    expect(templateShapeGuide).toContain("## Recommended Setup Sequence");
    expect(templateShapeGuide).toContain("## Template Shape By Planning Tranche");
    expect(templateShapeGuide).toContain("## Placement Rules");
    expect(templateShapeGuide).toContain("## Discovery Rule");
    expect(templateShapeGuide).toContain("## Improvement Over The Older Shape");
    expect(templateShapeGuide).toContain("## Implementation Note");
    expect(templateShapeGuide).toContain("5. define taxonomy and authority model");
    expect(templateShapeGuide).toContain("6. define lifecycle and state boundaries");
    expect(templateShapeGuide).toContain("9. define documentation structure and authoring workflow");
    expect(templateShapeGuide).toContain("10. reconcile taxonomy and terminology");
    expect(templateShapeGuide).toContain("11. finalize setup synthesis");
    expect(templateShapeGuide).toContain("12. validate and clean up setup outputs");
    expect(templateShapeGuide).toContain("The current init scaffold may still use a smaller bootstrap sequence");
    expect(architectureReadme).toContain(
      "[`governance/setup-template-shape.md`](governance/setup-template-shape.md)",
    );
    expect(repoIndexContent).toContain(
      "The assembled revised setup milestone shape is defined in `architecture/governance/setup-template-shape.md`.",
    );
    expect(repoModel).toContain(
      "The assembled revised setup milestone shape is defined in `architecture/governance/setup-template-shape.md`.",
    );
  });

  it("creates a canonical first-party agent-surface strategy guide", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const strategyGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "agent-surface-strategy.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(strategyGuide).toContain("# Agent Surface Strategy");
    expect(strategyGuide).toContain("## Canonical First-Party Surfaces");
    expect(strategyGuide).toContain("## Surface Roles");
    expect(strategyGuide).toContain("## Default Model Rule");
    expect(strategyGuide).toContain("## Compatibility Surface Classification");
    expect(strategyGuide).toContain("## Compatibility Rule");
    expect(strategyGuide).toContain("## Source-Of-Truth Rule");
    expect(strategyGuide).toContain("## Mirroring Rule");
    expect(strategyGuide).toContain("## Conflict Rule");
    expect(strategyGuide).toContain("## Downstream Implications");
    expect(strategyGuide).toContain("### Entry-Point Milestone Constraints");
    expect(strategyGuide).toContain("### Workflow Milestone Constraints");
    expect(strategyGuide).toContain("### Handoff Rule");
    expect(strategyGuide).toContain("## Strategy Boundary");
    expect(strategyGuide).toContain("## Transitional Note");
    expect(strategyGuide).toContain("`AGENTS.md`");
    expect(strategyGuide).toContain("`CLAUDE.md`");
    expect(strategyGuide).toContain("`GEMINI.md`");
    expect(strategyGuide).toContain("`.github/copilot-instructions.md`");
    expect(strategyGuide).toContain("`.cursor/rules/project-arch.mdc`");
    expect(strategyGuide).toContain("`.windsurf/rules/project-arch.md`");
    expect(strategyGuide).toContain("`.claude/rules/project-arch.md`");
    expect(strategyGuide).toContain("`.amazonq/rules/project-arch.md`");
    expect(strategyGuide).toContain("Compatibility surfaces such as `.agent/*` are optional compatibility surfaces");
    expect(strategyGuide).toContain("supported only as optional compatibility");
    expect(strategyGuide).toContain("not part of the default first-party scaffold model");
    expect(strategyGuide).toContain("`.agent/instructions.md` must not be described as equal in authority");
    expect(strategyGuide).toContain("`.agent/workflows/` must not be treated as part of the default `pa init` model.");
    expect(strategyGuide).toContain("`AGENTS.md` is the canonical source of truth for always-on cross-agent instructions.");
    expect(strategyGuide).toContain("`CLAUDE.md`, `GEMINI.md`, and vendor-native rule files may mirror or adapt");
    expect(strategyGuide).toContain("when mirrored content conflicts with `AGENTS.md`, `AGENTS.md` wins");
    expect(strategyGuide).toContain("when a compatibility surface conflicts with any canonical first-party surface");
    expect(strategyGuide).toContain("later entry-point work must scaffold the canonical first-party surface set");
    expect(strategyGuide).toContain("workflow files must remain subordinate to the canonical first-party instruction set");
    expect(strategyGuide).toContain("Milestone 6 should implement canonical entry points against this strategy.");
    expect(strategyGuide).toContain("Milestone 7 should implement workflow scaffolding only after respecting this strategy");
    expect(strategyGuide).toContain("lower-case `agents.md` entry surface");
    expect(architectureReadme).toContain(
      "[`governance/agent-surface-strategy.md`](governance/agent-surface-strategy.md)",
    );
    expect(repoIndexContent).toContain(
      "The canonical first-party agent-surface model is defined in `architecture/governance/agent-surface-strategy.md`.",
    );
    expect(repoModel).toContain(
      "The canonical first-party agent-surface model is defined in `architecture/governance/agent-surface-strategy.md`.",
    );
  });

  it("creates a ratified canonical agent entry-point file inventory guide", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const fileListGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "agent-entry-point-file-list.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(fileListGuide).toContain("# Agent Entry-Point File List");
    expect(fileListGuide).toContain("## Purpose");
    expect(fileListGuide).toContain("## Ratified Default Inventory");
    expect(fileListGuide).toContain("## Default Scaffold Rule");
    expect(fileListGuide).toContain("## Always-Scaffolded Versus Applicable");
    expect(fileListGuide).toContain("## Relationship To Strategy");
    expect(fileListGuide).toContain("## Excluded From The Default Inventory");
    expect(fileListGuide).toContain("## Reuse Contract");
    expect(fileListGuide).toContain("`AGENTS.md`");
    expect(fileListGuide).toContain("`CLAUDE.md`");
    expect(fileListGuide).toContain("`GEMINI.md`");
    expect(fileListGuide).toContain("`.github/copilot-instructions.md`");
    expect(fileListGuide).toContain("`.cursor/rules/project-arch.mdc`");
    expect(fileListGuide).toContain("`.windsurf/rules/project-arch.md`");
    expect(fileListGuide).toContain("`.claude/rules/project-arch.md`");
    expect(fileListGuide).toContain("`.amazonq/rules/project-arch.md`");
    expect(fileListGuide).toContain("`.agent/*` compatibility surfaces");
    expect(architectureReadme).toContain(
      "[`governance/agent-entry-point-file-list.md`](governance/agent-entry-point-file-list.md)",
    );
    expect(repoIndexContent).toContain(
      "The canonical agent entry-point file inventory is defined in `architecture/governance/agent-entry-point-file-list.md`.",
    );
    expect(repoModel).toContain(
      "The canonical agent entry-point file inventory is defined in `architecture/governance/agent-entry-point-file-list.md`.",
    );
  });

  it("creates a shared canonical agent entry-point content model guide", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const contentModelGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "agent-entry-point-content-model.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(contentModelGuide).toContain("# Agent Entry-Point Content Model");
    expect(contentModelGuide).toContain("## Purpose");
    expect(contentModelGuide).toContain("## Canonical Content Source");
    expect(contentModelGuide).toContain("## Shared Instruction Categories");
    expect(contentModelGuide).toContain("## Authority Model");
    expect(contentModelGuide).toContain("## Adaptation Rules");
    expect(contentModelGuide).toContain("## File Relationship Model");
    expect(contentModelGuide).toContain("## Drift Prevention Rule");
    expect(contentModelGuide).toContain("## Reuse Contract");
    expect(contentModelGuide).toContain("`AGENTS.md` is the canonical source of truth");
    expect(contentModelGuide).toContain("`CLAUDE.md` and `GEMINI.md` are canonical vendor-specific root entry points");
    expect(contentModelGuide).toContain("`.github/copilot-instructions.md`");
    expect(contentModelGuide).toContain("tool requires a specialized syntax such as frontmatter");
    expect(architectureReadme).toContain(
      "[`governance/agent-entry-point-content-model.md`](governance/agent-entry-point-content-model.md)",
    );
    expect(repoIndexContent).toContain(
      "The shared canonical agent entry-point content model is defined in `architecture/governance/agent-entry-point-content-model.md`.",
    );
    expect(repoModel).toContain(
      "The shared canonical agent entry-point content model is defined in `architecture/governance/agent-entry-point-content-model.md`.",
    );
  });

  it("creates canonical init scaffolding guidance for agent entry-point surfaces", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const scaffoldingGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "agent-entry-point-scaffolding.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(scaffoldingGuide).toContain("# Agent Entry-Point Scaffolding");
    expect(scaffoldingGuide).toContain("## Purpose");
    expect(scaffoldingGuide).toContain("## Default Init Materialization");
    expect(scaffoldingGuide).toContain("## Placement Rules");
    expect(scaffoldingGuide).toContain("## Re-Init And Idempotency");
    expect(scaffoldingGuide).toContain("## Immediate Discovery Goal");
    expect(scaffoldingGuide).toContain("## Coexistence Rule");
    expect(scaffoldingGuide).toContain("## Transitional Note");
    expect(scaffoldingGuide).toContain("## Reuse Contract");
    expect(scaffoldingGuide).toContain("`--force`");
    expect(scaffoldingGuide).toContain("root-level entry-point files belong at repository root");
    expect(scaffoldingGuide).toContain("vendor-native supporting files should live in the native locations");
    expect(scaffoldingGuide).toContain("workflow files remain outside this scaffolding behavior");
    expect(architectureReadme).toContain(
      "[`governance/agent-entry-point-scaffolding.md`](governance/agent-entry-point-scaffolding.md)",
    );
    expect(repoIndexContent).toContain(
      "Canonical init behavior for agent entry-point scaffolding is defined in `architecture/governance/agent-entry-point-scaffolding.md`.",
    );
    expect(repoModel).toContain(
      "Canonical init behavior for agent entry-point scaffolding is defined in `architecture/governance/agent-entry-point-scaffolding.md`.",
    );
  });

  it("creates explicit exclusion guidance and compatibility hooks for agent entry-point scaffolding", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const exclusionGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "agent-entry-point-exclusions.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(exclusionGuide).toContain("# Agent Entry-Point Exclusions");
    expect(exclusionGuide).toContain("## Purpose");
    expect(exclusionGuide).toContain("## Explicit Exclusions");
    expect(exclusionGuide).toContain("## Exclusion Rule");
    expect(exclusionGuide).toContain("## Compatibility Hook Model");
    expect(exclusionGuide).toContain("## Workflow Deferral Rule");
    expect(exclusionGuide).toContain("## Future Add-On Direction");
    expect(exclusionGuide).toContain("## Reuse Contract");
    expect(exclusionGuide).toContain("`.agent/instructions.md`");
    expect(exclusionGuide).toContain("`.agent/workflows/`");
    expect(exclusionGuide).toContain("workflow scaffolding remains a later milestone");
    expect(exclusionGuide).toContain("compatibility generation is clearly labeled as optional or add-on behavior");
    expect(architectureReadme).toContain(
      "[`governance/agent-entry-point-exclusions.md`](governance/agent-entry-point-exclusions.md)",
    );
    expect(repoIndexContent).toContain(
      "Explicit exclusions and compatibility hooks for agent entry-point scaffolding are defined in `architecture/governance/agent-entry-point-exclusions.md`.",
    );
    expect(repoModel).toContain(
      "Explicit exclusions and compatibility hooks for agent entry-point scaffolding are defined in `architecture/governance/agent-entry-point-exclusions.md`.",
    );
  });

  it("creates workflow scaffolding scope guidance as a downstream helper layer", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const scopeGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-scaffolding-scope.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(scopeGuide).toContain("# Workflow Scaffolding Scope");
    expect(scopeGuide).toContain("## Purpose");
    expect(scopeGuide).toContain("## Scope");
    expect(scopeGuide).toContain("## Relationship To Canonical Entry Points");
    expect(scopeGuide).toContain("## Relationship To CLI Context Support");
    expect(scopeGuide).toContain("## What Workflow Scaffolding Solves");
    expect(scopeGuide).toContain("## What Workflow Scaffolding Must Not Do");
    expect(scopeGuide).toContain("## Activation Rule");
    expect(scopeGuide).toContain("## Reuse Contract");
    expect(scopeGuide).toContain("Workflow scaffolding is not a foundational instruction surface.");
    expect(scopeGuide).toContain("`AGENTS.md`");
    expect(scopeGuide).toContain("`pa context --json`");
    expect(scopeGuide).toContain("`<phase>`, `<milestone>`, or `<task>`");
    expect(scopeGuide).toContain("second primary repository instruction system");
    expect(architectureReadme).toContain(
      "[`governance/workflow-scaffolding-scope.md`](governance/workflow-scaffolding-scope.md)",
    );
    expect(repoIndexContent).toContain(
      "Workflow scaffolding scope is defined in `architecture/governance/workflow-scaffolding-scope.md`.",
    );
    expect(repoModel).toContain(
      "Workflow scaffolding scope is defined in `architecture/governance/workflow-scaffolding-scope.md`.",
    );
  });

  it("creates a constrained initial workflow inventory for first-pass scaffolding", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const initialSetGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-initial-set.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(initialSetGuide).toContain("# Initial Workflow Set");
    expect(initialSetGuide).toContain("## Purpose");
    expect(initialSetGuide).toContain("## Prioritization Rule");
    expect(initialSetGuide).toContain("## Ratified First Workflow Set");
    expect(initialSetGuide).toContain("### 1. `before-coding`");
    expect(initialSetGuide).toContain("### 2. `after-coding`");
    expect(initialSetGuide).toContain("### 3. `complete-task`");
    expect(initialSetGuide).toContain("### 4. `new-module`");
    expect(initialSetGuide).toContain("### 5. `diagnose`");
    expect(initialSetGuide).toContain("## Why These Workflows Come First");
    expect(initialSetGuide).toContain("## First-Pass Exclusions");
    expect(initialSetGuide).toContain("## Reuse Contract");
    expect(initialSetGuide).toContain("highest-value recurring agent helper flows");
    expect(initialSetGuide).toContain("Purpose: prepare an agent to start a coding session");
    expect(initialSetGuide).toContain("Purpose: run the immediate post-edit governance and validation loop");
    expect(initialSetGuide).toContain("Purpose: close out an active task cleanly");
    expect(initialSetGuide).toContain("Purpose: guide agents through the repository-governed setup path");
    expect(initialSetGuide).toContain("Purpose: provide a repeatable helper flow for debugging");
    expect(initialSetGuide).toContain("niche repository-specific flows");
    expect(initialSetGuide).toContain("workflow proliferation for every individual `pa` command");
    expect(architectureReadme).toContain(
      "[`governance/workflow-initial-set.md`](governance/workflow-initial-set.md)",
    );
    expect(repoIndexContent).toContain(
      "The first-pass workflow inventory is defined in `architecture/governance/workflow-initial-set.md`.",
    );
    expect(repoModel).toContain(
      "The first-pass workflow inventory is defined in `architecture/governance/workflow-initial-set.md`.",
    );
  });

  it("creates workflow-specific context consumption rules for later workflow scaffolding", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const workflowConsumptionGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-context-consumption.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(workflowConsumptionGuide).toContain("# Workflow Context Consumption");
    expect(workflowConsumptionGuide).toContain("## Purpose");
    expect(workflowConsumptionGuide).toContain("## Core Rule");
    expect(workflowConsumptionGuide).toContain("## Allowed Context Assumptions");
    expect(workflowConsumptionGuide).toContain("## Disallowed Context Assumptions");
    expect(workflowConsumptionGuide).toContain("## Required Workflow Behavior");
    expect(workflowConsumptionGuide).toContain("## Partial Or Missing Context");
    expect(workflowConsumptionGuide).toContain("## Alignment With Earlier Context Milestone");
    expect(workflowConsumptionGuide).toContain("## Anti-Duplication Rule");
    expect(workflowConsumptionGuide).toContain("## Reuse Contract");
    expect(workflowConsumptionGuide).toContain("`pa context --json`");
    expect(workflowConsumptionGuide).toContain("`<phase>`, `<milestone>`, or `<task>`");
    expect(workflowConsumptionGuide).toContain("workflows should stop and surface that context resolution is incomplete");
    expect(workflowConsumptionGuide).toContain("fail safely rather than guessing");
    expect(workflowConsumptionGuide).toContain("payload contract should be extended centrally");
    expect(architectureReadme).toContain(
      "[`governance/workflow-context-consumption.md`](governance/workflow-context-consumption.md)",
    );
    expect(repoIndexContent).toContain(
      "Workflow-specific context consumption rules are defined in `architecture/governance/workflow-context-consumption.md`.",
    );
    expect(repoModel).toContain(
      "Workflow-specific context consumption rules are defined in `architecture/governance/workflow-context-consumption.md`.",
    );
  });

  it("creates workflow init-tier placement guidance that keeps workflows optional", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const placementGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-init-tier-placement.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(placementGuide).toContain("# Workflow Init-Tier Placement");
    expect(placementGuide).toContain("## Placement Decision");
    expect(placementGuide).toContain("## Mode Decision");
    expect(placementGuide).toContain("## Why Workflow Scaffolding Is Tier D");
    expect(placementGuide).toContain("## Preconditions For Materialization");
    expect(placementGuide).toContain("## Relationship To `--full`");
    expect(placementGuide).toContain("## Relationship To Canonical Entry Points");
    expect(placementGuide).toContain("## Anti-Drift Rule");
    expect(placementGuide).toContain("## Reuse Contract");
    expect(placementGuide).toContain("Workflow scaffolding belongs in Tier D as optional add-on behavior.");
    expect(placementGuide).toContain("default `pa init`: does not scaffold workflow files");
    expect(placementGuide).toContain("`pa init --full`: does not automatically scaffold workflow files");
    expect(placementGuide).toContain("explicit add-on or later workflow adoption path");
    expect(placementGuide).toContain("canonical entry points remain Tier A foundational surfaces");
    expect(placementGuide).toContain("must not move workflow scaffolding into default init or implicit `--full` behavior");
    expect(architectureReadme).toContain(
      "[`governance/workflow-init-tier-placement.md`](governance/workflow-init-tier-placement.md)",
    );
    expect(repoIndexContent).toContain(
      "Workflow init-tier placement is defined in `architecture/governance/workflow-init-tier-placement.md`.",
    );
    expect(repoModel).toContain(
      "Workflow init-tier placement is defined in `architecture/governance/workflow-init-tier-placement.md`.",
    );
  });

  it("creates supported workflow generation surface guidance for the first implementation pass", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const surfacesGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-generation-surfaces.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(surfacesGuide).toContain("# Workflow Generation Surfaces");
    expect(surfacesGuide).toContain("## Purpose");
    expect(surfacesGuide).toContain("## First-Pass Supported Surface");
    expect(surfacesGuide).toContain("## First-Party Versus Compatibility");
    expect(surfacesGuide).toContain("## Explicit First-Pass Exclusions");
    expect(surfacesGuide).toContain("## Selection Rationale");
    expect(surfacesGuide).toContain("## Relationship To Canonical Entry Points");
    expect(surfacesGuide).toContain("## Reuse Contract");
    expect(surfacesGuide).toContain("`.github/workflows/*.md` as the first-party generated workflow-document surface");
    expect(surfacesGuide).toContain("`.agent/workflows/`");
    expect(surfacesGuide).toContain("multiple parallel workflow surfaces in the same repository by default");
    expect(surfacesGuide).toContain("canonical entry points remain the authoritative instruction surfaces");
    expect(architectureReadme).toContain(
      "[`governance/workflow-generation-surfaces.md`](governance/workflow-generation-surfaces.md)",
    );
    expect(repoIndexContent).toContain(
      "Supported workflow generation surfaces are defined in `architecture/governance/workflow-generation-surfaces.md`.",
    );
    expect(repoModel).toContain(
      "Supported workflow generation surfaces are defined in `architecture/governance/workflow-generation-surfaces.md`.",
    );
  });

  it("does not materialize workflow files during default init", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    await expect(
      fs.pathExists(path.join(tempDir, ".github", "workflows", "before-coding.md")),
    ).resolves.toBe(false);
  });

  it("materializes first-pass workflow files when workflow generation is explicitly enabled", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
        withWorkflows: true,
      },
      tempDir,
    );

    const workflowDir = path.join(tempDir, ".github", "workflows");
    const beforeCoding = await fs.readFile(path.join(workflowDir, "before-coding.md"), "utf8");
    const afterCoding = await fs.readFile(path.join(workflowDir, "after-coding.md"), "utf8");
    const completeTask = await fs.readFile(path.join(workflowDir, "complete-task.md"), "utf8");
    const newModule = await fs.readFile(path.join(workflowDir, "new-module.md"), "utf8");
    const diagnose = await fs.readFile(path.join(workflowDir, "diagnose.md"), "utf8");

    expect(beforeCoding).toContain("# Before Coding Workflow");
    expect(beforeCoding).toContain("## Required Context");
    expect(beforeCoding).toContain("## Canonical Command Sequence");
    expect(beforeCoding).toContain("## Validation Or Follow-Up Expectations");
    expect(beforeCoding).toContain("## Authority Reminder");
    expect(beforeCoding).toContain("## Adaptation Note");
    expect(beforeCoding).toContain("`pa context --json`");
    expect(beforeCoding).toContain("`AGENTS.md`");
    expect(beforeCoding).toContain("1. Resolve current structured context through `pa context --json` once that surface is available.");
    expect(beforeCoding).toContain("Do not start coding until the active task, target surfaces, and governing documents are clear.");
    expect(afterCoding).toContain("# After Coding Workflow");
    expect(afterCoding).toContain("Run `pa check` to validate the repository after implementation.");
    expect(afterCoding).toContain("If validation fails, return to diagnosis or repair work instead of proceeding to task completion.");
    expect(completeTask).toContain("# Complete Task Workflow");
    expect(completeTask).toContain("Update the active task file with progress, implementation notes, and verification results.");
    expect(newModule).toContain("# New Module Workflow");
    expect(newModule).toContain("Update architecture and arch-model artifacts that describe the new module boundary.");
    expect(diagnose).toContain("# Diagnose Workflow");
    expect(diagnose).toContain("Summarize the diagnosed issue in terms of repository governance, not only local symptoms.");
  });

  it("preserves existing workflow files on re-init without force and reports skips", async () => {
    const options = {
      template: "nextjs-turbo" as const,
      pm: "pnpm" as const,
      withWorkflows: true,
    };

    await initializeProject(options, tempDir);

    const workflowPath = path.join(tempDir, ".github", "workflows", "before-coding.md");
    const customWorkflow = "# Custom Before Coding Workflow\n\nUser-modified content.\n";
    await fs.writeFile(workflowPath, customWorkflow, "utf8");

    const output = await (async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await initializeProject(options, tempDir);
        return logSpy.mock.calls.flat().join("\n");
      } finally {
        logSpy.mockRestore();
      }
    })();

    await expect(fs.readFile(workflowPath, "utf8")).resolves.toBe(customWorkflow);
    expect(output).toContain("Skipped existing managed files:");
    expect(output).toContain(
      "Skipped (already exists): .github/workflows/before-coding.md — use --force to overwrite",
    );
  });

  it("overwrites existing workflow files on re-init with force", async () => {
    const options = {
      template: "nextjs-turbo" as const,
      pm: "pnpm" as const,
      withWorkflows: true,
    };

    await initializeProject(options, tempDir);

    const workflowPath = path.join(tempDir, ".github", "workflows", "before-coding.md");
    const customWorkflow = "# Custom Before Coding Workflow\n\nUser-modified content.\n";
    await fs.writeFile(workflowPath, customWorkflow, "utf8");

    const output = await (async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await initializeProject({ ...options, force: true }, tempDir);
        return logSpy.mock.calls.flat().join("\n");
      } finally {
        logSpy.mockRestore();
      }
    })();

    const rerendered = await fs.readFile(workflowPath, "utf8");
    expect(rerendered).not.toBe(customWorkflow);
    expect(rerendered).toContain("# Before Coding Workflow");
    expect(output).toContain("Overwriting: .github/workflows/before-coding.md");
  });

  it("keeps workflow generation idempotent without duplicate or variant filenames", async () => {
    const options = {
      template: "nextjs-turbo" as const,
      pm: "pnpm" as const,
      withWorkflows: true,
    };

    await initializeProject(options, tempDir);
    await initializeProject(options, tempDir);

    const workflowDir = path.join(tempDir, ".github", "workflows");
    const files = (await fs.readdir(workflowDir)).sort();

    expect(files).toEqual([
      "after-coding.md",
      "before-coding.md",
      "complete-task.md",
      "diagnose.md",
      "new-module.md",
    ]);
  });

  it("creates a first-pass workflow file inventory for the supported surface", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const inventoryGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-file-inventory.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(inventoryGuide).toContain("# Workflow File Inventory");
    expect(inventoryGuide).toContain("## Purpose");
    expect(inventoryGuide).toContain("## Supported Surface");
    expect(inventoryGuide).toContain("## First-Pass File Inventory");
    expect(inventoryGuide).toContain("## File Model Decision");
    expect(inventoryGuide).toContain("## Out-Of-Scope Workflow Files");
    expect(inventoryGuide).toContain("## Inventory Rationale");
    expect(inventoryGuide).toContain("## Reuse Contract");
    expect(inventoryGuide).toContain("`.github/workflows/`");
    expect(inventoryGuide).toContain("`.github/workflows/before-coding.md`");
    expect(inventoryGuide).toContain("`.github/workflows/after-coding.md`");
    expect(inventoryGuide).toContain("`.github/workflows/complete-task.md`");
    expect(inventoryGuide).toContain("`.github/workflows/new-module.md`");
    expect(inventoryGuide).toContain("`.github/workflows/diagnose.md`");
    expect(inventoryGuide).toContain("first pass uses one file per workflow");
    expect(inventoryGuide).toContain("does not introduce shared helper workflow files");
    expect(architectureReadme).toContain(
      "[`governance/workflow-file-inventory.md`](governance/workflow-file-inventory.md)",
    );
    expect(repoIndexContent).toContain(
      "The first-pass workflow file inventory is defined in `architecture/governance/workflow-file-inventory.md`.",
    );
    expect(repoModel).toContain(
      "The first-pass workflow file inventory is defined in `architecture/governance/workflow-file-inventory.md`.",
    );
  });

  it("creates a shared content model for generated workflow files", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const contentModelGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-content-model.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(contentModelGuide).toContain("# Workflow Content Model");
    expect(contentModelGuide).toContain("## Purpose");
    expect(contentModelGuide).toContain("## Required Content Blocks");
    expect(contentModelGuide).toContain("## Authority Model");
    expect(contentModelGuide).toContain("## Context Consumption Rule");
    expect(contentModelGuide).toContain("## Canonical Command Block");
    expect(contentModelGuide).toContain("## Fail-Safe Behavior");
    expect(contentModelGuide).toContain("## Optional Adaptation Block");
    expect(contentModelGuide).toContain("## Reuse Contract");
    expect(contentModelGuide).toContain("`AGENTS.md` remains the canonical always-on instruction source");
    expect(contentModelGuide).toContain("`pa context --json`");
    expect(contentModelGuide).toContain("`<phase>`, `<milestone>`, or `<task>`");
    expect(contentModelGuide).toContain("if required active context is missing, stop and surface the missing context");
    expect(contentModelGuide).toContain("if workflow guidance conflicts with canonical entry points, `AGENTS.md`");
    expect(architectureReadme).toContain(
      "[`governance/workflow-content-model.md`](governance/workflow-content-model.md)",
    );
    expect(repoIndexContent).toContain(
      "The generated workflow content model is defined in `architecture/governance/workflow-content-model.md`.",
    );
    expect(repoModel).toContain(
      "The generated workflow content model is defined in `architecture/governance/workflow-content-model.md`.",
    );
  });

  it("creates workflow generation and regeneration behavior guidance", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const behaviorGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-generation-behavior.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(behaviorGuide).toContain("# Workflow Generation Behavior");
    expect(behaviorGuide).toContain("## Purpose");
    expect(behaviorGuide).toContain("## Invocation Model");
    expect(behaviorGuide).toContain("## Optionality Rule");
    expect(behaviorGuide).toContain("## Re-Init And Regeneration");
    expect(behaviorGuide).toContain("## Existing File Handling");
    expect(behaviorGuide).toContain("## Unsupported Or Partial Surface Handling");
    expect(behaviorGuide).toContain("## Relationship To Canonical Entry Points");
    expect(behaviorGuide).toContain("## Reuse Contract");
    expect(behaviorGuide).toContain("should be invoked through an explicit add-on or later workflow-generation path");
    expect(behaviorGuide).toContain("should not be generated by default `pa init`");
    expect(behaviorGuide).toContain("should not be silently generated by `pa init --full`");
    expect(behaviorGuide).toContain("re-running generation without force should preserve existing workflow files");
    expect(behaviorGuide).toContain("regeneration with force may overwrite managed workflow files");
    expect(behaviorGuide).toContain("if the target workflow surface is unsupported");
    expect(architectureReadme).toContain(
      "[`governance/workflow-generation-behavior.md`](governance/workflow-generation-behavior.md)",
    );
    expect(repoIndexContent).toContain(
      "Workflow generation and regeneration behavior is defined in `architecture/governance/workflow-generation-behavior.md`.",
    );
    expect(repoModel).toContain(
      "Workflow generation and regeneration behavior is defined in `architecture/governance/workflow-generation-behavior.md`.",
    );
  });

  it("creates a cli context contract guide for future workflow context resolution", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const contractGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "cli-context-contract.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(contractGuide).toContain("# CLI Context Contract");
    expect(contractGuide).toContain("## Purpose");
    expect(contractGuide).toContain("## Core Problem");
    expect(contractGuide).toContain("## Command Intent");
    expect(contractGuide).toContain("## Boundary");
    expect(contractGuide).toContain("## Why This Matters");
    expect(contractGuide).toContain("## Reuse Contract");
    expect(contractGuide).toContain("`pa context --json`");
    expect(contractGuide).toContain("`<phase>`, `<milestone>`, and `<task>`");
    expect(contractGuide).toContain("The context command is for context resolution, not for workflow execution");
    expect(contractGuide).toContain("It should not:");
    expect(contractGuide).toContain("replace recommendation commands such as `pa next`");
    expect(architectureReadme).toContain(
      "[`governance/cli-context-contract.md`](governance/cli-context-contract.md)",
    );
    expect(repoIndexContent).toContain(
      "The CLI context-resolution contract is defined in `architecture/governance/cli-context-contract.md`.",
    );
    expect(repoModel).toContain(
      "The CLI context-resolution contract is defined in `architecture/governance/cli-context-contract.md`.",
    );
  });

  it("creates a minimum cli context payload guide for future workflow consumers", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const payloadGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "cli-context-payload.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(payloadGuide).toContain("# CLI Context Payload");
    expect(payloadGuide).toContain("## Purpose");
    expect(payloadGuide).toContain("## Minimum Payload");
    expect(payloadGuide).toContain("## Required Fields");
    expect(payloadGuide).toContain("## Optional Or Deferrable Fields");
    expect(payloadGuide).toContain("## Active Versus Recommended Context");
    expect(payloadGuide).toContain("## Placeholder Elimination");
    expect(payloadGuide).toContain("## Stability Rules");
    expect(payloadGuide).toContain("## Reuse Contract");
    expect(payloadGuide).toContain("`pa context --json`");
    expect(payloadGuide).toContain('"version": 1');
    expect(payloadGuide).toContain('"active": {');
    expect(payloadGuide).toContain('"recommended": {');
    expect(payloadGuide).toContain("`active.phase.id`, `active.phase.path`, `active.phase.title`");
    expect(payloadGuide).toContain("`active.task.id`, `active.task.path`, `active.task.title`, `active.task.status`");
    expect(payloadGuide).toContain("`recommended` is the next suggested context");
    expect(payloadGuide).toContain("`<phase>`, `<milestone>`, or `<task>`");
    expect(architectureReadme).toContain(
      "[`governance/cli-context-payload.md`](governance/cli-context-payload.md)",
    );
    expect(repoIndexContent).toContain(
      "The minimum CLI context payload is defined in `architecture/governance/cli-context-payload.md`.",
    );
    expect(repoModel).toContain(
      "The minimum CLI context payload is defined in `architecture/governance/cli-context-payload.md`.",
    );
  });

  it("creates downstream cli context consumption guidance for workflows and agents", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const consumptionGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "cli-context-consumption.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(consumptionGuide).toContain("# CLI Context Consumption");
    expect(consumptionGuide).toContain("## Purpose");
    expect(consumptionGuide).toContain("## Core Rule");
    expect(consumptionGuide).toContain("## Workflow Consumption");
    expect(consumptionGuide).toContain("## Prompt And Agent Consumption");
    expect(consumptionGuide).toContain("## Partial Or Absent Context");
    expect(consumptionGuide).toContain("## Recommended Context Handling");
    expect(consumptionGuide).toContain("## Anti-Duplication Rules");
    expect(consumptionGuide).toContain("## Downstream Constraints");
    expect(consumptionGuide).toContain("## Reuse Contract");
    expect(consumptionGuide).toContain("`pa context --json`");
    expect(consumptionGuide).toContain("`<phase>`, `<milestone>`, or `<task>`");
    expect(consumptionGuide).toContain("consumers should stop and surface that context resolution is incomplete");
    expect(consumptionGuide).toContain("should not silently invent phase, milestone, or task identifiers");
    expect(consumptionGuide).toContain("should not parse human-oriented output from other commands");
    expect(architectureReadme).toContain(
      "[`governance/cli-context-consumption.md`](governance/cli-context-consumption.md)",
    );
    expect(repoIndexContent).toContain(
      "Downstream CLI context consumption rules are defined in `architecture/governance/cli-context-consumption.md`.",
    );
    expect(repoModel).toContain(
      "Downstream CLI context consumption rules are defined in `architecture/governance/cli-context-consumption.md`.",
    );
  });

  it("creates cli surface relationship guidance for context, next, and reporting", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const relationshipGuide = await fs.readFile(
      path.join(
        tempDir,
        "architecture",
        "governance",
        "cli-context-surface-relationships.md",
      ),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(relationshipGuide).toContain("# CLI Context Surface Relationships");
    expect(relationshipGuide).toContain("## Purpose");
    expect(relationshipGuide).toContain("## `pa context` Versus `pa next`");
    expect(relationshipGuide).toContain("## `pa context` Versus Reporting Surfaces");
    expect(relationshipGuide).toContain("## Responsibility Split");
    expect(relationshipGuide).toContain("## Complement Rules");
    expect(relationshipGuide).toContain("## Anti-Collapse Rules");
    expect(relationshipGuide).toContain("## Downstream Selection Rule");
    expect(relationshipGuide).toContain("## Reuse Contract");
    expect(relationshipGuide).toContain("`pa context --json`");
    expect(relationshipGuide).toContain("`pa next`");
    expect(relationshipGuide).toContain("do not treat `pa next` as the canonical active-context source");
    expect(relationshipGuide).toContain("do not turn `pa context` into a broad reporting endpoint");
    expect(architectureReadme).toContain(
      "[`governance/cli-context-surface-relationships.md`](governance/cli-context-surface-relationships.md)",
    );
    expect(repoIndexContent).toContain(
      "CLI surface relationships for context, `pa next`, and reporting are defined in `architecture/governance/cli-context-surface-relationships.md`.",
    );
    expect(repoModel).toContain(
      "CLI surface relationships for context, `pa next`, and reporting are defined in `architecture/governance/cli-context-surface-relationships.md`.",
    );
  });

  it("creates a learn command boundary guide for path-scoped read-only analysis", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const boundaryGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "learn-command-boundary.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(boundaryGuide).toContain("# Learn Command Boundary");
    expect(boundaryGuide).toContain("## Purpose");
    expect(boundaryGuide).toContain("## Problem Statement");
    expect(boundaryGuide).toContain("## Core Command Role");
    expect(boundaryGuide).toContain("## Why It Is Distinct");
    expect(boundaryGuide).toContain("## Path Scope");
    expect(boundaryGuide).toContain("## Read-Only Rule");
    expect(boundaryGuide).toContain("## What It Must Not Do");
    expect(boundaryGuide).toContain("## First-Pass Usage Guidance");
    expect(boundaryGuide).toContain("## Reuse Contract");
    expect(boundaryGuide).toContain("`pa learn --path`");
    expect(boundaryGuide).toContain("scoped, read-only analysis command");
    expect(boundaryGuide).toContain("`pa check` owns broad validation");
    expect(boundaryGuide).toContain("`pa doctor` owns preflight command orchestration");
    expect(boundaryGuide).toContain("must not modify architecture files, roadmap files, or code automatically");
    expect(architectureReadme).toContain(
      "[`governance/learn-command-boundary.md`](governance/learn-command-boundary.md)",
    );
    expect(repoIndexContent).toContain(
      "The `pa learn --path` command boundary is defined in `architecture/governance/learn-command-boundary.md`.",
    );
    expect(repoModel).toContain(
      "The `pa learn --path` command boundary is defined in `architecture/governance/learn-command-boundary.md`.",
    );
  });

  it("creates a learn report contract guide for human-readable and JSON output", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const reportGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "learn-report-contract.md"),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(reportGuide).toContain("# Learn Report Contract");
    expect(reportGuide).toContain("## Purpose");
    expect(reportGuide).toContain("## Human-Readable Report Structure");
    expect(reportGuide).toContain("## Required Human-Readable Sections");
    expect(reportGuide).toContain("## JSON Output Contract");
    expect(reportGuide).toContain("## Required JSON Fields");
    expect(reportGuide).toContain("## File Versus Directory Representation");
    expect(reportGuide).toContain("## Follow-Up Guidance Rule");
    expect(reportGuide).toContain("## Read-Only Reporting Rule");
    expect(reportGuide).toContain("## First-Pass Example Shape");
    expect(reportGuide).toContain("## Reuse Contract");
    expect(reportGuide).toContain("`schemaVersion`");
    expect(reportGuide).toContain("`analyzedPaths`");
    expect(reportGuide).toContain("`findings: LearnFinding[]`");
    expect(reportGuide).toContain("`suggestedCommands: string[]`");
    expect(reportGuide).toContain("suggestions must not imply that `pa learn --path` mutates repository state");
    expect(reportGuide).toContain('"schemaVersion": "1.0"');
    expect(reportGuide).toContain(
      '"recommendedAction": "pa task new <phase> <milestone> --project <projectId>"',
    );
    expect(architectureReadme).toContain(
      "[`governance/learn-report-contract.md`](governance/learn-report-contract.md)",
    );
    expect(repoIndexContent).toContain(
      "The `pa learn --path` report contract is defined in `architecture/governance/learn-report-contract.md`.",
    );
    expect(repoModel).toContain(
      "The `pa learn --path` report contract is defined in `architecture/governance/learn-report-contract.md`.",
    );
  });

  it("creates a learn relationship guide for check and doctor ownership boundaries", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const relationshipGuide = await fs.readFile(
      path.join(
        tempDir,
        "architecture",
        "governance",
        "learn-check-doctor-relationship.md",
      ),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(relationshipGuide).toContain("# Learn, Check, And Doctor Relationship");
    expect(relationshipGuide).toContain("## Purpose");
    expect(relationshipGuide).toContain("## Command Ownership");
    expect(relationshipGuide).toContain("## `pa learn --path` Versus `pa check`");
    expect(relationshipGuide).toContain("## `pa learn --path` Versus `pa doctor`");
    expect(relationshipGuide).toContain("## Reuse Without Replacement");
    expect(relationshipGuide).toContain("## Usage Guidance");
    expect(relationshipGuide).toContain("## Anti-Overlap Rules");
    expect(relationshipGuide).toContain("## Help Text Implication");
    expect(relationshipGuide).toContain("## Reuse Contract");
    expect(relationshipGuide).toContain("`pa check` owns repository-wide structural validation");
    expect(relationshipGuide).toContain("`pa doctor` owns preflight command orchestration");
    expect(relationshipGuide).toContain("`pa learn --path` owns scoped interpretation of relevant drift");
    expect(relationshipGuide).toContain("must not absorb linting, policy checks, or full-repository validation orchestration");
    expect(relationshipGuide).toContain("do not turn `pa learn --path` into a second repository-wide validator");
    expect(architectureReadme).toContain(
      "[`governance/learn-check-doctor-relationship.md`](governance/learn-check-doctor-relationship.md)",
    );
    expect(repoIndexContent).toContain(
      "The relationship between `pa learn --path`, `pa check`, and `pa doctor` is defined in `architecture/governance/learn-check-doctor-relationship.md`.",
    );
    expect(repoModel).toContain(
      "The relationship between `pa learn --path`, `pa check`, and `pa doctor` is defined in `architecture/governance/learn-check-doctor-relationship.md`.",
    );
  });

  it("creates a learn future extension guide that defers mutation behavior", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const extensionGuide = await fs.readFile(
      path.join(
        tempDir,
        "architecture",
        "governance",
        "learn-future-extension-boundaries.md",
      ),
      "utf8",
    );
    const architectureReadme = await fs.readFile(
      path.join(tempDir, "architecture", "README.md"),
      "utf8",
    );
    const repoIndexContent = await fs.readFile(
      path.join(tempDir, "architecture", "REPO_INDEX.md"),
      "utf8",
    );
    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );

    expect(extensionGuide).toContain("# Learn Future Extension Boundaries");
    expect(extensionGuide).toContain("## Purpose");
    expect(extensionGuide).toContain("## Milestone 10 Rule");
    expect(extensionGuide).toContain("## Deferred Extension Flags");
    expect(extensionGuide).toContain("## Why Deferral Is Required");
    expect(extensionGuide).toContain("## Separate-Decision Rule");
    expect(extensionGuide).toContain("## Guardrails Against Implicit Escalation");
    expect(extensionGuide).toContain("## Relationship To Other Surfaces");
    expect(extensionGuide).toContain("## Sequencing Rule");
    expect(extensionGuide).toContain("## Reuse Contract");
    expect(extensionGuide).toContain("For milestone 10, `pa learn --path` is read-only.");
    expect(extensionGuide).toContain("- `--fix`");
    expect(extensionGuide).toContain("- `--apply`");
    expect(extensionGuide).toContain("requires a later, separate decision before implementation");
    expect(extensionGuide).toContain("do not let recommendation output silently become execution behavior");
    expect(architectureReadme).toContain(
      "[`governance/learn-future-extension-boundaries.md`](governance/learn-future-extension-boundaries.md)",
    );
    expect(repoIndexContent).toContain(
      "Future mutation boundaries for `pa learn --path` are defined in `architecture/governance/learn-future-extension-boundaries.md`.",
    );
    expect(repoModel).toContain(
      "Future mutation boundaries for `pa learn --path` are defined in `architecture/governance/learn-future-extension-boundaries.md`.",
    );
  });

  it("creates a migration guide for legacy taxonomy adoption", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const migrationGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "taxonomy-migration.md"),
      "utf8",
    );

    expect(migrationGuide).toContain("# Taxonomy Migration Guide");
    expect(migrationGuide).toContain("## Legacy To Canonical Mapping");
    expect(migrationGuide).toContain("## Partial Adoption Patterns");
    expect(migrationGuide).toContain("## Suggested Normalization Sequence");
    expect(migrationGuide).toContain("## Normalization Rules");
    expect(migrationGuide).toContain("architecture/foundation/prompt.md");
    expect(migrationGuide).toContain("architecture/product-framing/");
    expect(migrationGuide).toContain("architecture/legacy-architecture/system-boundaries.md");
    expect(migrationGuide).toContain("architecture/systems/");
    expect(migrationGuide).toContain("Do not require a flag day migration");
  });

  it("does not create legacy package scaffold directories during init", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const packagesDir = path.join(tempDir, "packages");
    expect(await fs.pathExists(packagesDir)).toBe(false);
  });

  it("does not create legacy scripts scaffold directory during init", async () => {
    await initializeProject(
      {
        template: "nextjs-turbo",
        pm: "pnpm",
      },
      tempDir,
    );

    const scriptsDir = path.join(tempDir, "scripts");
    expect(await fs.pathExists(scriptsDir)).toBe(false);
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
    expect(manifest.phases[0].projectId).toBe("shared");
    expect(manifest.activeProject).toBe("shared");
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
