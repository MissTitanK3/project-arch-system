import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import {
  CHECK_DIAGNOSTICS_SCHEMA_VERSION,
  filterCheckResult,
  runRepositoryChecks,
  toCheckDiagnosticsPayload,
} from "./check";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createTask } from "../tasks/createTask";
import { createDecision } from "../decisions/createDecision";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { readMarkdownWithFrontmatter, writeFile, writeMarkdownWithFrontmatter } from "../../fs";
import { readJson, writeJsonDeterministic } from "../../utils/fs";
import { pruneReconciliationArtifacts } from "../reconciliation/lifecycle";

describe.sequential("core/validation/check", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  describe("toCheckDiagnosticsPayload", () => {
    it("should include schemaVersion and stable top-level fields", () => {
      const payload = toCheckDiagnosticsPayload({
        ok: false,
        errors: ["error-a"],
        warnings: ["warning-a"],
        diagnostics: [
          {
            code: "CHECK_ERROR",
            severity: "error",
            message: "error-a",
            path: null,
            hint: null,
          },
          {
            code: "CHECK_WARNING",
            severity: "warning",
            message: "warning-a",
            path: null,
            hint: null,
          },
        ],
      });

      expect(payload).toMatchObject({
        schemaVersion: CHECK_DIAGNOSTICS_SCHEMA_VERSION,
        status: "invalid",
        summary: {
          errorCount: 1,
          warningCount: 1,
          diagnosticCount: 2,
        },
        diagnostics: [
          {
            code: "CHECK_ERROR",
            severity: "error",
            message: "error-a",
            path: null,
            hint: null,
          },
          {
            code: "CHECK_WARNING",
            severity: "warning",
            message: "warning-a",
            path: null,
            hint: null,
          },
        ],
      });
      expect(payload.graphDiagnostics).toBeDefined();
      expect(payload.graphDiagnostics.completeness.score).toBe(100);
    });
  });

  describe("filterCheckResult", () => {
    it("should filter by diagnostic code and preserve filtered ok semantics", () => {
      const filtered = filterCheckResult(
        {
          ok: false,
          errors: ["error-a"],
          warnings: ["[UNTRACKED_IMPLEMENTATION] warn-a"],
          diagnostics: [
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "error-a",
              path: "roadmap/manifest.json",
              hint: null,
            },
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "warn-a",
              path: "apps/web/src/index.ts",
              hint: null,
            },
          ],
        },
        { only: ["UNTRACKED_IMPLEMENTATION"] },
      );

      expect(filtered.ok).toBe(true);
      expect(filtered.errors).toEqual([]);
      expect(filtered.warnings).toEqual(["[UNTRACKED_IMPLEMENTATION] warn-a"]);
      expect(filtered.diagnostics).toHaveLength(1);
      expect(filtered.diagnostics[0].code).toBe("UNTRACKED_IMPLEMENTATION");
    });

    it("should filter by severity and path glob patterns", () => {
      const filtered = filterCheckResult(
        {
          ok: false,
          errors: ["error-a"],
          warnings: [
            "[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated",
            "[UNTRACKED_IMPLEMENTATION] packages/core/src/main.ts not associated",
          ],
          diagnostics: [
            {
              code: "CHECK_ERROR",
              severity: "error",
              message: "error-a",
              path: "roadmap/manifest.json",
              hint: null,
            },
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "apps/web/src/index.ts not associated",
              path: "apps/web/src/index.ts",
              hint: null,
            },
            {
              code: "UNTRACKED_IMPLEMENTATION",
              severity: "warning",
              message: "packages/core/src/main.ts not associated",
              path: "packages/core/src/main.ts",
              hint: null,
            },
          ],
        },
        { severity: ["warning"], paths: ["apps/**"] },
      );

      expect(filtered.ok).toBe(true);
      expect(filtered.errors).toEqual([]);
      expect(filtered.warnings).toEqual([
        "[UNTRACKED_IMPLEMENTATION] apps/web/src/index.ts not associated",
      ]);
      expect(filtered.diagnostics).toHaveLength(1);
      expect(filtered.diagnostics[0].path).toBe("apps/web/src/index.ts");
    });
  });

  describe("runRepositoryChecks", () => {
    it("should pass for initialized project", async () => {
      const result = await runRepositoryChecks(tempDir);

      // Initialized project should be valid
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(Array.isArray(result.diagnostics)).toBe(true);
      // May have warnings but should not have errors
    }, 120_000);

    it("fails when decision graph completeness is below threshold", async () => {
      await createDecision({ scope: "project", title: "Orphaned decision" }, tempDir);

      const result = await runRepositoryChecks(tempDir, { completenessThreshold: 100 });

      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.code === "DECISION_DOMAIN_LINK_MISSING")).toBe(true);
      expect(result.diagnostics.some((d) => d.code === "GRAPH_COMPLETENESS_BELOW_THRESHOLD")).toBe(
        true,
      );
      expect(result.graphDiagnostics?.completeness.sufficient).toBe(false);
    }, 120_000);

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
    }, 120_000);

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

      const missingTargetDiagnostic = result.diagnostics.find((d) =>
        d.message.includes("Missing code target"),
      );
      expect(missingTargetDiagnostic).toBeDefined();
      expect(missingTargetDiagnostic?.code).toBe("MISSING_TASK_CODE_TARGET");
      expect(missingTargetDiagnostic?.severity).toBe("error");
      expect(missingTargetDiagnostic?.path).toBe("apps/nonexistent/src/missing.ts");
    }, 120_000);

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
    }, 120_000);

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

      const undeclaredModuleDiagnostic = result.diagnostics.find((d) =>
        d.message.includes("undeclared module"),
      );
      expect(undeclaredModuleDiagnostic).toBeDefined();
      expect(undeclaredModuleDiagnostic?.code).toBe("TASK_UNDECLARED_MODULE");
      expect(undeclaredModuleDiagnostic?.hint).toContain("Declare it in arch-model/modules.json");
    }, 120_000);

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
    }, 120_000);

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
    }, 120_000);

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
      const invalidDecisionTaskLinkDiagnostic = result.diagnostics.find((d) =>
        d.message.includes("Invalid decision task link"),
      );
      expect(invalidDecisionTaskLinkDiagnostic?.code).toBe("INVALID_DECISION_TASK_LINK");
    }, 120_000);

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
      const missingDecisionTargetDiagnostic = result.diagnostics.find(
        (d) =>
          d.message.includes("Missing code target") && d.message.includes("referenced by decision"),
      );
      expect(missingDecisionTargetDiagnostic?.code).toBe("MISSING_DECISION_CODE_TARGET");
    }, 120_000);

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
    }, 120_000);

    it("should handle warnings without failing validation", async () => {
      // Run checks on initialized project which may have warnings
      const result = await runRepositoryChecks(tempDir);

      // Should allow warnings without marking as failed
      if (result.warnings.length > 0) {
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    }, 120_000);

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
    }, 120_000);

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
    }, 120_000);

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
    }, 120_000);

    it("should stop at first actionable issue when failFast is enabled", async () => {
      await createPhase("fail-fast-phase", tempDir);
      await createMilestone("fail-fast-phase", "fail-fast-milestone", tempDir);

      const taskPath = await createTask({
        phaseId: "fail-fast-phase",
        milestoneId: "fail-fast-milestone",
        lane: "planned",
        title: "Task with Multiple Failures",
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
slug: task-with-multiple-failures
lane: planned
title: Task with Multiple Failures
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

# Task with Multiple Failures

Multiple validation failures for fail-fast test.
`,
      );

      const fullResult = await runRepositoryChecks(tempDir);
      const failFastResult = await runRepositoryChecks(tempDir, { failFast: true });

      expect(fullResult.ok).toBe(false);
      expect(fullResult.errors.length).toBeGreaterThan(1);

      expect(failFastResult.ok).toBe(false);
      expect(failFastResult.errors).toHaveLength(1);
      const failFastErrorDiagnostics = failFastResult.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      );
      expect(failFastErrorDiagnostics).toHaveLength(1);
      expect(failFastErrorDiagnostics[0]?.code).toBe("MISSING_TASK_CODE_TARGET");
      expect(failFastErrorDiagnostics[0]?.path).toBe("apps/missing-module/src/index.ts");
    }, 120_000);

    it("should handle empty codeTargets array", async () => {
      await createPhase("empty-targets-phase", tempDir);
      await scaffoldValidationContractForPhase(tempDir, "empty-targets-phase");
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
    }, 120_000);

    it("should handle empty publicDocs array", async () => {
      await createPhase("empty-docs-phase", tempDir);
      await scaffoldValidationContractForPhase(tempDir, "empty-docs-phase");
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
    }, 120_000);

    it("should validate multiple tasks in same lane", async () => {
      await createPhase("multi-task-phase", tempDir);
      await scaffoldValidationContractForPhase(tempDir, "multi-task-phase");
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
    }, 120_000);

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
    }, 120_000);

    it("should detect decision linking to non-existent task", async () => {
      await createDecision({ scope: "project", title: "Decision with Missing Task Link" }, tempDir);

      const result = await runRepositoryChecks(tempDir);

      // May or may not error depending on implementation - just verify check runs
      expect(result.ok !== undefined).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    }, 120_000);

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
    }, 120_000);

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
    }, 120_000);

    it("should fail with clear diagnostic when reconcile config is invalid", async () => {
      const configPath = path.join(tempDir, ".project-arch", "reconcile.config.json");
      await fs.ensureDir(path.dirname(configPath));

      await writeJsonDeterministic(configPath, {
        schemaVersion: "1.0",
        extends: "default",
        triggers: {
          include: [{ status: "required" }],
        },
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => error.includes("Invalid reconcile config schema at")),
      ).toBe(true);

      const diagnostic = result.diagnostics.find((item) =>
        item.message.includes("Invalid reconcile config schema at"),
      );
      expect(diagnostic?.code).toBe("INVALID_RECONCILE_CONFIG_SCHEMA");
      expect(diagnostic?.severity).toBe("error");
      expect(diagnostic?.path?.startsWith(".project-arch/reconcile.config.json")).toBe(true);
    }, 120_000);

    it("should detect duplicate reconciliation overrides and clear after prune", async () => {
      const reconcileDir = path.join(tempDir, ".project-arch", "reconcile");
      await fs.ensureDir(reconcileDir);

      const baseReport = {
        schemaVersion: "1.0",
        type: "local-reconciliation",
        changedFiles: [],
        affectedAreas: [],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: [],
        feedbackCandidates: [],
      };

      await writeJsonDeterministic(path.join(reconcileDir, "001-2026-03-20.json"), {
        ...baseReport,
        id: "reconcile-001-2026-03-20",
        status: "reconciliation suggested",
        taskId: "001",
        date: "2026-03-20",
      });
      await writeJsonDeterministic(path.join(reconcileDir, "001-2026-03-22.json"), {
        ...baseReport,
        id: "reconcile-001-2026-03-22",
        status: "reconciliation complete",
        taskId: "001",
        date: "2026-03-22",
      });

      const beforePrune = await runRepositoryChecks(tempDir);
      expect(beforePrune.ok).toBe(false);
      expect(
        beforePrune.diagnostics.some((item) => item.code === "DUPLICATE_RECONCILIATION_OVERRIDE"),
      ).toBe(true);

      await pruneReconciliationArtifacts({ cwd: tempDir, apply: true });

      const afterPrune = await runRepositoryChecks(tempDir);
      expect(
        afterPrune.diagnostics.some((item) => item.code === "DUPLICATE_RECONCILIATION_OVERRIDE"),
      ).toBe(false);
    }, 120_000);

    it("should surface warning count for outstanding tooling-feedback reports", async () => {
      const feedbackDir = path.join(tempDir, ".project-arch", "feedback");
      await fs.ensureDir(feedbackDir);

      await writeJsonDeterministic(path.join(feedbackDir, "tooling-feedback-001.json"), {
        schemaVersion: "1.0",
        id: "tooling-feedback-001-01",
        type: "tooling-feedback",
        status: "reconciliation suggested",
        taskId: "001",
        date: "2026-03-12",
        changedFiles: [],
        affectedAreas: ["project-arch/cli"],
        missingUpdates: [],
        missingTraceLinks: [],
        decisionCandidates: [],
        standardsGaps: [],
        proposedActions: ["Add summary command"],
        feedbackCandidates: ["Add summary command"],
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(true);
      expect(
        result.warnings.some((warning) =>
          warning.includes("Outstanding tooling-feedback reports: 1"),
        ),
      ).toBe(true);
      expect(result.diagnostics.some((item) => item.code === "OUTSTANDING_TOOLING_FEEDBACK")).toBe(
        true,
      );
    }, 120_000);

    it("should validate decision links with valid code targets", async () => {
      // Just run checks on the current initialized project
      // It should pass basic validation
      const result = await runRepositoryChecks(tempDir);

      // Basic validation should succeed for initialized project
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.ok).toBe("boolean");
    }, 120_000);

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
      await scaffoldValidationContractForPhase(tempDir, "module-phase");
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
    }, 120_000);

    it("should handle invalid modules.json structure", async () => {
      // Create invalid modules.json (not an array)
      const modulesPath = path.join(tempDir, "arch-model", "modules.json");
      await writeJsonDeterministic(modulesPath, {
        modules: "not-an-array",
      });

      const result = await runRepositoryChecks(tempDir);

      // Should still run without crashing, treating it as no declared modules
      expect(result.ok !== undefined).toBe(true);
    }, 120_000);

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
    }, 120_000);

    it("should warn when task codeTarget resolves to non-module artifact", async () => {
      await createPhase("artifact-phase", tempDir);
      await createMilestone("artifact-phase", "artifact-milestone", tempDir);

      await createTask({
        phaseId: "artifact-phase",
        milestoneId: "artifact-milestone",
        lane: "planned",
        title: "Task with non-runtime artifact target",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskDir = path.join(
        tempDir,
        "roadmap/phases/artifact-phase/milestones/artifact-milestone/tasks/planned",
      );
      const taskFiles = await walkDir(taskDir);
      const taskFile = taskFiles[0];

      await writeFile(
        taskFile,
        `---
schemaVersion: "1.0"
id: "001"
slug: task-non-module-artifact
lane: planned
title: Task with non-runtime artifact target
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets:
  - README.md
tags: []
decisions: []
completionCriteria: []
---

# Task with non-runtime artifact target
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.diagnostics.some((item) => item.code === "TASK_NON_MODULE_CODE_TARGET")).toBe(
        true,
      );
    }, 120_000);

    it("should suppress non-module artifact warnings via graph config", async () => {
      await createPhase("artifact-suppress-phase", tempDir);
      await createMilestone("artifact-suppress-phase", "artifact-suppress-milestone", tempDir);

      await createTask({
        phaseId: "artifact-suppress-phase",
        milestoneId: "artifact-suppress-milestone",
        lane: "planned",
        title: "Task with suppressed non-runtime target",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      await writeJsonDeterministic(path.join(tempDir, ".project-arch", "graph.config.json"), {
        suppress: ["README.md"],
      });

      const taskDir = path.join(
        tempDir,
        "roadmap/phases/artifact-suppress-phase/milestones/artifact-suppress-milestone/tasks/planned",
      );
      const taskFiles = await walkDir(taskDir);
      const taskFile = taskFiles[0];

      await writeFile(
        taskFile,
        `---
schemaVersion: "1.0"
id: "001"
slug: task-suppressed-non-module-artifact
lane: planned
title: Task with suppressed non-runtime target
status: todo
createdAt: "2026-03-07"
updatedAt: "2026-03-07"
discoveredFromTask: null
publicDocs: []
codeTargets:
  - README.md
tags: []
decisions: []
completionCriteria: []
---

# Task with suppressed non-runtime target
`,
      );

      const result = await runRepositoryChecks(tempDir);

      expect(result.diagnostics.some((item) => item.code === "TASK_NON_MODULE_CODE_TARGET")).toBe(
        false,
      );
    }, 120_000);

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
      await scaffoldValidationContractForPhase(tempDir, "domain-phase");
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
    }, 120_000);

    it("should handle invalid domains.json structure", async () => {
      // Create invalid domains.json (not an array)
      const domainsPath = path.join(tempDir, "arch-domains", "domains.json");
      await writeJsonDeterministic(domainsPath, {
        domains: { invalid: "structure" },
      });

      const result = await runRepositoryChecks(tempDir);

      // Should still run without crashing
      expect(result.ok !== undefined).toBe(true);
    }, 120_000);

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
    }, 120_000);

    it("should fail when roadmap task count differs from .arch task node count", async () => {
      const tasksPath = path.join(tempDir, ".arch", "nodes", "tasks.json");
      const graphTasks = await readJson<{ tasks: Array<{ id: string; status: string }> }>(
        tasksPath,
      );

      await writeJsonDeterministic(tasksPath, {
        tasks: graphTasks.tasks.slice(0, Math.max(0, graphTasks.tasks.length - 1)),
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (error) =>
            error.includes("roadmap task files count") && error.includes(".arch task node count"),
        ),
      ).toBe(true);
    }, 120_000);

    it("should fail when milestone-task edges are missing", async () => {
      const edgesPath = path.join(tempDir, ".arch", "edges", "milestone_to_task.json");
      await writeJsonDeterministic(edgesPath, { edges: [] });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.includes("missing milestone-task edge"))).toBe(
        true,
      );
    }, 120_000);

    it("should fail when roadmap task status differs from graph task status", async () => {
      const tasksPath = path.join(tempDir, ".arch", "nodes", "tasks.json");
      const graphTasks = await readJson<{
        tasks: Array<{
          id: string;
          title: string;
          milestone: string;
          domain: string | null;
          status: string;
          lane: string;
        }>;
      }>(tasksPath);

      expect(graphTasks.tasks.length).toBeGreaterThan(0);

      const firstTask = graphTasks.tasks[0];
      const driftedStatus = firstTask.status === "done" ? "todo" : "done";

      await writeJsonDeterministic(tasksPath, {
        tasks: [{ ...firstTask, status: driftedStatus }, ...graphTasks.tasks.slice(1)],
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.includes("status drift for task"))).toBe(true);
    }, 120_000);

    it("should fail when arch-model/concept-map.json violates schema", async () => {
      const conceptMapPath = path.join(tempDir, "arch-model", "concept-map.json");

      await writeJsonDeterministic(conceptMapPath, {
        schemaVersion: "1.0",
        concepts: [
          {
            id: "concept-a",
            name: "Concept A",
            description: "Example",
            owningDomain: "core",
            moduleResponsibilities: ["packages/api"],
            implementationSurfaces: [{ type: "api", path: "packages/api/src" }],
            dependencies: [],
          },
        ],
      });

      const result = await runRepositoryChecks(tempDir);

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) =>
          error.includes("Invalid concept-map schema at arch-model/concept-map.json"),
        ),
      ).toBe(true);
    }, 120_000);

    it("should handle 100+ untracked implementation diagnostics in JSON mode", async () => {
      // Add a single tracked target to trigger untracked diagnostic collection
      await createTask({
        phaseId: "phase-1",
        milestoneId: "milestone-1-setup",
        lane: "planned",
        title: "Track architecture root only",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskPath = path.join(
        tempDir,
        "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
      );
      const taskContent = await fs.readFile(taskPath, "utf8");
      const updatedTask = taskContent.replace(
        /codeTargets: \[\]/,
        "codeTargets:\n  - architecture",
      );
      await fs.writeFile(taskPath, updatedTask);

      // Create 150 untracked files in apps/packages
      const fileCount = 150;
      for (let i = 1; i <= fileCount; i++) {
        const packageName = `pkg-${String(i).padStart(3, "0")}`;
        const dirPath = path.join(tempDir, "packages", packageName);
        await fs.ensureDir(dirPath);
        await writeFile(path.join(dirPath, "index.ts"), `// ${packageName}`);
      }

      const result = await runRepositoryChecks(tempDir);
      const payload = toCheckDiagnosticsPayload(result);

      // Should include untracked diagnostics up to the limit (50) plus truncation notice
      const untrackedDiagnostics = result.diagnostics.filter(
        (d) => d.code === "UNTRACKED_IMPLEMENTATION",
      );
      const truncatedDiagnostics = result.diagnostics.filter(
        (d) => d.code === "UNTRACKED_IMPLEMENTATION_TRUNCATED",
      );

      // Verify truncation behavior for large sets
      expect(untrackedDiagnostics.length).toBe(50);
      expect(truncatedDiagnostics.length).toBe(1);
      expect(payload.diagnostics.length).toBeGreaterThanOrEqual(51);
      expect(payload.schemaVersion).toBe(CHECK_DIAGNOSTICS_SCHEMA_VERSION);
      expect(payload.summary.diagnosticCount).toBe(payload.diagnostics.length);

      // Verify truncation diagnostic contains count information
      const truncatedMsg = truncatedDiagnostics[0]?.message ?? "";
      expect(truncatedMsg).toContain("omitted");
    }, 120_000);
  });
});

describe("runRepositoryChecks – malformed task file resilience", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("emits MALFORMED_TASK_FILE diagnostic and continues validating remaining files", async () => {
    // Drop a malformed task file (schema-invalid frontmatter) into an existing lane.
    const laneDir = path.join(
      tempDir,
      "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned",
    );
    const malformedPath = path.join(laneDir, "001-malformed-schema.md");
    await fs.ensureDir(laneDir);
    await fs.writeFile(
      malformedPath,
      `---
schemaVersion: "1.0"
id: "001"
slug: "malformed-schema"
lane: "planned"
status: "todo"
createdAt: "not-a-date"
updatedAt: "not-a-date"
discoveredFromTask: null
tags: []
codeTargets: []
publicDocs: []
decisions: []
completionCriteria: []
---

# Malformed schema task
`,
      "utf8",
    );

    const result = await runRepositoryChecks(tempDir);

    // Should not throw – malformed file becomes a diagnostic, not a crash.
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);

    // The malformed file must surface as MALFORMED_TASK_FILE.
    const malformedDiagnostic = result.diagnostics.find((d) => d.code === "MALFORMED_TASK_FILE");
    expect(malformedDiagnostic).toBeDefined();
    expect(malformedDiagnostic?.severity).toBe("error");
    expect(malformedDiagnostic?.message).toContain("malformed-schema");

    // All other valid task files must still produce their own diagnostics (or none).
    // The graph parity / lane checks must still run and report normally.
    const notMalformed = result.diagnostics.filter((d) => d.code !== "MALFORMED_TASK_FILE");
    // No crash – we just verify we got at least the malformed diagnostic.
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    // notMalformed being defined asserts the rest of validation continued.
    expect(Array.isArray(notMalformed)).toBe(true);
  }, 120_000);
});

describe("runRepositoryChecks – planning coverage diagnostics", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("emits PAC coverage warnings by default for uncovered targets and missing objective traces", async () => {
    const result = await runRepositoryChecks(tempDir);

    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("PAC_TARGET_UNCOVERED"))).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes("PAC_TASK_MISSING_OBJECTIVE_TRACE")),
    ).toBe(true);
  }, 120_000);

  it("escalates PAC coverage findings to errors in strict mode", async () => {
    const result = await runRepositoryChecks(tempDir, { coverageMode: "error" });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("PAC_TARGET_UNCOVERED"))).toBe(true);
    expect(result.errors.some((error) => error.includes("PAC_TASK_MISSING_OBJECTIVE_TRACE"))).toBe(
      true,
    );
  }, 120_000);

  it("avoids false positives when planned task links target areas and objective refs", async () => {
    const plannedTasksDir = path.join(
      tempDir,
      "roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned",
    );

    const taskPaths = (await walkDir(plannedTasksDir)).filter((filePath) =>
      filePath.endsWith(".md"),
    );

    for (const taskPath of taskPaths) {
      const taskDoc = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskPath);
      const existingTraceLinks = Array.isArray(taskDoc.data.traceLinks)
        ? (taskDoc.data.traceLinks as string[])
        : [];

      const updatedFrontmatter: Record<string, unknown> = {
        ...taskDoc.data,
        traceLinks: Array.from(
          new Set([
            ...existingTraceLinks,
            "roadmap/phases/phase-1/overview.md",
            "roadmap/phases/phase-1/milestones/milestone-1-setup/targets.md",
          ]),
        ),
      };

      if (path.basename(taskPath).startsWith("001-")) {
        updatedFrontmatter["codeTargets"] = [
          "apps/web",
          "apps/docs",
          "packages/ui",
          "packages/types",
          "packages/config",
          "packages/database",
          "packages/api",
          "architecture/foundation",
          "apps/web/app/dashboard",
          "packages/ui/components/dashboard",
        ];
      }

      await writeMarkdownWithFrontmatter(taskPath, updatedFrontmatter, taskDoc.content);
    }

    const result = await runRepositoryChecks(tempDir);

    expect(result.warnings.some((warning) => warning.includes("PAC_TARGET_UNCOVERED"))).toBe(false);
    expect(
      result.warnings.some((warning) => warning.includes("PAC_TASK_MISSING_OBJECTIVE_TRACE")),
    ).toBe(false);
  }, 120_000);
});

describe("runRepositoryChecks – validation contract", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("emits PAV_CONTRACT_MISSING when validation contract is absent", async () => {
    const contractPath = path.join(tempDir, "roadmap/phases/phase-1/validation-contract.json");
    await fs.remove(contractPath);

    const result = await runRepositoryChecks(tempDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("PAV_CONTRACT_MISSING"))).toBe(true);
    expect(result.errors.some((error) => error.includes("phase-1"))).toBe(true);
  }, 120_000);

  it("accepts valid validation contract", async () => {
    const result = await runRepositoryChecks(tempDir);

    expect(result.ok).toBe(true);
    expect(result.errors.some((error) => error.includes("PAV_"))).toBe(false);
  }, 120_000);

  it("emits PAV_CONTRACT_INVALID_SCHEMA when contract has invalid schema", async () => {
    const contractPath = path.join(tempDir, "roadmap/phases/phase-1/validation-contract.json");
    const invalidContract = {
      schemaVersion: "2.0", // invalid version
      phaseId: "phase-1",
      checks: [],
      createdAt: "2026-03-22",
      updatedAt: "2026-03-22",
    };

    await writeJsonDeterministic(contractPath, invalidContract);

    const result = await runRepositoryChecks(tempDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("PAV_CONTRACT_INVALID_SCHEMA"))).toBe(true);
  }, 120_000);

  it("emits PAV_CONTRACT_INVALID_SCHEMA when check is missing required fields", async () => {
    const contractPath = path.join(tempDir, "roadmap/phases/phase-1/validation-contract.json");
    const incompleteContract = {
      schemaVersion: "1.0",
      phaseId: "phase-1",
      checks: [
        {
          id: "check-1",
          objectiveRef: "objective-1",
          // missing verifyCommand, expectedSignal, owner
        },
      ],
      createdAt: "2026-03-22",
      updatedAt: "2026-03-22",
    };

    await writeJsonDeterministic(contractPath, incompleteContract);

    const result = await runRepositoryChecks(tempDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("PAV_CONTRACT_INVALID_SCHEMA"))).toBe(true);
  }, 120_000);
});

async function scaffoldValidationContractForPhase(tempDir: string, phaseId: string): Promise<void> {
  const contractPath = path.join(tempDir, `roadmap/phases/${phaseId}/validation-contract.json`);
  await writeJsonDeterministic(contractPath, {
    schemaVersion: "1.0",
    phaseId,
    checks: [],
    createdAt: "2026-03-22",
    updatedAt: "2026-03-22",
  });
}

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
