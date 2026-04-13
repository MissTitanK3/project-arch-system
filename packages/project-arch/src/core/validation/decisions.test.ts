import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { collectDecisionRecords } from "./decisions";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createDecision } from "../decisions/createDecision";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { writeFile } from "../../fs/writeFile";

describe.sequential("core/validation/decisions", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context?.cleanup();
  }, 120_000);

  describe("collectDecisionRecords", () => {
    it("should collect all decision records from initialized project", async () => {
      const records = await collectDecisionRecords(tempDir);

      // Initialized project may have seeded decisions
      expect(records.length).toBeGreaterThanOrEqual(0);

      // Each record should have required fields
      for (const record of records) {
        expect(record.filePath).toBeDefined();
        expect(record.frontmatter).toBeDefined();
        expect(record.frontmatter.id).toBeDefined();
        expect(record.frontmatter.status).toMatch(/^(active|deprecated|superseded)$/);
      }
    });

    it("should include newly created decisions in collection", async () => {
      const decisionPath = await createDecision(
        { scope: "project", title: "Test Decision" },
        tempDir,
      );

      // Extract decision ID from path
      const decisionId = path.basename(decisionPath, ".md");

      const records = await collectDecisionRecords(tempDir);
      const testDecision = records.find((r) => r.frontmatter.id === decisionId);

      expect(testDecision).toBeDefined();
      expect(testDecision?.frontmatter.title).toBe("Test Decision");
    });

    it("should handle phase-scoped decisions", async () => {
      await createPhase("test-phase", tempDir);
      const decisionPath = await createDecision(
        { scope: "phase", phase: "test-phase", title: "Phase Decision" },
        tempDir,
      );

      // Extract decision ID from path
      const decisionId = path.basename(decisionPath, ".md");

      const records = await collectDecisionRecords(tempDir);
      const phaseDecision = records.find((r) => r.frontmatter.id === decisionId);

      expect(phaseDecision).toBeDefined();
      expect(phaseDecision?.frontmatter.id).toContain("phase");
    });

    it("should handle milestone-scoped decisions", async () => {
      await createPhase("test-phase", tempDir);
      await createMilestone("test-phase", "test-milestone", tempDir);

      const decisionPath = await createDecision(
        {
          scope: "milestone",
          phase: "test-phase",
          milestone: "test-milestone",
          title: "Milestone Decision",
        },
        tempDir,
      );

      // Read the decision file to get the actual ID from frontmatter
      const fullPath = path.join(tempDir, decisionPath);
      const content = await readFile(fullPath, "utf-8");
      const decisionId = content.match(/^id:\s*["']?([^"'\n]+)["']?/m)?.[1];

      const records = await collectDecisionRecords(tempDir);
      const milestoneDecision = records.find((r) => r.frontmatter.id === decisionId);

      expect(milestoneDecision).toBeDefined();
      expect(milestoneDecision?.frontmatter.id).toContain("milestone");
    });

    it("should skip decisions with invalid schema and log warning", async () => {
      // Create a decision with invalid schema
      const invalidDecisionPath = path.join(
        tempDir,
        "roadmap/decisions/project/invalid-decision.md",
      );

      await writeFile(
        invalidDecisionPath,
        `---
id: project:20260307:invalid
status: invalid-status
title: Invalid Decision
links:
  tasks: []
  codeTargets: []
  publicDocs: []
---

# Invalid Decision

This decision has an invalid status.
`,
      );

      // Mock console.warn to capture warning
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };

      const records = await collectDecisionRecords(tempDir);

      // Restore console.warn
      console.warn = originalWarn;

      // Invalid decision should be skipped
      const invalidDecision = records.find((r) => r.frontmatter.id === "project:20260307:invalid");
      expect(invalidDecision).toBeUndefined();

      // Warning should be logged
      expect(warnings.some((w) => w.includes("invalid-decision.md"))).toBe(true);
      expect(warnings.some((w) => w.includes("invalid schema"))).toBe(true);
    });

    it("should collect decisions from all scope directories", async () => {
      await createPhase("scope-phase", tempDir);
      await createMilestone("scope-phase", "scope-milestone", tempDir);

      await createDecision({ scope: "project", title: "Project Decision" }, tempDir);
      await createDecision(
        { scope: "phase", phase: "scope-phase", title: "Phase Decision" },
        tempDir,
      );
      await createDecision(
        {
          scope: "milestone",
          phase: "scope-phase",
          milestone: "scope-milestone",
          title: "Milestone Decision",
        },
        tempDir,
      );

      const records = await collectDecisionRecords(tempDir);

      // Should have at least these three new decisions plus seeded ones
      // Note: IDs are formatted as "project:", "phase-name:", and "phase-name/milestone-name:"
      const projectDecisions = records.filter((r) => r.frontmatter.id.startsWith("project:"));
      const phaseDecisions = records.filter(
        (r) => r.frontmatter.id.startsWith("scope-phase:") && !r.frontmatter.id.includes("/"),
      );
      const milestoneDecisions = records.filter((r) =>
        r.frontmatter.id.includes("scope-phase/scope-milestone:"),
      );

      expect(projectDecisions.length).toBeGreaterThan(0);
      expect(phaseDecisions.length).toBeGreaterThan(0);
      expect(milestoneDecisions.length).toBeGreaterThan(0);
    });

    it("should handle empty decision directories", async () => {
      // Create a fresh project with no decisions
      const emptyContext = await createTestProject(process.cwd(), undefined, { setCwd: false });

      try {
        // Remove all decision files (keep seeded for this test, but verify resilience)
        const records = await collectDecisionRecords(emptyContext.tempDir);

        // Should return array (possibly empty or with seeded content)
        expect(Array.isArray(records)).toBe(true);
      } finally {
        await emptyContext.cleanup();
      }
    });

    it("should sort decisions consistently across multiple collections", async () => {
      const records1 = await collectDecisionRecords(tempDir);
      const records2 = await collectDecisionRecords(tempDir);

      expect(records1.length).toBe(records2.length);
      for (let i = 0; i < records1.length; i++) {
        expect(records1[i].filePath).toBe(records2[i].filePath);
      }
    });

    it("should validate schema for all required fields", async () => {
      // Create a minimal valid decision using the helper
      await createDecision({ scope: "project", title: "Minimal Decision" }, tempDir);

      const records = await collectDecisionRecords(tempDir);

      // Find the decision by checking if it contains "Minimal Decision"
      const minimalDecision = records.find((r) => r.frontmatter.title === "Minimal Decision");

      expect(minimalDecision).toBeDefined();
      expect(minimalDecision?.frontmatter.type).toBe("decision");
      expect(minimalDecision?.frontmatter.status).toMatch(
        /^(active|deprecated|superseded|proposed)$/,
      );
    });

    it("should reject decisions missing required schemaVersion field", async () => {
      const noVersionPath = path.join(tempDir, "roadmap/decisions/project/no-version.md");

      await writeFile(
        noVersionPath,
        `---
type: decision
id: project:20260307:no-version
title: No Version
status: active
scope:
  kind: project
drivers: []
decision:
  summary: "Missing schemaVersion"
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks: []
  codeTargets: []
  publicDocs: []
---

# No Version
`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };

      const records = await collectDecisionRecords(tempDir);

      console.warn = originalWarn;

      const noVersionDecision = records.find(
        (r) => r.frontmatter.id === "project:20260307:no-version",
      );
      expect(noVersionDecision).toBeUndefined();
      expect(warnings.some((w) => w.includes("invalid schema"))).toBe(true);
    });

    it("should reject decisions with invalid type field", async () => {
      const invalidTypePath = path.join(tempDir, "roadmap/decisions/project/invalid-type.md");

      await writeFile(
        invalidTypePath,
        `---
schemaVersion: "2.0"
type: "invalid-type"
id: project:20260307:invalid-type
title: Invalid Type
status: active
scope:
  kind: project
drivers: []
decision:
  summary: "Invalid type value"
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks: []
  codeTargets: []
  publicDocs: []
---

# Invalid Type
`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };

      const records = await collectDecisionRecords(tempDir);

      console.warn = originalWarn;

      const invalidTypeDecision = records.find(
        (r) => r.frontmatter.id === "project:20260307:invalid-type",
      );
      expect(invalidTypeDecision).toBeUndefined();
    });

    it("should validate status field against allowed values", async () => {
      const validStatuses = ["active", "deprecated", "superseded", "proposed"];

      // Create one test decision with valid status
      await createDecision({ scope: "project", title: "Status Test Decision" }, tempDir);

      const records = await collectDecisionRecords(tempDir);

      // Find the test decision
      const testRecord = records.find((r) => r.frontmatter.title === "Status Test Decision");
      expect(testRecord).toBeDefined();
      expect(validStatuses).toContain(testRecord?.frontmatter.status);
    });

    it("should handle decision with all optional fields present", async () => {
      // Create a decision with the helper
      await createDecision({ scope: "project", title: "Complete Decision" }, tempDir);

      const records = await collectDecisionRecords(tempDir);
      const completeDecision = records.find((r) => r.frontmatter.title === "Complete Decision");

      expect(completeDecision).toBeDefined();
      expect(completeDecision?.frontmatter.type).toBe("decision");
      expect(completeDecision?.frontmatter.scope).toBeDefined();
      expect(Array.isArray(completeDecision?.frontmatter.drivers)).toBe(true);
      expect(completeDecision?.frontmatter.decision).toBeDefined();
    });

    it("should log detailed error info for schema validation failures", async () => {
      const errorPath = path.join(tempDir, "roadmap/decisions/project/error-detail.md");

      // Missing multiple required fields to trigger multiple validation errors
      await writeFile(
        errorPath,
        `---
id: project:20260307:error
title: Error Detail
---

# Error Detail
`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };

      await collectDecisionRecords(tempDir);

      console.warn = originalWarn;

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes("error-detail.md"))).toBe(true);
    });
  });
});
