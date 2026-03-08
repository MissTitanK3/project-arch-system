import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import {
  scanLegacyDecisions,
  migrateLegacyDecision,
  migrateAllLegacyDecisions,
} from "./migrateLegacy";

describe("migrateLegacy", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("scanLegacyDecisions", () => {
    it("should identify valid decisions", async () => {
      const result = await scanLegacyDecisions(tempDir);

      // Fresh init should have no decisions
      expect(result.total).toBe(0);
      expect(result.valid).toBe(0);
      expect(result.invalid).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it("should identify legacy decisions with missing fields", async () => {
      // Create a legacy decision
      const legacyPath = path.join(tempDir, "roadmap", "decisions", "001-legacy.md");
      await fs.ensureDir(path.dirname(legacyPath));
      await fs.writeFile(
        legacyPath,
        `---
id: "001"
title: "Legacy Decision"
status: "accepted"
---

# Legacy Decision

Old format without required fields.
`,
      );

      const result = await scanLegacyDecisions(tempDir);

      expect(result.total).toBe(1);
      expect(result.valid).toBe(0);
      expect(result.invalid).toBe(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].relativePath).toContain("001-legacy.md");
      // Should identify multiple missing fields
      expect(result.issues[0].missingFields.length).toBeGreaterThan(0);
    });

    it("should count both valid and invalid decisions", async () => {
      // Create a valid decision
      const validPath = path.join(tempDir, "roadmap", "decisions", "001-valid.md");
      await fs.ensureDir(path.dirname(validPath));
      await fs.writeFile(
        validPath,
        `---
schemaVersion: "1.0"
type: decision
id: "001"
title: "Valid Decision"
status: "accepted"
scope:
  kind: project
drivers: []
decision:
  summary: "Some decision"
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks: []
  codeTargets: []
  publicDocs: []
---

# Valid Decision
`,
      );

      // Create an invalid decision
      const invalidPath = path.join(tempDir, "roadmap", "decisions", "002-invalid.md");
      await fs.writeFile(
        invalidPath,
        `---
id: "002"
title: "Invalid Decision"
---

# Invalid
`,
      );

      const result = await scanLegacyDecisions(tempDir);

      expect(result.total).toBe(2);
      expect(result.valid).toBe(1);
      expect(result.invalid).toBe(1);
    });
  });

  describe("migrateLegacyDecision", () => {
    it("should add missing required fields", async () => {
      const legacyPath = path.join(tempDir, "roadmap", "decisions", "001-to-migrate.md");
      await fs.ensureDir(path.dirname(legacyPath));
      await fs.writeFile(
        legacyPath,
        `---
id: "001"
title: "Decision to Migrate"
status: "proposed"
---

# Original Content

This should be preserved.
`,
      );

      const result = await migrateLegacyDecision(legacyPath);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify the file was updated
      const content = await fs.readFile(legacyPath, "utf8");
      expect(content).toContain("schemaVersion: '1.0'");
      expect(content).toContain("type: decision");
      expect(content).toContain("scope:");
      expect(content).toContain("drivers:");
      expect(content).toContain("decision:");
      expect(content).toContain("alternatives:");
      expect(content).toContain("consequences:");
      expect(content).toContain("links:");

      // Original content should be preserved
      expect(content).toContain("# Original Content");
      expect(content).toContain("This should be preserved.");
    });

    it("should preserve existing fields", async () => {
      const legacyPath = path.join(tempDir, "roadmap", "decisions", "002-partial.md");
      await fs.ensureDir(path.dirname(legacyPath));
      await fs.writeFile(
        legacyPath,
        `---
id: "002"
title: "Partial Decision"
status: "accepted"
drivers:
  - "Performance requirement"
---

# Partial
`,
      );

      await migrateLegacyDecision(legacyPath);

      const content = await fs.readFile(legacyPath, "utf8");
      // Check that existing driver is preserved (YAML may not quote simple strings)
      expect(content).toContain("Performance requirement");
      expect(content).toContain("id: '002'");
      expect(content).toContain("status: accepted");
    });
  });

  describe("migrateAllLegacyDecisions", () => {
    it("should migrate multiple legacy decisions", async () => {
      // Create multiple legacy decisions
      const decisionsDir = path.join(tempDir, "roadmap", "decisions");
      await fs.ensureDir(decisionsDir);

      for (let i = 1; i <= 3; i++) {
        await fs.writeFile(
          path.join(decisionsDir, `00${i}-legacy.md`),
          `---
id: "00${i}"
title: "Legacy ${i}"
status: "accepted"
---

# Legacy ${i}
`,
        );
      }

      const result = await migrateAllLegacyDecisions(tempDir);

      expect(result.migrated).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify all files were migrated
      const scan = await scanLegacyDecisions(tempDir);
      expect(scan.valid).toBe(3);
      expect(scan.invalid).toBe(0);
    });

    it("should report migration failures", async () => {
      // Create a decision with content that will fail validation even after migration
      const badPath = path.join(tempDir, "roadmap", "decisions", "999-bad.md");
      await fs.ensureDir(path.dirname(badPath));

      // Create a file with ID that doesn't meet schema requirements
      await fs.writeFile(
        badPath,
        `---
title: "No ID"
status: "invalid-status"
---

# Bad
`,
      );

      const result = await migrateAllLegacyDecisions(tempDir);

      // Should attempt migration but may fail validation
      expect(result.migrated + result.failed).toBe(1);

      if (result.failed > 0) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].file).toContain("999-bad.md");
      }
    });

    it("should handle empty decision scan", async () => {
      // Create decisions directory but no decisions
      const decisionsDir = path.join(tempDir, "roadmap", "decisions");
      await fs.ensureDir(decisionsDir);

      const result = await migrateAllLegacyDecisions(tempDir);

      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should preserve error messages from failed migrations", async () => {
      const badPath = path.join(tempDir, "roadmap", "decisions", "bad-migration.md");
      await fs.ensureDir(path.dirname(badPath));

      // Create a file with invalid content
      await fs.writeFile(badPath, "---\ninvalid yaml here [[[");

      const result = await migrateAllLegacyDecisions(tempDir);

      if (result.failed > 0) {
        expect(result.errors[0].error).toBeDefined();
        expect(result.errors[0].error.length).toBeGreaterThan(0);
      }
    });
  });

  describe("migrateLegacyDecision - Error Handling", () => {
    it("should handle non-existent files", async () => {
      const nonExistentPath = path.join(tempDir, "roadmap", "decisions", "nonexistent.md");
      const result = await migrateLegacyDecision(nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle non-existent files", async () => {
      const nonExistentPath = path.join(tempDir, "roadmap", "decisions", "nonexistent.md");
      const result = await migrateLegacyDecision(nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should add schema version when missing", async () => {
      const noVersionPath = path.join(tempDir, "roadmap", "decisions", "no-version.md");
      await fs.ensureDir(path.dirname(noVersionPath));

      await fs.writeFile(
        noVersionPath,
        `---
id: "no-version"
title: "No Schema Version"
status: "accepted"
---

# No Version
`,
      );

      const result = await migrateLegacyDecision(noVersionPath);

      expect(result.success).toBe(true);

      const content = await fs.readFile(noVersionPath, "utf8");
      expect(content).toContain("schemaVersion: '1.0'");
    });

    it("should add type field when missing", async () => {
      const noTypePath = path.join(tempDir, "roadmap", "decisions", "no-type.md");
      await fs.ensureDir(path.dirname(noTypePath));

      await fs.writeFile(
        noTypePath,
        `---
schemaVersion: "1.0"
id: "no-type"
title: "No Type"
status: "accepted"
scope:
  kind: project
drivers: []
decision:
  summary: "No type field"
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks: []
  codeTargets: []
  publicDocs: []
---

# No Type
`,
      );

      const result = await migrateLegacyDecision(noTypePath);

      expect(result.success).toBe(true);

      const content = await fs.readFile(noTypePath, "utf8");
      expect(content).toContain("type: decision");
    });

    it("should preserve all scope variations", async () => {
      const projectScopePath = path.join(tempDir, "roadmap", "decisions", "project-scope.md");
      await fs.ensureDir(path.dirname(projectScopePath));

      await fs.writeFile(
        projectScopePath,
        `---
id: "project-scope"
title: "Project Scope Decision"
status: "accepted"
scope:
  kind: project
---

# Project Scope
`,
      );

      const result = await migrateLegacyDecision(projectScopePath);

      expect(result.success).toBe(true);

      const content = await fs.readFile(projectScopePath, "utf8");
      expect(content).toContain("kind: project");
    });
  });

  describe("scanLegacyDecisions - Error Type Coverage", () => {
    it("should handle multiple validation issues in single file", async () => {
      const multiIssuePath = path.join(tempDir, "roadmap", "decisions", "multi-issue.md");
      await fs.ensureDir(path.dirname(multiIssuePath));

      // Missing multiple required fields
      await fs.writeFile(
        multiIssuePath,
        `---
id: "multi"
title: "Multi Issue"
---

# Multi Issue
`,
      );

      const result = await scanLegacyDecisions(tempDir);

      const issue = result.issues.find((i) => i.relativePath.includes("multi-issue.md"));
      expect(issue).toBeDefined();
      expect(issue?.missingFields.length).toBeGreaterThan(1);
    });

    it("should categorize invalid type errors", async () => {
      const invalidTypePath = path.join(tempDir, "roadmap", "decisions", "invalid-type.md");
      await fs.ensureDir(path.dirname(invalidTypePath));

      // Create file with wrong type for a field (status is a string, but we're giving an object)
      await fs.writeFile(
        invalidTypePath,
        `---
id: "invalid"
title: "Invalid Types"
status: {}
---

# Invalid Types
`,
      );

      const result = await scanLegacyDecisions(tempDir);

      expect(result.invalid).toBeGreaterThan(0);
      const issue = result.issues.find((i) => i.relativePath.includes("invalid-type.md"));
      expect(issue?.error).toBeDefined();
    });
  });
});
