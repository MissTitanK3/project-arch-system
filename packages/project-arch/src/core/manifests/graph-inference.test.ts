import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, linkDecision } from "../decisions/createDecision";
import { rebuildArchitectureGraph } from "./graph";
import { readJson, readMarkdownWithFrontmatter } from "../../fs";
import { writeFile } from "../../fs";

describe.sequential("core/manifests/graph - inference branches", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("domain inference (tag-based)", () => {
    it("should infer domain from task tags using domain:X syntax", async () => {
      const phaseId = "tag-phase";
      const milestoneId = "tag-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Setup domains
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "auth",
              ownedPackages: [],
              ownedFeatures: [],
            },
          ],
        }),
      );

      // Create task with domain:X tag
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Task with Domain Tag",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Add domain tag - use the domain name directly as a tag
      const taskFileContent = await fs.readFile(taskPath, "utf-8");
      const updatedTask = taskFileContent.replace(/(tags:\s*)\[\]/, "$1\n  - auth");
      await writeFile(taskPath, updatedTask);

      await rebuildArchitectureGraph(tempDir);

      const tasks = await readJson<{ tasks: Array<{ id: string; domain: string | null }> }>(
        path.join(tempDir, ".arch", "nodes", "tasks.json"),
      );
      const taskWithDomain = tasks.tasks.find((t) => t.id.includes(phaseId));
      expect(taskWithDomain?.domain).toBe("auth");
    }, 15_000);
  });

  describe("domain inference (feature-based)", () => {
    it("should infer domain from task using feature tags", async () => {
      const phaseId = "feature-phase";
      const milestoneId = "feature-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Setup domains with features
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "security",
              ownedPackages: [],
              ownedFeatures: ["authentication", "oauth-flow"],
            },
          ],
        }),
      );

      // Create task with feature slug
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Authentication Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Update task slug to match feature
      const taskFileContent = await fs.readFile(taskPath, "utf-8");
      const updatedTask = taskFileContent.replace(/slug:\s*[^\n]+/, "slug: authentication-setup");
      await writeFile(taskPath, updatedTask);

      await rebuildArchitectureGraph(tempDir);

      const tasks = await readJson<{ tasks: Array<{ id: string; domain: string | null }> }>(
        path.join(tempDir, ".arch", "nodes", "tasks.json"),
      );
      const taskWithDomain = tasks.tasks.find((t) => t.id.includes(phaseId));
      expect(taskWithDomain?.domain).toBe("security");
    }, 15_000);
  });

  describe("domain inference (package-based)", () => {
    it("should infer domain from task codeTargets matching owned packages", async () => {
      const phaseId = "package-phase";
      const milestoneId = "package-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Setup domains with owned packages
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "ui",
              ownedPackages: ["packages/ui-kit"],
              ownedFeatures: [],
            },
          ],
        }),
      );

      // Create task with codeTarget in owned package
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "UI Package Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Add codeTarget to owned package
      const taskFileContent = await fs.readFile(taskPath, "utf-8");
      const updatedTask = taskFileContent.replace(
        /(codeTargets:\s*)\[\]/,
        "$1\n  - packages/ui-kit/src/button.tsx",
      );
      await writeFile(taskPath, updatedTask);

      await rebuildArchitectureGraph(tempDir);

      const tasks = await readJson<{ tasks: Array<{ id: string; domain: string | null }> }>(
        path.join(tempDir, ".arch", "nodes", "tasks.json"),
      );
      const taskWithDomain = tasks.tasks.find((t) => t.id.includes(phaseId));
      expect(taskWithDomain?.domain).toBe("ui");
    }, 15_000);
  });

  describe("domain inference (no match)", () => {
    it("should return null domain when no inference matches", async () => {
      const phaseId = "no-domain-phase";
      const milestoneId = "no-domain-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Setup domains that won't match
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "payments",
              ownedPackages: ["packages/payments"],
              ownedFeatures: ["stripe", "payment-processing"],
            },
          ],
        }),
      );

      // Create task with no matching domain signals
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Unrelated Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskFileContent = await fs.readFile(taskPath, "utf-8");
      const updatedTask = taskFileContent.replace(/(codeTargets:\s*)\[\]/, "$1\n  - README.md");
      await writeFile(taskPath, updatedTask);

      await rebuildArchitectureGraph(tempDir);

      const tasks = await readJson<{ tasks: Array<{ id: string; domain: string | null }> }>(
        path.join(tempDir, ".arch", "nodes", "tasks.json"),
      );
      const taskWithoutDomain = tasks.tasks.find((t) => t.id.includes(phaseId));
      expect(taskWithoutDomain?.domain).toBeNull();
    }, 15_000);
  });

  describe("decision domain inference", () => {
    it("should infer decision domains from linked task domains", async () => {
      const phaseId = "decision-phase";
      const milestoneId = "decision-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Setup domain
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "api",
              ownedPackages: ["packages/api"],
              ownedFeatures: [],
            },
          ],
        }),
      );

      // Create task with domain
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "API Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskContent = await readMarkdownWithFrontmatter<{ id: string }>(taskPath);
      const taskId = taskContent.data.id;
      const taskRef = `${phaseId}/${milestoneId}/${taskId}`;

      // Add codeTarget to owned package so task gets domain inferred
      const taskFileContent = await fs.readFile(taskPath, "utf-8");
      const updatedTask = taskFileContent.replace(
        /(codeTargets:\s*)\[\]/,
        "$1\n  - packages/api/src/routes.ts",
      );
      await writeFile(taskPath, updatedTask);

      // Create decision and link to task
      const decisionPath = await createDecision(
        { scope: "milestone", phase: phaseId, milestone: milestoneId, title: "Decision" },
        tempDir,
      );
      const decisionFullPath = path.join(tempDir, decisionPath);
      const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(decisionFullPath);
      const decisionId = decisionDoc.data.id;

      await linkDecision(decisionId, { task: taskRef }, tempDir);

      await rebuildArchitectureGraph(tempDir);

      const edges = await readJson<{ edges: Array<{ decision: string; domain: string }> }>(
        path.join(tempDir, ".arch", "edges", "decision_to_domain.json"),
      );

      expect(edges.edges.some((e) => e.decision === decisionId && e.domain === "api")).toBe(true);
    }, 15_000);
  });

  describe("decision code target domain inference", () => {
    it("should infer decision domains from code target package ownership", async () => {
      const phaseId = "decision-pkg-phase";
      const milestoneId = "decision-pkg-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Setup domain
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "data",
              ownedPackages: ["packages/database"],
              ownedFeatures: [],
            },
          ],
        }),
      );

      // Create decision with code target in owned package
      const decisionPath = await createDecision(
        { scope: "phase", phase: phaseId, title: "Database Decision" },
        tempDir,
      );

      const decisionFullPath = path.join(tempDir, decisionPath);
      const decisionDoc = await readMarkdownWithFrontmatter<{
        id: string;
        links: { codeTargets: string[] };
      }>(decisionFullPath);
      const decisionId = decisionDoc.data.id;

      // Link to code target
      await linkDecision(decisionId, { code: "packages/database/src/schema.ts" }, tempDir);

      await rebuildArchitectureGraph(tempDir);

      const edges = await readJson<{ edges: Array<{ decision: string; domain: string }> }>(
        path.join(tempDir, ".arch", "edges", "decision_to_domain.json"),
      );

      expect(edges.edges.some((e) => e.decision === decisionId && e.domain === "data")).toBe(true);
    }, 15_000);
  });
});
