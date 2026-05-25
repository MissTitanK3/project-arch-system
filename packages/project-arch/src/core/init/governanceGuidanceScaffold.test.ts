import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pathExists } from "../../utils/fs";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { scaffoldAgentsGuide, scaffoldGovernanceGuidanceDocs } from "./governanceGuidanceScaffold";

async function writeMarkdownFile(targetPath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, content, "utf8");
}

describe("core/init/governanceGuidanceScaffold", () => {
  let tempDir: string;
  let tempContext: TestProjectContext;

  beforeEach(async () => {
    tempContext = await createTempDir();
    tempDir = tempContext.tempDir;
  });

  afterEach(async () => {
    await tempContext.cleanup();
  });

  it("writes governance guidance docs into architecture/governance", async () => {
    await scaffoldGovernanceGuidanceDocs(tempDir, { pathExists, writeMarkdownFile });

    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );
    const workflowGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-content-model.md"),
      "utf8",
    );
    const workflowSurfacesGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-generation-surfaces.md"),
      "utf8",
    );
    const workflowInventoryGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "workflow-file-inventory.md"),
      "utf8",
    );
    const taxonomyMigrationGuide = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "taxonomy-migration.md"),
      "utf8",
    );

    expect(repoModel).toContain("# Repository Mental Model");
    expect(repoModel).toContain("## Init Tier Model");
    expect(workflowGuide).toContain("# Workflow Content Model");
    expect(workflowGuide).toContain("## Required Content Blocks");
    expect(workflowSurfacesGuide).toContain(".project-arch/workflows/*.workflow.md");
    expect(workflowSurfacesGuide).not.toContain(".github/workflows/*.md");
    expect(workflowInventoryGuide).toContain(".project-arch/workflows/before-coding.workflow.md");
    expect(workflowInventoryGuide).toContain(".project-arch/workflows/after-coding.workflow.md");
    expect(workflowInventoryGuide).toContain(".project-arch/workflows/complete-task.workflow.md");
    expect(workflowInventoryGuide).toContain(".project-arch/workflows/new-module.workflow.md");
    expect(workflowInventoryGuide).toContain(".project-arch/workflows/diagnose.workflow.md");
    expect(workflowInventoryGuide).not.toContain(".github/workflows/");
    expect(taxonomyMigrationGuide).toContain("# Taxonomy Migration Guide");
    expect(taxonomyMigrationGuide).toContain("## Legacy To Canonical Mapping");

    expect(repoModel).toContain("pa init --mono");
  });

  it("does not overwrite an existing governance guidance file", async () => {
    const repoModelPath = path.join(tempDir, "architecture", "governance", "REPO-MODEL.md");
    await writeMarkdownFile(repoModelPath, "# Existing Repo Model\n");

    await scaffoldGovernanceGuidanceDocs(tempDir, { pathExists, writeMarkdownFile });

    expect(await fs.readFile(repoModelPath, "utf8")).toBe("# Existing Repo Model\n");
  });

  it("keeps generated task command guidance aligned with milestone-2 posture", async () => {
    await scaffoldGovernanceGuidanceDocs(tempDir, { pathExists, writeMarkdownFile });

    const learnReportContract = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "learn-report-contract.md"),
      "utf8",
    );

    expect(learnReportContract).toContain('"recommendedAction": "pa task new <phase> <milestone>"');
    expect(learnReportContract).toContain(
      '"suggestedCommands": ["pa task new <phase> <milestone>"]',
    );
    expect(learnReportContract).not.toMatch(
      /pa task\s+(new|discover|idea|status|lanes)[^\n]*--project\s+<projectId>/,
    );
  });

  it("keeps generated path guidance project-placeholder-first with shared bootstrap-only examples", async () => {
    await scaffoldGovernanceGuidanceDocs(tempDir, { pathExists, writeMarkdownFile });

    const repoModel = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "REPO-MODEL.md"),
      "utf8",
    );
    const initDefaultBehavior = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-default-behavior.md"),
      "utf8",
    );

    expect(repoModel).toContain(
      "Location: `roadmap/projects/<project>/phases/`, `roadmap/decisions/`",
    );

    expect(initDefaultBehavior).toContain(
      "- `roadmap/projects/shared/manifest.json` (reserved bootstrap project)",
    );
    expect(initDefaultBehavior).toContain(
      "- `roadmap/projects/shared/overview.md` (reserved bootstrap project)",
    );
    expect(initDefaultBehavior).toContain(
      "When a repository needs project-specific delivery planning beyond `shared`",
    );
    expect(initDefaultBehavior).toContain("add a new directory under `roadmap/projects/<name>/`.");
    expect(initDefaultBehavior).toContain(
      "- reserve `shared` for the default cross-cutting bootstrap project",
    );
    expect(initDefaultBehavior).toContain("## First-Run No-Test Baseline");
    expect(initDefaultBehavior).toContain("fresh-scaffold no-test baseline");
    expect(initDefaultBehavior).toContain("No projects matched the filters");
    expect(initDefaultBehavior).toContain("`task typecheck`, `task lint`, and `task test`");
    expect(initDefaultBehavior).toContain("`task check` emits one intentional baseline message");
    expect(initDefaultBehavior).toContain("if `pa` is unavailable on PATH");
    expect(initDefaultBehavior).toContain("task arch:check:json");
    expect(initDefaultBehavior).toContain("pnpm check:json");
    expect(initDefaultBehavior).toContain(
      "For operator flow, see `README.md`; for executable entrypoints, see `Taskfile.yml`.",
    );
    expect(initDefaultBehavior).toContain(
      "intentional and should not be treated as scaffold breakage",
    );
  });

  it("writes the root agents guide", async () => {
    await scaffoldAgentsGuide(tempDir, { pathExists, writeMarkdownFile });

    const agentsGuide = await fs.readFile(path.join(tempDir, "agents.md"), "utf8");
    expect(agentsGuide).toContain("# Agents Guide");
    expect(agentsGuide).toContain("## 3. Agent Execution Workflow");
    expect(agentsGuide).toContain("#### Project Architecture CLI (pa)");
  });

  it("does not overwrite an existing agents guide", async () => {
    const agentsGuidePath = path.join(tempDir, "agents.md");
    await writeMarkdownFile(agentsGuidePath, "# Existing Agents Guide\n");

    await scaffoldAgentsGuide(tempDir, { pathExists, writeMarkdownFile });

    expect(await fs.readFile(agentsGuidePath, "utf8")).toBe("# Existing Agents Guide\n");
  });
});
