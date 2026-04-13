import path from "path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test/helpers";
import { detectLegacyWorkflowDocumentCompatibility } from "./compatibility";

describe("core/workflow/compatibility", () => {
  it("detects legacy markdown workflow guides under .github/workflows", async () => {
    const context = await createTempDir();

    try {
      await fs.ensureDir(path.join(context.tempDir, ".github", "workflows"));
      await fs.ensureDir(path.join(context.tempDir, ".github", "workflows", "nested"));
      await fs.writeFile(
        path.join(context.tempDir, ".github", "workflows", "plan.md"),
        "# Legacy plan",
        "utf8",
      );
      await fs.writeFile(
        path.join(context.tempDir, ".github", "workflows", "nested", "handoff.md"),
        "# Legacy handoff",
        "utf8",
      );

      const status = await detectLegacyWorkflowDocumentCompatibility(context.tempDir);

      expect(status.mode).toBe("legacy-guidance-only");
      expect(status.legacyMarkdownGuides).toEqual([
        ".github/workflows/nested/handoff.md",
        ".github/workflows/plan.md",
      ]);
      expect(status.githubActionsWorkflows).toEqual([]);
    } finally {
      await context.cleanup();
    }
  });

  it("classifies GitHub Actions YAML files separately from legacy markdown guidance", async () => {
    const context = await createTempDir();

    try {
      await fs.ensureDir(path.join(context.tempDir, ".github", "workflows"));
      await fs.writeFile(
        path.join(context.tempDir, ".github", "workflows", "ci.yml"),
        "name: CI",
        "utf8",
      );
      await fs.writeFile(
        path.join(context.tempDir, ".github", "workflows", "release.yaml"),
        "name: Release",
        "utf8",
      );

      const status = await detectLegacyWorkflowDocumentCompatibility(context.tempDir);

      expect(status.mode).toBe("actions-only");
      expect(status.legacyMarkdownGuides).toEqual([]);
      expect(status.githubActionsWorkflows).toEqual([
        ".github/workflows/ci.yml",
        ".github/workflows/release.yaml",
      ]);
      expect(
        status.entries.every((entry) => entry.classification !== "legacy-markdown-guidance"),
      ).toBe(true);
    } finally {
      await context.cleanup();
    }
  });

  it("reports mixed mode when legacy markdown and GitHub Actions files coexist", async () => {
    const context = await createTempDir();

    try {
      await fs.ensureDir(path.join(context.tempDir, ".github", "workflows"));
      await fs.ensureDir(path.join(context.tempDir, ".project-arch", "workflows"));

      await fs.writeFile(
        path.join(context.tempDir, ".github", "workflows", "legacy-guide.md"),
        "# Legacy Guide",
        "utf8",
      );
      await fs.writeFile(
        path.join(context.tempDir, ".github", "workflows", "build.yml"),
        "name: Build",
        "utf8",
      );
      await fs.writeFile(
        path.join(context.tempDir, ".project-arch", "workflows", "dev.workflow.md"),
        "# Canonical Workflow",
        "utf8",
      );

      const status = await detectLegacyWorkflowDocumentCompatibility(context.tempDir);

      expect(status.mode).toBe("mixed");
      expect(status.canonicalWorkflowDocuments).toEqual([
        ".project-arch/workflows/dev.workflow.md",
      ]);
      expect(status.legacyMarkdownGuides).toEqual([".github/workflows/legacy-guide.md"]);
      expect(status.githubActionsWorkflows).toEqual([".github/workflows/build.yml"]);
    } finally {
      await context.cleanup();
    }
  });

  it("returns absent mode when no legacy workflow files exist", async () => {
    const context = await createTempDir();

    try {
      const status = await detectLegacyWorkflowDocumentCompatibility(context.tempDir);

      expect(status.mode).toBe("absent");
      expect(status.legacyRootExists).toBe(false);
      expect(status.legacyMarkdownGuides).toEqual([]);
      expect(status.githubActionsWorkflows).toEqual([]);
      expect(status.entries).toEqual([]);
    } finally {
      await context.cleanup();
    }
  });

  it("treats canonical-only workflow documents as non-legacy state", async () => {
    const context = await createTempDir();

    try {
      await fs.ensureDir(path.join(context.tempDir, ".project-arch", "workflows"));
      await fs.writeFile(
        path.join(context.tempDir, ".project-arch", "workflows", "before-coding.workflow.md"),
        "# Canonical workflow",
        "utf8",
      );

      const status = await detectLegacyWorkflowDocumentCompatibility(context.tempDir);

      expect(status.mode).toBe("absent");
      expect(status.canonicalRootExists).toBe(true);
      expect(status.legacyRootExists).toBe(false);
      expect(status.canonicalWorkflowDocuments).toEqual([
        ".project-arch/workflows/before-coding.workflow.md",
      ]);
      expect(status.legacyMarkdownGuides).toEqual([]);
      expect(status.githubActionsWorkflows).toEqual([]);
    } finally {
      await context.cleanup();
    }
  });
});
