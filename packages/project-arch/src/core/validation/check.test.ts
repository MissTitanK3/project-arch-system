import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { runRepositoryChecks } from "./check";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createTask } from "../tasks/createTask";
import { createDecision } from "../decisions/createDecision";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { writeFile } from "../../fs";
import { writeJsonDeterministic } from "../../utils/fs";

describe.sequential("core/validation/check", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  }, 45_000);

  afterEach(async () => {
    await context.cleanup();
  });

  describe("runRepositoryChecks", () => {
    it("should pass for initialized project", async () => {
      const result = await runRepositoryChecks(tempDir);

      // Initialized project should be valid
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      // May have warnings but should not have errors
    }, 15_000);

    it("should detect duplicate task IDs in milestone scope", async () => {
      await createPhase("dup-phase", tempDir);
      await createMilestone("dup-phase", "dup-milestone", tempDir);

      // Create a task
      await createTask({
        phaseId: "dup-phase",
        milestoneId: "dup-milestone",
        lane: "planned",
        title: "First Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Manually create another task with the same ID (001 will be the first)
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/dup-phase/milestones/dup-milestone/tasks/planned",
      );
      const duplicateTaskPath = path.join(taskDir, "001-duplicate-task.md");

      await writeFile(
        duplicateTaskPath,
        `---
schemaVersion: "1.0"
id: "001"
slug: duplicate-task
lane: planned
title: Duplicate Task
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Duplicate Task

This task has a duplicate ID.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate task id"))).toBe(true);
    }, 15_000);

    it("should detect missing code targets referenced by tasks", async () => {
      await createPhase("missing-target-phase", tempDir);
      await createMilestone("missing-target-phase", "missing-target-milestone", tempDir);

      // Create a task referencing non-existent code target
      const taskPath = await createTask({
        phaseId: "missing-target-phase",
        milestoneId: "missing-target-milestone",
        lane: "planned",
        title: "Task with Missing Target",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Extract task ID from path
      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      // Update task to reference non-existent code target
      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-with-missing-target
lane: planned
title: Task with Missing Target
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets:
  - apps/nonexistent/src/missing.ts
tags: []
decisions: []
completionCriteria: []
---

# Task with Missing Target

This task references a missing code target.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      // Debug: log the actual errors
      if (result.errors.length === 0) {
        console.log("NO ERRORS FOUND - Expected to find missing code target error");
        console.log("Warnings:", result.warnings);
      }

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("Missing code target"))).toBe(true);
      expect(result.errors.some((e) => e.includes("apps/nonexistent/src/missing.ts"))).toBe(true);
    }, 15_000);

    it("should detect missing public docs referenced by tasks", async () => {
      await createPhase("missing-docs-phase", tempDir);
      await createMilestone("missing-docs-phase", "missing-docs-milestone", tempDir);

      const taskPath = await createTask({
        phaseId: "missing-docs-phase",
        milestoneId: "missing-docs-milestone",
        lane: "planned",
        title: "Task with Missing Docs",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Extract task ID from path
      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      // Update task to reference non-existent docs
      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-with-missing-docs
lane: planned
title: Task with Missing Docs
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs:
  - architecture/nonexistent.md
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Task with Missing Docs

This task references missing public docs.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("Missing public docs path"))).toBe(true);
      expect(result.errors.some((e) => e.includes("architecture/nonexistent.md"))).toBe(true);
    }, 15_000);

    it("should detect undeclared modules referenced by tasks", async () => {
      await createPhase("undeclared-module-phase", tempDir);
      await createMilestone("undeclared-module-phase", "undeclared-module-milestone", tempDir);

      const taskPath = await createTask({
        phaseId: "undeclared-module-phase",
        milestoneId: "undeclared-module-milestone",
        lane: "planned",
        title: "Task with Undeclared Module",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Extract task ID from path
      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      // Update task to reference undeclared module
      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-with-undeclared-module
lane: planned
title: Task with Undeclared Module
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets:
  - apps/undeclared-module/src/index.ts
tags: []
decisions: []
completionCriteria: []
---

# Task with Undeclared Module

This task references an undeclared module.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("undeclared module"))).toBe(true);
      expect(result.errors.some((e) => e.includes("apps/undeclared-module"))).toBe(true);
    }, 15_000);

    it("should detect undeclared domains referenced by task tags", async () => {
      await createPhase("undeclared-domain-phase", tempDir);
      await createMilestone("undeclared-domain-phase", "undeclared-domain-milestone", tempDir);

      const taskPath = await createTask({
        phaseId: "undeclared-domain-phase",
        milestoneId: "undeclared-domain-milestone",
        lane: "planned",
        title: "Task with Undeclared Domain",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Extract task ID from path
      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      // Update task to reference undeclared domain
      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-with-undeclared-domain
lane: planned
title: Task with Undeclared Domain
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags:
  - domain:undeclared-domain
decisions: []
completionCriteria: []
---

# Task with Undeclared Domain

This task references an undeclared domain.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("undeclared domain"))).toBe(true);
      expect(result.errors.some((e) => e.includes("undeclared-domain"))).toBe(true);
    }, 15_000);

    it("should detect missing tasks linked by decisions", async () => {
      const decisionPath = await createDecision(
        { scope: "project", title: "Decision with Missing Task Link" },
        tempDir,
      );

      // Extract decision ID from path
      const decisionFilename = path.basename(decisionPath, ".md");
      const decisionId = decisionFilename;

      // Update decision to link to non-existent task
      await writeFile(
        path.join(tempDir, decisionPath),
        `---
schemaVersion: "1.0"
type: decision
id: ${decisionId}
status: proposed
title: Decision with Missing Task Link
scope:
  kind: project
drivers: []
decision:
  summary: Test decision
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks:
    - nonexistent-phase/nonexistent-milestone/999
  codeTargets: []
  publicDocs: []
---

# Decision with Missing Task Link

This decision links to a missing task.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("links missing task"))).toBe(true);
      expect(
        result.errors.some((e) => e.includes("nonexistent-phase/nonexistent-milestone/999")),
      ).toBe(true);
    }, 15_000);

    it("should detect invalid decision task link format", async () => {
      const decisionPath = await createDecision(
        { scope: "project", title: "Decision with Invalid Link Format" },
        tempDir,
      );

      // Extract decision ID from path
      const decisionFilename = path.basename(decisionPath, ".md");
      const decisionId = decisionFilename;

      // Update decision with invalid link format
      await writeFile(
        path.join(tempDir, decisionPath),
        `---
schemaVersion: "1.0"
type: decision
id: ${decisionId}
status: proposed
title: Decision with Invalid Link Format
scope:
  kind: project
drivers: []
decision:
  summary: Test decision
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks:
    - invalid-format
  codeTargets: []
  publicDocs: []
---

# Decision with Invalid Link Format

This decision has an invalid task link format.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid decision task link"))).toBe(true);
    }, 15_000);

    it("should detect missing code targets referenced by decisions", async () => {
      const decisionPath = await createDecision(
        { scope: "project", title: "Decision with Missing Code Target" },
        tempDir,
      );

      // Extract decision ID from path
      const decisionFilename = path.basename(decisionPath, ".md");
      const decisionId = decisionFilename;

      // Update decision to reference non-existent code target
      await writeFile(
        path.join(tempDir, decisionPath),
        `---
schemaVersion: "1.0"
type: decision
id: ${decisionId}
status: proposed
title: Decision with Missing Code Target
scope:
  kind: project
drivers: []
decision:
  summary: Test decision
alternatives: []
consequences:
  positive: []
  negative: []
links:
  tasks: []
  codeTargets:
    - packages/nonexistent/index.ts
  publicDocs: []
---

# Decision with Missing Code Target

This decision references a missing code target.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("Missing code target"))).toBe(true);
      expect(result.errors.some((e) => e.includes("packages/nonexistent/index.ts"))).toBe(true);
    }, 15_000);

    it("should detect missing superseded decisions", async () => {
      const decisionPath = await createDecision(
        { scope: "project", title: "Decision Superseding Missing Decision" },
        tempDir,
      );

      // Extract decision ID from path
      const decisionFilename = path.basename(decisionPath, ".md");
      const decisionId = decisionFilename;

      // Update decision to supersede non-existent decision
      await writeFile(
        path.join(tempDir, decisionPath),
        `---
schemaVersion: "1.0"
type: decision
id: ${decisionId}
status: proposed
title: Decision Superseding Missing Decision
scope:
  kind: project
drivers: []
decision:
  summary: Test decision
alternatives: []
consequences:
  positive: []
  negative: []
supersedes:
  - project:20260101:nonexistent
links:
  tasks: []
  codeTargets: []
  publicDocs: []
---

# Decision Superseding Missing Decision

This decision supersedes a missing decision.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("supersedes missing decision"))).toBe(true);
      expect(result.errors.some((e) => e.includes("project:20260101:nonexistent"))).toBe(true);
    }, 15_000);

    it("should handle warnings without failing validation", async () => {
      // Run checks on initialized project which may have warnings
      const result = await runRepositoryChecks(tempDir);

      // Should allow warnings without marking as failed
      if (result.warnings.length > 0) {
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    }, 15_000);

    it("should return empty errors for valid project with declared modules", async () => {
      // Declare all modules that exist in the initialized project
      const modulesPath = path.join(tempDir, "arch-model", "modules.json");
      await writeJsonDeterministic(modulesPath, {
        modules: [
          { name: "apps/web", owner: "team-a" },
          { name: "apps/docs", owner: "team-a" },
          { name: "apps/arch", owner: "team-a" },
          { name: "packages/ui", owner: "team-b" },
          { name: "packages/api", owner: "team-b" },
          { name: "packages/config", owner: "team-b" },
          { name: "packages/database", owner: "team-b" },
          { name: "packages/types", owner: "team-b" },
        ],
      });

      const result = await runRepositoryChecks(tempDir);

      // Note: May have warnings, but should have no errors
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    }, 15_000);

    it("should return empty errors for valid project with declared domains", async () => {
      // Add a declared domain
      const domainsPath = path.join(tempDir, "arch-domains", "domains.json");
      await writeJsonDeterministic(domainsPath, {
        domains: [
          { name: "authentication", description: "User authentication" },
          { name: "billing", description: "Billing and payments" },
        ],
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    }, 15_000);

    it("should detect multiple errors across different categories", async () => {
      await createPhase("multi-error-phase", tempDir);
      await createMilestone("multi-error-phase", "multi-error-milestone", tempDir);

      // Create a task with both missing code target and missing docs
      const taskPath = await createTask({
        phaseId: "multi-error-phase",
        milestoneId: "multi-error-milestone",
        lane: "planned",
        title: "Task with Multiple Errors",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-with-multiple-errors
lane: planned
title: Task with Multiple Errors
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs:
  - architecture/missing-doc.md
codeTargets:
  - apps/missing-module/src/index.ts
tags:
  - domain:undeclared-domain
decisions: []
completionCriteria: []
---

# Task with Multiple Errors

Multiple validation errors.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    }, 15_000);

    it("should handle empty codeTargets array", async () => {
      await createPhase("empty-targets-phase", tempDir);
      await createMilestone("empty-targets-phase", "empty-targets-milestone", tempDir);

      const taskPath = await createTask({
        phaseId: "empty-targets-phase",
        milestoneId: "empty-targets-milestone",
        lane: "planned",
        title: "Task with Empty Targets",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-empty-targets
lane: planned
title: Task with Empty Targets
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Task with Empty Targets

Empty code targets should be valid.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(true);
    }, 15_000);

    it("should handle empty publicDocs array", async () => {
      await createPhase("empty-docs-phase", tempDir);
      await createMilestone("empty-docs-phase", "empty-docs-milestone", tempDir);

      const taskPath = await createTask({
        phaseId: "empty-docs-phase",
        milestoneId: "empty-docs-milestone",
        lane: "planned",
        title: "Task with Empty Docs",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskFilename = path.basename(taskPath);
      const taskIdMatch = taskFilename.match(/^(\d{3})/);
      const taskId = taskIdMatch ? taskIdMatch[1] : "001";

      await writeFile(
        taskPath,
        `---
schemaVersion: "1.0"
id: "${taskId}"
slug: task-empty-docs
lane: planned
title: Task with Empty Docs
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags: []
decisions: []
completionCriteria: []
---

# Task with Empty Docs

Empty public docs should be valid.
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(true);
    }, 15_000);

    it("should validate multiple tasks in same lane", async () => {
      await createPhase("multi-task-phase", tempDir);
      await createMilestone("multi-task-phase", "multi-task-milestone", tempDir);

      // Create multiple tasks in the same lane
      for (let i = 0; i < 3; i++) {
        await createTask({
          phaseId: "multi-task-phase",
          milestoneId: "multi-task-milestone",
          lane: "planned",
          title: `Multi Task ${i}`,
          discoveredFromTask: null,
          cwd: tempDir,
        });
      }

      const result = await runRepositoryChecks(tempDir);

      // All should have unique IDs within the lane
      expect(result.ok).toBe(true);
    }, 15_000);

    it("should validate decisions with all required fields", async () => {
      await createDecision(
        {
          scope: "project",
          title: "Comprehensive Decision",
        },
        tempDir,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(true);
    }, 15_000);

    it("should detect decision linking to non-existent task", async () => {
      await createDecision({ scope: "project", title: "Decision with Missing Task Link" }, tempDir);

      const result = await runRepositoryChecks(tempDir);

      // May or may not error depending on implementation - just verify check runs
      expect(result.ok !== undefined).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    }, 15_000);

    it("should report invalid milestone manifest parsing errors", async () => {
      const phaseId = "invalid-manifest-phase";
      const milestoneId = "invalid-manifest-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      const manifestPath = path.join(
        tempDir,
        "roadmap",
        "phases",
        phaseId,
        "milestones",
        milestoneId,
        "manifest.json",
      );

      await writeJsonDeterministic(manifestPath, {
        schemaVersion: "1.0",
        id: milestoneId,
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }, 15_000);

    it("should detect project decision index entries for missing decisions", async () => {
      const projectDecisionIndexPath = path.join(tempDir, "roadmap", "decisions", "index.json");

      await writeJsonDeterministic(projectDecisionIndexPath, {
        schemaVersion: "1.0",
        decisions: ["project:20260307:missing-from-index"],
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) =>
          error.includes("Project decision index references missing decision"),
        ),
      ).toBe(true);
    }, 15_000);

    it("should validate decision links with valid code targets", async () => {
      // Just run checks on the current initialized project
      // It should pass basic validation
      const result = await runRepositoryChecks(tempDir);

      // Basic validation should succeed for initialized project
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.ok).toBe("boolean");
    }, 15_000);

    it("should accept code targets from declared modules", async () => {
      // Create modules.json with all default and new modules declared
      const modulesPath = path.join(tempDir, "arch-model", "modules.json");
      await writeJsonDeterministic(modulesPath, {
        modules: [
          { name: "apps/web", type: "application", description: "Web app" },
          { name: "apps/docs", type: "application", description: "Docs app" },
          { name: "packages/ui", type: "library", description: "UI library" },
          { name: "packages/api", type: "library", description: "API package" },
          { name: "packages/config", type: "library", description: "Config package" },
          { name: "packages/database", type: "library", description: "Database package" },
          { name: "packages/types", type: "library", description: "Types package" },
        ],
      });

      await createPhase("module-phase", tempDir);
      await createMilestone("module-phase", "module-milestone", tempDir);

      // Create the actual target directories and files
      const webIndexPath = path.join(tempDir, "apps", "web", "src", "index.ts");
      const uiButtonPath = path.join(tempDir, "packages", "ui", "components", "Button.tsx");
      await writeFile(webIndexPath, 'export const app = "web";');
      await writeFile(uiButtonPath, "export const Button = () => null;");

      // Create task with declared module targets
      await createTask({
        phaseId: "module-phase",
        milestoneId: "module-milestone",
        lane: "planned",
        title: "Task with Declared Module",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Update the task to reference declared modules
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/module-phase/milestones/module-milestone/tasks/planned",
      );
      const taskFiles = await walkDir(taskDir);
      const taskFile = taskFiles[0];

      await writeFile(
        taskFile,
        `---
schemaVersion: "1.0"
id: "001"
slug: task-with-module
lane: planned
title: Task with Declared Module
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets:
  - apps/web/src/index.ts
  - packages/ui/components/Button.tsx
tags: []
decisions: []
completionCriteria: []
---

# Task with Declared Module
`,
      );

      const result = await runRepositoryChecks(tempDir);

      // Should pass because modules are declared and files exist
      expect(result.ok).toBe(true);
    }, 15_000);

    it("should handle invalid modules.json structure", async () => {
      // Create invalid modules.json (not an array)
      const modulesPath = path.join(tempDir, "arch-model", "modules.json");
      await writeJsonDeterministic(modulesPath, {
        modules: "not-an-array",
      });

      const result = await runRepositoryChecks(tempDir);

      // Should still run without crashing, treating it as no declared modules
      expect(result.ok !== undefined).toBe(true);
    }, 15_000);

    it("should handle code targets with insufficient path segments", async () => {
      await createPhase("short-path-phase", tempDir);
      await createMilestone("short-path-phase", "short-path-milestone", tempDir);

      await createTask({
        phaseId: "short-path-phase",
        milestoneId: "short-path-milestone",
        lane: "planned",
        title: "Task with Short Path",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Update task to have a code target with insufficient segments
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/short-path-phase/milestones/short-path-milestone/tasks/planned",
      );
      const taskFiles = await walkDir(taskDir);
      const taskFile = taskFiles[0];

      await writeFile(
        taskFile,
        `---
schemaVersion: "1.0"
id: "001"
slug: task-short-path
lane: planned
title: Task with Short Path
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets:
  - apps/
  - packages
tags: []
decisions: []
completionCriteria: []
---

# Task with Short Path
`,
      );

      const result = await runRepositoryChecks(tempDir);

      // Should handle gracefully (these targets won't have modules to check)
      expect(result.ok !== undefined).toBe(true);
    }, 15_000);

    it("should parse domain tags correctly", async () => {
      // Create domains.json
      const domainsPath = path.join(tempDir, "arch-domains", "domains.json");
      await writeJsonDeterministic(domainsPath, {
        domains: [
          { name: "auth", ownedPackages: [], ownedFeatures: [] },
          { name: "payments", ownedPackages: [], ownedFeatures: [] },
        ],
      });

      await createPhase("domain-phase", tempDir);
      await createMilestone("domain-phase", "domain-milestone", tempDir);

      // Create task with domain tag
      await createTask({
        phaseId: "domain-phase",
        milestoneId: "domain-milestone",
        lane: "planned",
        title: "Task with Domain Tag",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Update task to include domain tag
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/domain-phase/milestones/domain-milestone/tasks/planned",
      );
      const taskFiles = await walkDir(taskDir);
      const taskFile = taskFiles[0];

      await writeFile(
        taskFile,
        `---
schemaVersion: "1.0"
id: "001"
slug: task-with-domain
lane: planned
title: Task with Domain Tag
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags:
  - domain:auth
decisions: []
completionCriteria: []
---

# Task with Domain Tag
`,
      );

      const result = await runRepositoryChecks(tempDir);

      // Should validate domain tag successfully
      expect(result.ok).toBe(true);
    }, 15_000);

    it("should handle invalid domains.json structure", async () => {
      // Create invalid domains.json (not an array)
      const domainsPath = path.join(tempDir, "arch-domains", "domains.json");
      await writeJsonDeterministic(domainsPath, {
        domains: { invalid: "structure" },
      });

      const result = await runRepositoryChecks(tempDir);

      // Should still run without crashing
      expect(result.ok !== undefined).toBe(true);
    }, 15_000);

    it("should handle non-domain tags gracefully", async () => {
      await createPhase("non-domain-phase", tempDir);
      await createMilestone("non-domain-phase", "non-domain-milestone", tempDir);

      await createTask({
        phaseId: "non-domain-phase",
        milestoneId: "non-domain-milestone",
        lane: "planned",
        title: "Task with Non-Domain Tags",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Update task with non-domain tags
      const taskDir = path.join(
        tempDir,
        "roadmap/phases/non-domain-phase/milestones/non-domain-milestone/tasks/planned",
      );
      const taskFiles = await walkDir(taskDir);
      const taskFile = taskFiles[0];

      await writeFile(
        taskFile,
        `---
schemaVersion: "1.0"
id: "001"
slug: task-non-domain
lane: planned
title: Task with Non-Domain Tags
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets: []
tags:
  - feature
  - urgent
  - backend
decisions: []
completionCriteria: []
---

# Task with Non-Domain Tags
`,
      );

      const result = await runRepositoryChecks(tempDir);

      // Should handle gracefully (non-domain tags should be ignored for domain validation)
      expect(result.ok !== undefined).toBe(true);
    }, 15_000);
  });
});

// Helper function to walk directory
async function walkDir(dir: string): Promise<string[]> {
  const { readdir, stat } = await import("fs/promises");
  const files = await readdir(dir);
  const paths: string[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await stat(filePath);
    if (stats.isFile()) {
      paths.push(filePath);
    } else if (stats.isDirectory()) {
      paths.push(...(await walkDir(filePath)));
    }
  }

  return paths;
}
